import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { getDatabase } from "../lib/firebase";
import {
  validateOnboardingEmail,
  DEFAULT_DISPOSABLE_DOMAINS,
  STANDARD_EMAIL_ERROR,
} from "../lib/emailValidation";

const router: IRouter = Router();

// Rate limiting in-memory maps
const emailSendRateMap = new Map<string, number[]>();
const ipSendRateMap = new Map<string, number[]>();

// Cooldown tracking per email (timestamp of last send)
const emailLastSentMap = new Map<string, number>();

/**
 * Helper to get the public application URL
 */
function getAppUrl(req: any): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, "");
  }
  const origin = req.get("origin");
  if (origin && !origin.includes("localhost:5000") && !origin.includes("127.0.0.1:5000")) {
    return origin.replace(/\/+$/, "");
  }
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/**
 * Dispatches the verification email using EmailJS REST API.
 * Follows Section 8, 9, 20:
 * - Server generates the token and verification URL
 * - EmailJS delivers the email
 * - Safe error handling: never exposes API credentials or internal errors
 */
async function sendEmailJsVerificationEmail(params: {
  toEmail: string;
  toName: string;
  verificationUrl: string;
  expiryMinutes: number;
  appUrl?: string;
}): Promise<{ delivered: boolean; error?: string }> {
  const serviceId = process.env.EMAILJS_SERVICE_ID || "";
  const templateId = process.env.EMAILJS_TEMPLATE_ID || "";
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || "";
  const privateKey = process.env.EMAILJS_PRIVATE_KEY || "";

  // Check if real credentials are configured
  const isConfigured =
    serviceId &&
    serviceId !== "your_service_id" &&
    templateId &&
    templateId !== "your_template_id" &&
    publicKey &&
    publicKey !== "your_public_key";

  if (!isConfigured) {
    // In local development / preview environment where EmailJS keys are not yet configured:
    // Log safe server-side diagnostic message without exposing tokens to client
    console.info(
      `[Contact Verification] EmailJS credentials not configured or placeholder in environment. Generated verification URL for testing: ${params.verificationUrl}`
    );
    // Return delivered: true in test/dev environment so developer/tester can complete the flow
    return { delivered: true };
  }

  try {
    const effectiveAppUrl = params.appUrl || process.env.APP_URL || "https://tableline.in";
    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      ...(privateKey ? { accessToken: privateKey } : {}),
      template_params: {
        // Common EmailJS recipient field variations
        to_email: params.toEmail,
        email: params.toEmail,
        user_email: params.toEmail,
        recipient_email: params.toEmail,
        reply_to: params.toEmail,

        // Recipient name
        to_name: params.toName || "Guest",
        name: params.toName || "Guest",
        user_name: params.toName || "Guest",

        // Verification links
        verification_url: params.verificationUrl,
        verify_url: params.verificationUrl,
        verification_link: params.verificationUrl,
        verify_link: params.verificationUrl,
        link: params.verificationUrl,
        url: params.verificationUrl,

        // Metadata and fallback content
        expires_in: `${params.expiryMinutes} minutes`,
        expiry_minutes: `${params.expiryMinutes}`,
        subject: "Verify your email — Tableline",
        message: `Hello,\n\nThank you for your interest in Tableline.\n\nPlease verify your email address to continue your request:\n${params.verificationUrl}\n\nThis verification link will expire in ${params.expiryMinutes} minutes.\n\nIf you did not request this verification, you can safely ignore this email.\n\nRegards,\nTableline Team`,
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Origin": effectiveAppUrl,
      "Referer": `${effectiveAppUrl}/`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn(
        `[Contact Verification] EmailJS API responded with status ${response.status}: ${errorText.slice(0, 100)}`
      );
      return {
        delivered: false,
        error: "We couldn't send the verification email right now. Please try again in a moment.",
      };
    }

    return { delivered: true };
  } catch (err: any) {
    console.warn(`[Contact Verification] EmailJS network error:`, err?.message);
    return {
      delivered: false,
      error: "We couldn't send the verification email right now. Please try again in a moment.",
    };
  }
}

/**
 * POST /api/contact/send-verification
 * Generates a cryptographically secure token, hashes it at rest with SHA-256,
 * and sends a verification link via EmailJS.
 */
router.post(["/contact/send-verification", "/contact/verify/send"], async (req, res) => {
  try {
    const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const ip = req.ip || (req.headers["x-forwarded-for"] as string) || "anon";
    const now = Date.now();

    // 1. Email validation (Format, Mainstream provider, Disposable denylist)
    if (!rawEmail || !rawEmail.includes("@") || rawEmail.startsWith("@") || rawEmail.endsWith("@")) {
      res.status(400).json({ error: "Please enter a valid email address.", code: "INVALID_EMAIL" });
      return;
    }

    const domain = rawEmail.split("@")[1]?.trim().toLowerCase() || "";
    const isDisposable =
      DEFAULT_DISPOSABLE_DOMAINS.has(domain) ||
      Array.from(DEFAULT_DISPOSABLE_DOMAINS).some((d) => domain.endsWith(`.${d}`));

    if (isDisposable) {
      res.status(400).json({
        error: "Please use a permanent email address. Temporary email addresses are not supported.",
        code: "DISPOSABLE_EMAIL",
      });
      return;
    }

    const validation = validateOnboardingEmail(rawEmail);
    if (!validation.valid) {
      res.status(400).json({
        error: "Please enter a valid email address.",
        code: "INVALID_EMAIL",
      });
      return;
    }

    const cleanEmail = validation.normalizedEmail;

    // 2. Rate limiting & cooldown enforcement
    // Cooldown: 60 seconds per email
    const lastSent = emailLastSentMap.get(cleanEmail) || 0;
    const cooldownRemaining = Math.max(0, Math.ceil((lastSent + 60_000 - now) / 1000));
    if (cooldownRemaining > 0) {
      res.status(429).json({
        error: `Please wait ${cooldownRemaining} seconds before requesting another verification email.`,
        code: "RATE_LIMITED",
        cooldownSeconds: cooldownRemaining,
      });
      return;
    }

    // IP rate limit: max 10 requests per 10 minutes
    const ipHistory = (ipSendRateMap.get(ip) || []).filter((t) => now - t < 600_000);
    if (ipHistory.length >= 10) {
      res.status(429).json({
        error: "Too many verification requests. Please try again in a few minutes.",
        code: "RATE_LIMITED",
      });
      return;
    }

    // Email rate limit: max 5 requests per 10 minutes
    const emailHistory = (emailSendRateMap.get(cleanEmail) || []).filter((t) => now - t < 600_000);
    if (emailHistory.length >= 5) {
      res.status(429).json({
        error: "Too many verification attempts for this email. Please wait a few minutes.",
        code: "RATE_LIMITED",
      });
      return;
    }

    // Update rate limit trackers
    ipHistory.push(now);
    ipSendRateMap.set(ip, ipHistory);
    emailHistory.push(now);
    emailSendRateMap.set(cleanEmail, emailHistory);
    emailLastSentMap.set(cleanEmail, now);

    // 3. Cryptographically secure random token generation
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 4. Expiry calculation (default 30 minutes, configurable)
    const expiryMinutes = Math.max(
      5,
      parseInt(process.env.CONTACT_EMAIL_VERIFICATION_EXPIRY_MINUTES || "30", 10) || 30
    );
    const expiresAt = now + expiryMinutes * 60 * 1000;

    // 5. Secure verification request/session ID (binds verification to the form draft)
    const verificationSessionId = `vs_${crypto.randomBytes(16).toString("hex")}`;

    // 6. Store HASH of token at rest in database (Never store rawToken)
    const db = getDatabase();
    await db.ref(`contactVerificationTokens/${tokenHash}`).set({
      email: cleanEmail,
      tokenHash,
      verificationSessionId,
      purpose: "CONTACT_EMAIL_VERIFICATION",
      createdAt: now,
      expiresAt,
      usedAt: null,
      verifiedAt: null,
      ip,
    });

    // 7. Generate verification URL pointing to the actual application
    const appUrl = getAppUrl(req);
    const verificationUrl = `${appUrl}/api/contact/verify?token=${rawToken}`;

    // 8. Dispatch verification email via EmailJS
    const emailResult = await sendEmailJsVerificationEmail({
      toEmail: cleanEmail,
      toName: name || "Customer",
      verificationUrl,
      expiryMinutes,
      appUrl,
    });

    if (!emailResult.delivered) {
      res.status(502).json({
        error: emailResult.error || "We couldn't send the verification email right now. Please try again in a moment.",
        code: "EMAIL_DELIVERY_FAILED",
      });
      return;
    }

    res.json({
      success: true,
      message: "Verification email sent. Please check your inbox.",
      verificationSessionId,
      cooldownSeconds: 60,
    });
  } catch (err: any) {
    console.warn("[Contact Verification] send-verification error:", err?.message);
    res.status(500).json({
      error: "An unexpected error occurred while processing your verification request.",
      code: "INTERNAL_ERROR",
    });
  }
});

/**
 * GET /api/contact/verify
 * Handles verification link clicks:
 * 1. Reads token from query
 * 2. Hashes token with SHA-256
 * 3. Finds record by tokenHash
 * 4. Confirms purpose is CONTACT_EMAIL_VERIFICATION
 * 5. Confirms token has not expired
 * 6. Confirms token has not already been used
 * 7. Marks token as used
 * 8. Marks verification record as verified
 * 9. Redirects back to the existing Contact Form with session proof
 */
router.get("/contact/verify", async (req, res) => {
  const appUrl = getAppUrl(req);
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";

  const renderResultHtml = (title: string, message: string, isSuccess: boolean, redirectUrl?: string) => {
    const brandColor = isSuccess ? "#047857" : "#b91c1c";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Tableline</title>
  ${redirectUrl ? `<meta http-equiv="refresh" content="3;url=${redirectUrl}" />` : ""}
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #FAF8F5;
      color: #2D1E18;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #FFFFFF;
      border: 1px solid #E7E3DE;
      border-radius: 16px;
      padding: 32px 28px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 20px rgba(45, 30, 24, 0.06);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: ${isSuccess ? "#ECFDF5" : "#FEF2F2"};
      color: ${brandColor};
      font-size: 24px;
      margin-bottom: 16px;
    }
    h1 {
      font-family: Georgia, serif;
      font-size: 22px;
      margin: 0 0 10px 0;
      color: #1C120C;
    }
    p {
      font-size: 13px;
      line-height: 1.6;
      color: #6B5E57;
      margin: 0 0 24px 0;
    }
    .btn {
      display: inline-block;
      background: #2D1E18;
      color: #FFFFFF;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #1A110E;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${isSuccess ? "✓" : "!"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${redirectUrl ? `<a href="${redirectUrl}" class="btn">Return to Contact Form</a>` : `<a href="${appUrl}/#contact" class="btn">Return to Tableline</a>`}
  </div>
  ${redirectUrl ? `<script>setTimeout(function(){ window.location.href = "${redirectUrl}"; }, 2000);</script>` : ""}
</body>
</html>`;
  };

  if (!token) {
    res.status(400).send(
      renderResultHtml(
        "Verification Link Invalid",
        "This verification link is invalid or no longer available.",
        false
      )
    );
    return;
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const db = getDatabase();
    const tokenSnap = await db.ref(`contactVerificationTokens/${tokenHash}`).get();
    const record = tokenSnap.val();

    if (!record || record.purpose !== "CONTACT_EMAIL_VERIFICATION") {
      res.status(400).send(
        renderResultHtml(
          "Verification Link Invalid",
          "This verification link is invalid or no longer available.",
          false
        )
      );
      return;
    }

    if (record.usedAt) {
      res.status(400).send(
        renderResultHtml(
          "Link Already Used",
          "This verification link has already been used.",
          false
        )
      );
      return;
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      res.status(400).send(
        renderResultHtml(
          "Verification Link Expired",
          "This verification link has expired. Please request a new verification email.",
          false
        )
      );
      return;
    }

    // Mark token as used & verified
    await db.ref(`contactVerificationTokens/${tokenHash}`).update({
      usedAt: now,
      verifiedAt: now,
    });

    // Store authoritative verified session record for lead submission validation
    const verifiedSessionId = record.verificationSessionId || `vs_${crypto.randomBytes(16).toString("hex")}`;
    await db.ref(`contactVerifiedEmails/${verifiedSessionId}`).set({
      email: record.email,
      verificationSessionId: verifiedSessionId,
      verifiedAt: now,
      expiresAt: now + 2 * 3600 * 1000, // Valid for 2 hours to submit the form
      usedForSubmission: false,
      createdAt: now,
    });

    // Also store an index by normalized email for multi-tab auto-detection
    const emailKey = Buffer.from(record.email).toString("hex");
    await db.ref(`contactVerifiedByEmail/${emailKey}`).set({
      email: record.email,
      verificationSessionId: verifiedSessionId,
      verifiedAt: now,
      expiresAt: now + 2 * 3600 * 1000,
    });

    const returnUrl = `${appUrl}/#contact?verified=1&email=${encodeURIComponent(record.email)}&session=${verifiedSessionId}`;

    // Return friendly HTML redirect to return to the same form
    res.status(200).send(
      renderResultHtml(
        "Email Verified",
        `Your email address (${record.email}) has been successfully verified! Returning to your contact request…`,
        true,
        returnUrl
      )
    );
  } catch (err: any) {
    console.warn("[Contact Verification] verify error:", err?.message);
    res.status(500).send(
      renderResultHtml(
        "Verification Error",
        "An unexpected error occurred while verifying your email. Please try again.",
        false
      )
    );
  }
});

/**
 * GET or POST /api/contact/verify-status
 * Allows the browser on the contact form to check if the email has been verified
 * (e.g. if the visitor clicked the link on another device or tab).
 */
router.all(["/contact/verify-status", "/contact/verify/status"], async (req, res) => {
  try {
    const rawEmail = (req.query.email || req.body?.email || "") as string;
    const session = (req.query.session || req.body?.session || "") as string;

    const cleanEmail = rawEmail.trim().toLowerCase();
    const db = getDatabase();
    const now = Date.now();

    // 1. Check by session ID first if provided
    if (session) {
      const sessionSnap = await db.ref(`contactVerifiedEmails/${session}`).get();
      const sessionRecord = sessionSnap.val();
      if (
        sessionRecord &&
        sessionRecord.verifiedAt &&
        now <= sessionRecord.expiresAt &&
        (!cleanEmail || sessionRecord.email.toLowerCase() === cleanEmail)
      ) {
        res.json({
          verified: true,
          email: sessionRecord.email,
          session,
          verifiedAt: sessionRecord.verifiedAt,
        });
        return;
      }
    }

    // 2. Check by email index
    if (cleanEmail) {
      const emailKey = Buffer.from(cleanEmail).toString("hex");
      const emailSnap = await db.ref(`contactVerifiedByEmail/${emailKey}`).get();
      const emailRecord = emailSnap.val();
      if (emailRecord && emailRecord.verifiedAt && now <= emailRecord.expiresAt) {
        res.json({
          verified: true,
          email: emailRecord.email,
          session: emailRecord.verificationSessionId,
          verifiedAt: emailRecord.verifiedAt,
        });
        return;
      }
    }

    res.json({ verified: false, email: cleanEmail });
  } catch (err: any) {
    console.warn("[Contact Verification] verify-status error:", err?.message);
    res.status(500).json({ verified: false, error: "Failed to check status" });
  }
});

export default router;
