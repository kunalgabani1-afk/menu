import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  getFirebaseAuth,
  reloadCurrentUser,
  sendVerificationEmail,
  verifyEmailCode,
  signOutCurrentUser,
  getIdToken,
  signUpWithEmail,
} from "../lib/firebase";
import { validateEmailAddress } from "../lib/emailValidation";
import { CheckCircle2, Mail, RefreshCw, AlertCircle, ArrowRight, ShieldCheck, Edit3 } from "lucide-react";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "waiting" | "verified" | "unverified" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Resend cooldown timer in seconds
  const [cooldown, setCooldown] = useState<number>(0);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  // Change email modal / inline form
  const [isChangingEmail, setIsChangingEmail] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>("");
  const [changeEmailError, setChangeEmailError] = useState<string | null>(null);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState<boolean>(false);

  // Pending onboarding reference
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);

  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown > 0) {
      cooldownTimerRef.current = setTimeout(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [cooldown]);

  // Initial load: parse query params, check currentUser, or process incoming oobCode link
  useEffect(() => {
    let isMounted = true;

    async function initVerification() {
      try {
        const search = window.location.search;
        const params = new URLSearchParams(search);
        const paramEmail = params.get("email");
        const mode = params.get("mode");
        const oobCode = params.get("oobCode");
        const leadIdParam = params.get("leadId");

        // Check if there is a pending onboarding lead stored
        let storedLeadId = leadIdParam;
        if (!storedLeadId && typeof window !== "undefined") {
          try {
            const raw = window.sessionStorage.getItem("tableline_pending_onboarding");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.leadId) storedLeadId = parsed.leadId;
              if (parsed?.email && !paramEmail) setEmail(parsed.email);
            }
          } catch {}
        }
        if (storedLeadId) setPendingLeadId(storedLeadId);

        // 1. If an action code was provided in the URL (User clicked link in their email)
        if (oobCode && (mode === "verifyEmail" || !mode)) {
          setStatus("loading");
          try {
            await verifyEmailCode(oobCode);
            await reloadCurrentUser();
            if (isMounted) {
              setStatus("verified");
              setSuccessNotice("Your email address has been successfully verified!");
            }
            return;
          } catch (err: any) {
            if (isMounted) {
              setStatus("error");
              setErrorMessage(
                err?.message?.includes("expired")
                  ? "This verification link has expired. Please request a new verification email below."
                  : "Invalid or already used verification link. Please sign in or request a fresh link."
              );
            }
            return;
          }
        }

        // 2. Check current authenticated user in Firebase
        const auth = getFirebaseAuth();
        const user = auth?.currentUser;

        if (user) {
          if (user.email) setEmail(user.email);

          // Fast reload to check latest authoritative state
          await reloadCurrentUser().catch(() => {});
          const refreshed = auth?.currentUser;

          if (refreshed?.emailVerified) {
            if (isMounted) {
              setStatus("verified");
            }
            return;
          } else {
            if (isMounted) {
              setStatus("waiting");
            }
            return;
          }
        }

        // 3. Not signed in, but email provided in URL/storage
        if (paramEmail) {
          setEmail(paramEmail);
          if (isMounted) setStatus("waiting");
          return;
        }

        // Default state if nothing found
        if (isMounted) {
          setStatus("waiting");
        }
      } catch (err: any) {
        console.warn("Verification init exception:", err);
        if (isMounted) setStatus("waiting");
      }
    }

    initVerification();

    return () => {
      isMounted = false;
    };
  }, []);

  // STATE 2 Trigger: User clicks "I've Verified My Email"
  async function handleCheckVerification() {
    setIsChecking(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) {
        // If session was lost, instruct user to sign in
        setErrorMessage("Please sign in with your email and password to verify your account.");
        setStatus("unverified");
        setIsChecking(false);
        return;
      }

      await reloadCurrentUser();
      const current = auth.currentUser;

      if (current?.emailVerified) {
        setStatus("verified");
        setSuccessNotice("Your email has been successfully verified.");

        // If this verification belongs to a pending onboarding lead, confirm it with backend
        await syncPendingOnboarding();
      } else {
        setStatus("unverified");
        setErrorMessage("Your email is not verified yet. Please open the verification email and click the verification link.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to check verification status. Please try again.");
    } finally {
      setIsChecking(false);
    }
  }

  // STATE 6: Resend Verification Email with 60s cooldown
  async function handleResendVerification() {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    try {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) {
        setErrorMessage("Please sign in first to resend your verification email.");
        setIsResending(false);
        return;
      }

      await sendVerificationEmail();
      setCooldown(60);
      setSuccessNotice(`A fresh verification link has been sent to ${email || auth.currentUser.email}.`);
      setStatus("waiting");
    } catch (err: any) {
      if (err?.code === "auth/too-many-requests") {
        setCooldown(60);
        setErrorMessage("Too many requests. Please wait a minute before requesting another verification email.");
      } else {
        setErrorMessage(err?.message || "Could not resend verification email. Please try again shortly.");
      }
    } finally {
      setIsResending(false);
    }
  }

  // Confirm pending onboarding lead via authenticated API
  async function syncPendingOnboarding() {
    try {
      let leadId = pendingLeadId;
      if (!leadId && typeof window !== "undefined") {
        const raw = window.sessionStorage.getItem("tableline_pending_onboarding");
        if (raw) {
          const parsed = JSON.parse(raw);
          leadId = parsed?.leadId;
        }
      }
      if (!leadId) return;

      const token = await getIdToken();
      if (!token) return;

      const res = await fetch(`/api/platform/leads/${leadId}/confirm-verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setOnboardingCompleted(true);
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("tableline_pending_onboarding");
        }
      }
    } catch (err) {
      console.warn("Could not sync pending onboarding:", err);
    }
  }

  // STATE 7: Change Email Address
  async function handleChangeEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChangeEmailError(null);

    const validation = validateEmailAddress(newEmail);
    if (!validation.valid) {
      setChangeEmailError(validation.error || "Please use a valid email from a supported provider.");
      return;
    }

    setIsUpdatingEmail(true);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth?.currentUser;

      if (!currentUser) {
        // Create new account with corrected email
        const tempPass = "Tableline@" + Math.random().toString(36).slice(2, 10) + "!";
        const user = await signUpWithEmail(newEmail.split("@")[0], validation.normalizedEmail!, tempPass);
        setEmail(user.email || validation.normalizedEmail!);
      } else {
        // Sign out previous and register with corrected email
        await signOutCurrentUser();
        const tempPass = "Tableline@" + Math.random().toString(36).slice(2, 10) + "!";
        const user = await signUpWithEmail(newEmail.split("@")[0], validation.normalizedEmail!, tempPass);
        setEmail(user.email || validation.normalizedEmail!);
      }

      setIsChangingEmail(false);
      setNewEmail("");
      setStatus("waiting");
      setCooldown(60);
      setSuccessNotice(`Verification link sent to ${validation.normalizedEmail!}. Please check your inbox.`);
    } catch (err: any) {
      setChangeEmailError(err?.message || "Failed to update email address. Please try again.");
    } finally {
      setIsUpdatingEmail(false);
    }
  }

  // Continue to destination
  async function handleContinue() {
    try {
      const token = await getIdToken();
      if (!token) {
        setLocation("/login");
        return;
      }

      const res = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.user?.platformAdmin) {
          setLocation("/platform/admin");
          return;
        }
        if (data?.user?.restaurantSlug) {
          setLocation(`/dashboard/${data.user.restaurantSlug}`);
          return;
        }
      }
      setLocation("/login");
    } catch {
      setLocation("/login");
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col justify-between selection:bg-amber-100 selection:text-amber-900 font-sans">
      {/* Top Navigation Bar */}
      <header className="px-6 py-5 border-b border-stone-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold tracking-tight text-sm shadow-sm group-hover:bg-amber-600 transition-colors">
            TL
          </div>
          <span className="font-semibold text-lg tracking-tight text-stone-900">Tableline</span>
        </a>
        <div className="flex items-center gap-3 text-xs text-stone-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Firebase Native Email Security</span>
        </div>
      </header>

      {/* Main Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-8 relative overflow-hidden">
          {/* Subtle warm accent bar */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 via-amber-600 to-stone-800" />

          {/* Alert / Notice Messages */}
          {successNotice && (
            <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successNotice}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STATE: Loading */}
          {status === "loading" && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-8 h-8 text-amber-600 animate-spin mb-4" />
              <h2 className="text-lg font-semibold text-stone-900">Checking verification state...</h2>
              <p className="text-sm text-stone-500 mt-1">Authorizing with Firebase Authentication...</p>
            </div>
          )}

          {/* STATE 1: Waiting */}
          {status === "waiting" && !isChangingEmail && (
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mb-5">
                <Mail className="w-6 h-6 text-amber-600" />
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-stone-900">Check your email</h1>
              <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                We've sent an official verification link to:
              </p>

              <div className="my-3 px-3.5 py-2.5 bg-stone-100/80 rounded-xl border border-stone-200 text-sm font-medium text-stone-900 break-all flex items-center justify-between">
                <span>{email || "your registered email"}</span>
                <button
                  type="button"
                  onClick={() => setIsChangingEmail(true)}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 hover:underline ml-2"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Change
                </button>
              </div>

              <p className="text-xs text-stone-500 mb-6 leading-relaxed">
                Please click the link inside your email to verify your address. Firebase Authentication ensures only confirmed owners access administrative operations.
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={isChecking}
                  className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  {isChecking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Checking with Firebase...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      I've Verified My Email
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={cooldown > 0 || isResending}
                  className="w-full py-2.5 px-4 bg-white hover:bg-stone-50 disabled:opacity-50 text-stone-700 border border-stone-200 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : cooldown > 0 ? (
                    `Resend available in ${cooldown}s`
                  ) : (
                    "Resend Verification Email"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STATE 2: Verified */}
          {status === "verified" && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/70 text-emerald-800 mb-2">
                ✓ Email Verified
              </span>

              <h1 className="text-2xl font-bold tracking-tight text-stone-900 mt-2">
                Email Successfully Verified
              </h1>

              <p className="text-sm text-stone-600 mt-2 leading-relaxed max-w-sm mx-auto">
                {onboardingCompleted
                  ? "Your restaurant onboarding request is fully confirmed. Our platform team is provisioning your workspace."
                  : "Your identity has been authenticated through Firebase native email verification. You are cleared for administrative access."}
              </p>

              <button
                type="button"
                onClick={handleContinue}
                className="mt-6 w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STATE 3: Unverified Notice */}
          {status === "unverified" && !isChangingEmail && (
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mb-5">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                Email Not Verified Yet
              </h1>

              <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                We re-checked Firebase Authentication, but your address{" "}
                <span className="font-semibold text-stone-900">{email}</span> has not been confirmed yet.
              </p>

              <div className="my-4 p-3.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-amber-700">1.</span>
                  <span>Open your email inbox (and check your Spam/Junk folder).</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-amber-700">2.</span>
                  <span>Click the official verification link inside the email.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-amber-700">3.</span>
                  <span>Return here and click the button below.</span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={isChecking}
                  className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  {isChecking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Checking with Firebase...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      I've Verified My Email
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={cooldown > 0 || isResending}
                  className="w-full py-2.5 px-4 bg-white hover:bg-stone-50 disabled:opacity-50 text-stone-700 border border-stone-200 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend Verification Email"}
                </button>

                <button
                  type="button"
                  onClick={() => setIsChangingEmail(true)}
                  className="w-full py-2 px-4 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors"
                >
                  Need to use a different email address?
                </button>
              </div>
            </div>
          )}

          {/* STATE: Change Email Form */}
          {isChangingEmail && (
            <div>
              <div className="w-12 h-12 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center mb-5">
                <Edit3 className="w-6 h-6 text-stone-700" />
              </div>

              <h1 className="text-xl font-bold tracking-tight text-stone-900">Change Email Address</h1>
              <p className="text-xs text-stone-500 mt-1 mb-4 leading-relaxed">
                Enter your correct email. Supported mainstream providers (Gmail, Outlook, Yahoo, iCloud, etc.) and valid business domains are accepted. Temporary/disposable emails are blocked.
              </p>

              {changeEmailError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{changeEmailError}</span>
                </div>
              )}

              <form onSubmit={handleChangeEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    New Email Address
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    placeholder="name@gmail.com"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600 transition-all text-stone-900"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingEmail(false);
                      setChangeEmailError(null);
                    }}
                    className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingEmail || !newEmail.trim()}
                    className="flex-1 py-2.5 px-4 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    {isUpdatingEmail ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Send to New Email"
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STATE: General Error */}
          {status === "error" && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-rose-600" />
              </div>

              <h1 className="text-xl font-bold tracking-tight text-stone-900">
                Verification Action Failed
              </h1>

              <p className="text-sm text-stone-600 mt-2 mb-6">
                {errorMessage || "The verification link is invalid or has expired."}
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={cooldown > 0 || isResending}
                  className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending fresh email...
                    </>
                  ) : cooldown > 0 ? (
                    `Resend available in ${cooldown}s`
                  ) : (
                    "Request New Verification Link"
                  )}
                </button>

                <a
                  href="/login"
                  className="block text-center text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline pt-2"
                >
                  Return to Sign In
                </a>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-4 text-center text-xs text-stone-400 border-t border-stone-200/60 bg-white/40">
        <p>© {new Date().getFullYear()} Tableline. Firebase Authentication Native Verification.</p>
      </footer>
    </div>
  );
}
