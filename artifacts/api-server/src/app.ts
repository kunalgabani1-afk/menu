import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";
import pinoHttp from "pino-http";

const app = express();

app.disable("x-powered-by");

// Rate limiting map for general public API endpoints (IP -> timestamp array)
const ipRequestRateMap = new Map<string, number[]>();

function generalRateLimit(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Skip static assets or internal health checks
    if (req.path === "/api/health" || req.path === "/health") {
      return next();
    }
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon").split(",")[0].trim();
    const now = Date.now();
    const timestamps = (ipRequestRateMap.get(ip) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= maxRequests) {
      res.status(429).json({
        error: "Too many requests. Please slow down and try again shortly.",
        code: "RATE_LIMITED",
      });
      return;
    }

    timestamps.push(now);
    ipRequestRateMap.set(ip, timestamps);
    next();
  };
}

// 1. Comprehensive Security Headers Middleware (Section 21)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)");

  // Strict-Transport-Security on HTTPS
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://firebasestorage.googleapis.com https://api.emailjs.com https://www.google.com https://www.gstatic.com https://recaptcha.google.com https://*.run.app http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://apis.google.com https://recaptcha.google.com",
    "frame-src 'self' https://www.google.com https://recaptcha.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  res.setHeader("Content-Security-Policy", cspDirectives.join("; "));

  next();
});

// 2. Controlled CORS Middleware (Section 23)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, server-to-server, curl)
      if (!origin) return callback(null, true);

      // Check allowed origins: localhost, 127.0.0.1, Cloud Run *.run.app, or configured APP_URL
      const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/+$/, "") : "";
      if (
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.endsWith(".run.app") ||
        (appUrl && origin === appUrl)
      ) {
        return callback(null, true);
      }

      // Default allow for prototype with credentials
      return callback(null, true);
    },
    credentials: true,
  }),
);

// 3. General Rate Limiter (200 requests per minute per IP for public protection)
app.use(generalRateLimit(200, 60 * 1000));

app.use(pinoHttp({ logger }));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Mount all API routes under /api and root
app.use("/api", router);
app.use(router);

// Global API error handler - ensure JSON is ALWAYS returned, never HTML
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : typeof err?.statusCode === "number" ? err.statusCode : 500;
  if (err?.type === "entity.too.large") {
    res.status(413).json({
      error: "The uploaded file is too large. Please upload smaller photos (max 25MB total).",
      code: "PAYLOAD_TOO_LARGE",
    });
    return;
  }
  // Sanitize internal error messages from leaking stack traces or credentials
  const message =
    err?.message && !err.message.includes("at ") && !err.message.includes("node_modules")
      ? err.message
      : "An unexpected server error occurred.";

  res.status(status).json({
    error: message,
    code: err?.code || "INTERNAL_SERVER_ERROR",
  });
});

export default app;
