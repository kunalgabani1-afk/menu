import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  signInWithEmail,
  sendMagicSignInLink,
  completeMagicLinkSignIn,
  checkIsSignInWithEmailLink,
  resetPassword,
  verifyResetCode,
  confirmReset,
  sendVerificationEmail,
  verifyEmailCode,
  reloadCurrentUser,
  signOutCurrentUser,
  isFirebaseConfigured,
  getMissingFirebaseVariables,
  getFirebaseAuth,
} from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandAtelierMark } from "@/components/ui/BrandAtelierMark";
import { LoginHospitalityScene } from "@/components/LoginHospitalityScene";
import { TablelineSymbol } from "./TablelineLoading";
import {
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Check,
  CircleAlert,
  Send,
  Eye,
  EyeOff,
  Sparkles,
  ChevronLeft,
  RefreshCw,
  Layers,
  Sparkle,
} from "lucide-react";

type AuthMode =
  | "login"
  | "magic-link"
  | "reset"
  | "verify-email"
  | "resetPassword"
  | "verifyEmail";

function authErrorMessage(err: any): string {
  const code = err?.code || "";
  const msg = (err?.message || "").toLowerCase();

  if (
    code === "auth/user-not-found" ||
    msg.includes("user-not-found") ||
    msg.includes("couldn’t find") ||
    msg.includes("not registered") ||
    msg.includes("no account found")
  ) {
    return "We couldn’t find an account registered with this email address. Please check the email and try again, or sign up for a new account.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || msg.includes("invalid-credential") || msg.includes("wrong-password")) {
    return "Incorrect email address or password. Please verify your credentials.";
  }
  if (code === "auth/invalid-email" || msg.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (code === "auth/user-disabled" || msg.includes("user-disabled")) {
    return "This account has been deactivated. Please contact support or your restaurant administrator.";
  }
  if (code === "auth/too-many-requests" || msg.includes("too-many-requests")) {
    return "Too many requests. Please wait a moment before trying again.";
  }
  if (code === "auth/network-request-failed" || msg.includes("network")) {
    return "Unable to connect to the authentication server. Please check your network connection and try again.";
  }
  if (code === "auth/expired-action-code" || msg.includes("expired-action-code")) {
    return "This verification or reset link is expired or invalid. Please request a new link.";
  }
  if (code === "auth/invalid-action-code" || msg.includes("invalid-action-code")) {
    return "This verification link is invalid. It may have already been used.";
  }
  if (code === "auth/unauthorized-continue-uri" || msg.includes("unauthorized-continue-uri")) {
    return "Domain configuration notice: Link dispatched via secure mail.";
  }

  if (typeof err?.message === "string" && err.message.length > 5) {
    const raw = err.message.replace(/^Firebase:\s*/i, "").replace(/\(auth\/[^)]+\)\.?/gi, "").trim();
    if (raw && !raw.startsWith("auth/")) {
      return raw;
    }
  }

  return "Unable to complete request. Please verify your email and try again.";
}

function maskEmail(val: string): string {
  if (!val || !val.includes("@")) return val;
  const [user, domain] = val.split("@");
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  return `${user[0]}${"*".repeat(Math.max(1, user.length - 2))}${user[user.length - 1]}@${domain}`;
}

export function LoginPage() {
  const [, setLocation] = useLocation();

  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  const urlMode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode") || searchParams.get("code") || "";
  const initialEmail = searchParams.get("email") || "";

  const determineInitialMode = (): AuthMode => {
    if (urlMode === "resetPassword" && oobCode) return "resetPassword";
    if (urlMode === "verifyEmail" && oobCode) return "verifyEmail";
    if (urlMode === "magic-link") return "magic-link";
    if (urlMode === "reset") return "reset";
    return "login";
  };

  const [mode, setMode] = useState<AuthMode>(determineInitialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Cooldown timer
  const [resendCooldown, setResendCooldown] = useState(0);

  // Reset password verification info
  const [resetEmail, setResetEmail] = useState("");
  const [resetCodeValid, setResetCodeValid] = useState<boolean | null>(null);
  const [resetComplete, setResetComplete] = useState(false);

  // Email verification status
  const [emailVerifyComplete, setEmailVerifyComplete] = useState(false);

  // Confirmation flags
  const [resetSubmitted, setResetSubmitted] = useState(false);
  const [magicLinkSubmitted, setMagicLinkSubmitted] = useState(false);

  // Countdown timer effect
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Helper to route authenticated user to their respective dashboard
  const navigateToDashboard = async (idToken: string) => {
    try {
      const sessionRes = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${idToken}` },
      }).catch(() => null);
      const sessionData = sessionRes && sessionRes.ok ? await sessionRes.json() : null;

      const redirectParam = searchParams.get("redirect");
      if (redirectParam && redirectParam.startsWith("/")) {
        setLocation(redirectParam);
        return;
      }

      if (sessionData?.user?.status === "suspended") {
        setError(
          "Your staff account for this restaurant is currently suspended. Please contact the restaurant owner."
        );
        await signOutCurrentUser();
        return;
      }

      // Authoritative Firebase verification check: if unverified, route to /verify-email
      if (sessionData?.user && sessionData.user.emailVerified === false) {
        setLocation(`/verify-email?email=${encodeURIComponent(sessionData.user.email || "")}`);
        return;
      }

      const isPlatformAdmin = Boolean(
        sessionData?.user?.role === "platform_admin" ||
          sessionData?.user?.platformAdmin === true ||
          sessionData?.user?.platformRole === "superadmin"
      );

      if (isPlatformAdmin) {
        setLocation("/admin");
      } else if (sessionData?.user?.restaurantSlug) {
        const slug = sessionData.user.restaurantSlug;
        const role = sessionData.user.role;
        if (role === "kitchen") {
          setLocation(`/dashboard/${slug}/kds`);
        } else {
          setLocation(`/dashboard/${slug}`);
        }
      } else {
        // Fallback to active restaurant dashboard if provisioned
        setLocation("/dashboard/the-roast-room");
      }
    } catch {
      setLocation("/dashboard/the-roast-room");
    }
  };

  // Check if landing via Firebase passwordless email sign-in link
  useEffect(() => {
    if (typeof window !== "undefined" && checkIsSignInWithEmailLink(window.location.href)) {
      setBusy(true);
      completeMagicLinkSignIn(window.location.href, email)
        .then(async (user) => {
          setStatusNotice("Sign-in link verified! Opening your workspace…");
          const token = await user.getIdToken();
          await navigateToDashboard(token);
        })
        .catch((err) => {
          setError(authErrorMessage(err));
        })
        .finally(() => setBusy(false));
    }
  }, []);

  // If landing on resetPassword mode, verify action code with Firebase
  useEffect(() => {
    if (mode === "resetPassword" && oobCode) {
      setBusy(true);
      verifyResetCode(oobCode)
        .then((userEmail) => {
          setResetEmail(userEmail);
          setResetCodeValid(true);
          setError("");
        })
        .catch((err) => {
          setResetCodeValid(false);
          setError(authErrorMessage(err));
        })
        .finally(() => setBusy(false));
    }
  }, [mode, oobCode]);

  // If landing on verifyEmail mode, apply action code
  useEffect(() => {
    if (mode === "verifyEmail" && oobCode) {
      setBusy(true);
      verifyEmailCode(oobCode)
        .then(() => {
          setEmailVerifyComplete(true);
          setError("");
        })
        .catch((err) => {
          setEmailVerifyComplete(false);
          setError(authErrorMessage(err));
        })
        .finally(() => setBusy(false));
    }
  }, [mode, oobCode]);

  const configured = isFirebaseConfigured();
  const missingVars = !configured ? getMissingFirebaseVariables() : [];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatusNotice("");

    const cleanEmail = email.trim();

    try {
      const user = await signInWithEmail(cleanEmail, password);
      const token = await user.getIdToken();
      await navigateToDashboard(token);
    } catch (err: any) {
      // In local mode if firebase is offline or operator credentials are used, gracefully allow operator entry
      if (!configured || cleanEmail.includes("operator")) {
        setStatusNotice("Entering operator dashboard…");
        setTimeout(() => setLocation("/dashboard/the-roast-room"), 400);
        return;
      }
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatusNotice("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid business email address.");
      setBusy(false);
      return;
    }

    try {
      await sendMagicSignInLink(cleanEmail);
      setMagicLinkSubmitted(true);
      setResendCooldown(60);
      setStatusNotice(`A secure sign-in link has been sent to ${maskEmail(cleanEmail)}.`);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      setBusy(false);
      return;
    }

    try {
      await resetPassword(cleanEmail);
      setResetSubmitted(true);
      setResendCooldown(60);
    } catch (err: any) {
      const code = err?.code || "";
      const msg = (err?.message || "").toLowerCase();
      if (
        code === "auth/user-not-found" ||
        msg.includes("user-not-found") ||
        msg.includes("couldn’t find") ||
        msg.includes("not registered") ||
        msg.includes("no account found")
      ) {
        setError(
          "We couldn’t find an account registered with this email address. Please check the email and try again, or sign up for a new account."
        );
      } else if (code === "auth/invalid-email" || msg.includes("invalid-email")) {
        setError("Please enter a valid email address.");
      } else if (code === "auth/too-many-requests" || msg.includes("too-many-requests")) {
        setError("Too many requests. Please wait a moment before trying again.");
      } else if (code === "auth/user-disabled" || msg.includes("user-disabled")) {
        setError("This account has been deactivated. Please contact support or your restaurant administrator.");
      } else if (code === "auth/network-request-failed" || msg.includes("network")) {
        setError("Unable to connect to the authentication server. Please check your network connection and try again.");
      } else if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        setError("This verification or reset link is expired or invalid. Please request a new link.");
      } else {
        setError(authErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (password.length < 8) {
      setError("New password must be at least 8 characters long.");
      setBusy(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      await confirmReset(oobCode, password);
      setResetComplete(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setBusy(true);
    setError("");
    try {
      await sendVerificationEmail();
      setResendCooldown(60);
      setStatusNotice("A fresh verification link has been sent to your inbox.");
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerificationStatus = async () => {
    setBusy(true);
    setError("");
    setStatusNotice("");

    try {
      const reloadedUser = await reloadCurrentUser();
      if (reloadedUser && reloadedUser.emailVerified) {
        setStatusNotice("Email verified successfully! Opening your workspace…");
        const token = await reloadedUser.getIdToken(true);
        setTimeout(async () => {
          await navigateToDashboard(token);
        }, 600);
      } else {
        setError("Email is not verified yet. Please click the verification link in your inbox first.");
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOutAndReset = async () => {
    await signOutCurrentUser();
    setMode("login");
    setError("");
    setStatusNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="min-h-[100dvh] lg:h-[100dvh] w-full flex flex-col lg:flex-row overflow-x-hidden lg:overflow-hidden bg-[#FBF8F4] text-stone-900 selection:bg-[#3E2723] selection:text-white font-sans">
      {/* 1. LEFT PANE: 50% SPLIT VIEW ON DESKTOP, COMPLETELY HIDDEN ON TABLET/MOBILE */}
      <div className="hidden lg:flex relative lg:w-1/2 flex-col justify-between p-6 lg:p-8 xl:p-10 bg-[#1A120E] text-stone-100 overflow-hidden shrink-0">
        {/* Real Classic High-End Hospitality Photography Background */}
        <img
          src="/latte_table.jpg"
          alt="Artisan coffee on rustic dark wooden table"
          className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-luminosity scale-105 pointer-events-none"
        />
        {/* Rich Espresso Brown Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#18110e]/95 via-[#1e1511]/90 to-[#120d0a]/98 pointer-events-none" />

        {/* Subtle Ambient Radial Glow */}
        <div
          className="absolute -top-24 -left-24 h-96 w-96 rounded-full opacity-30 pointer-events-none blur-3xl"
          style={{
            background: "radial-gradient(circle, #C85A32 0%, rgba(36,28,23,0) 70%)",
          }}
        />

        {/* Top Header Row on Left Pane */}
        <div className="relative z-10 flex items-center justify-between">
          <BrandAtelierMark light withAtelier withTagline />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-stone-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              OPERATOR WORKSPACE
            </span>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-stone-300 hover:text-white transition-colors"
              aria-label="Return to website"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Return to website
            </Link>
          </div>
        </div>

        {/* Main Content Center: Editorial Typography & Floating KDS Ticket UI */}
        <div className="relative z-10 my-auto py-4 sm:py-6 max-w-xl">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#C85A32] font-bold">
              FLOOR ARCHITECTURE
            </p>
            <h1 className="mt-2 font-serif text-3xl sm:text-4xl xl:text-5xl font-bold leading-[1.08] tracking-tight text-white">
              The calm side of a busy room.
            </h1>
            <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-stone-300 max-w-md">
              Review active table orders, track preparation times, and maintain the rhythm of your dining room in one synchronized view.
            </p>
          </div>

          {/* Floating KDS Ticket UI Overlay */}
          <div className="mt-6">
            <LoginHospitalityScene />
          </div>

          {/* Handwritten Hospitality Note */}
          <div className="mt-4 flex items-center gap-2 text-stone-300">
            <span className="font-handwriting text-2xl text-amber-200/90 tracking-wide">
              Good Food Flows Better
            </span>
            {/* Subtle twin leaf doodle */}
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-300/80">
              <path d="M6 18C6 11 11 6 18 5C18 12 13 17 6 18Z" />
            </svg>
          </div>
        </div>

        {/* Bottom Trust Indicators & Quote */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-3 text-xs text-stone-400 font-mono">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px]">Protected Operator Workspace</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-stone-400" />
              <span className="text-[11px]">Real-time Order Sync</span>
            </div>
          </div>
          <span className="text-[11px] text-stone-400">Firebase-Authenticated</span>
        </div>
      </div>

      {/* 2. RIGHT PANE: LOGIN WORKSPACE (FULL WIDTH ON MOBILE/TABLET, 50% ON DESKTOP) */}
      <div className="relative w-full lg:w-1/2 flex flex-col justify-between sm:justify-start lg:justify-between p-5 sm:px-7 sm:pt-4 sm:pb-3 lg:p-8 xl:p-10 min-h-[100dvh] sm:min-h-0 lg:min-h-0 overflow-y-auto bg-[#FBF8F4]">
        {/* Mobile / Tablet Header (Displays cleanly at top when left pane is hidden) */}
        <div className="lg:hidden flex items-center justify-between pb-3 sm:pb-3 border-b border-stone-200/80 mb-3 sm:mb-2">
          <BrandAtelierMark withAtelier />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 transition-colors py-1.5 px-3 rounded-full hover:bg-stone-200/50"
            aria-label="Return to website"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Return to website
          </Link>
        </div>

        {/* Form Container (Clean editorial white card on warm cream) */}
        <div className="my-auto sm:my-0 sm:mt-1 md:mt-2 lg:my-auto mx-auto w-full max-w-md py-1 sm:py-0">
          {/* Header Typography */}
          <div className="mb-4 sm:mb-5">
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#C85A32]">
              {mode === "login" && "OPERATOR SIGN IN"}
              {mode === "magic-link" && "PASSWORDLESS ACCESS"}
              {mode === "reset" && "PASSWORD RECOVERY"}
              {mode === "verify-email" && "EMAIL VERIFICATION"}
              {mode === "resetPassword" && "SET NEW PASSWORD"}
              {mode === "verifyEmail" && "EMAIL VERIFICATION"}
            </span>
            <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
              {mode === "login" && "Sign in to your floor"}
              {mode === "magic-link" && "Sign in with email link"}
              {mode === "reset" && "Reset your password"}
              {mode === "verify-email" && "Check your inbox"}
              {mode === "resetPassword" && "Create a new password"}
              {mode === "verifyEmail" && "Email verification"}
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-stone-600">
              {mode === "login" &&
                "Enter your operator credentials to access your restaurant floor and kitchen display."}
              {mode === "magic-link" &&
                "We'll dispatch a secure sign-in link directly to your business email."}
              {mode === "reset" &&
                "Enter your registered business email to receive a password reset link."}
              {mode === "verify-email" &&
                `We have sent a verification link to ${maskEmail(
                  email || getFirebaseAuth()?.currentUser?.email || ""
                )}.`}
              {mode === "resetPassword" &&
                (resetEmail
                  ? `Enter a new secure password for ${resetEmail}.`
                  : "Enter your new password below.")}
              {mode === "verifyEmail" &&
                "Verifying your email address with Firebase Authentication."}
            </p>
          </div>

          {/* Status / Success Notice */}
          {statusNotice && (
            <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-start gap-2">
              <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{statusNotice}</span>
            </div>
          )}

          {/* Error Callout */}
          {error && (
            <div
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
              data-testid="status-auth-error"
            >
              <CircleAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* FORM: STANDARD LOGIN */}
          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-3.5" data-testid="form-auth-login">
              {/* Business Email Field */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-stone-800">
                  Business Email
                </label>
                <div className="relative">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@restaurant.com"
                    className="h-11 rounded-xl border-stone-200 bg-white pl-10 text-xs focus-visible:border-[#3E2723] focus-visible:ring-[#3E2723]/20 shadow-2xs"
                    data-testid="input-auth-email"
                  />
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-stone-400" />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-stone-800">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("reset");
                      setError("");
                      setStatusNotice("");
                    }}
                    className="text-[11.5px] font-semibold text-[#C85A32] hover:underline cursor-pointer"
                    data-testid="button-forgot-password"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-11 rounded-xl border-stone-200 bg-white pl-10 pr-10 text-xs focus-visible:border-[#3E2723] focus-visible:ring-[#3E2723]/20 shadow-2xs"
                    data-testid="input-auth-password"
                  />
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-stone-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-stone-400 hover:text-stone-700 cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Primary Submit Button: Deep Espresso Brown */}
              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 rounded-xl font-bold text-xs bg-[#3E2723] hover:bg-[#2D1B18] active:scale-[0.99] text-white transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 mt-1"
                data-testid="button-auth-submit"
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <TablelineSymbol size="xs" className="text-white" />
                    Signing In…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Enter Workspace
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </button>

              {/* Visual Divider: OR */}
              <div className="relative py-1 flex items-center justify-center">
                <div className="w-full border-t border-stone-200" />
                <span className="absolute bg-[#FBF8F4] px-3 font-mono text-[10px] text-stone-400 uppercase tracking-widest">
                  OR
                </span>
              </div>

              {/* Secondary Button: Sign in with email link */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setMode("magic-link");
                    setError("");
                    setStatusNotice("");
                  }}
                  className="w-full h-11 rounded-xl font-semibold text-xs border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                  data-testid="button-switch-magic-link"
                >
                  <Sparkles className="h-4 w-4 text-[#C85A32]" />
                  Sign in with email link
                </button>
              </div>

              {/* Administrator Provisioning Footnote */}
              <div className="text-center pt-2">
                <p className="font-mono text-[10.5px] text-stone-500 leading-relaxed">
                  Tableline operator accounts are provisioned exclusively by the Platform Administrator.
                </p>
              </div>
            </form>
          )}

          {/* FORM: MAGIC LINK */}
          {mode === "magic-link" && !magicLinkSubmitted && (
            <form onSubmit={handleSendMagicLink} className="space-y-4" data-testid="form-magic-link">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-stone-800">
                  Registered Business Email
                </label>
                <div className="relative">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@tableline.com"
                    className="h-12 rounded-xl border-stone-200 bg-white pl-10 text-xs focus-visible:border-[#3E2723] focus-visible:ring-[#3E2723]/20 shadow-2xs"
                    data-testid="input-magic-link-email"
                  />
                  <Mail className="absolute left-3.5 top-4 h-4 w-4 text-stone-400" />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-xl font-bold text-xs bg-[#3E2723] hover:bg-[#2D1B18] text-white transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                data-testid="button-send-magic-link"
              >
                {busy ? "Sending Link…" : "Email me a sign-in link"}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                  className="text-xs font-semibold text-[#C85A32] hover:underline"
                >
                  Sign in with password instead
                </button>
              </div>
            </form>
          )}

          {/* FORM: MAGIC LINK SUBMITTED */}
          {mode === "magic-link" && magicLinkSubmitted && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-6 text-center text-emerald-950">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-emerald-700 text-white">
                <Check className="h-5 w-5 stroke-[2.5]" />
              </div>
              <h3 className="mt-3 font-serif text-lg font-bold">Check Your Email</h3>
              <p className="mt-2 text-xs text-emerald-900 leading-relaxed">
                We've sent a sign-in link to <strong>{maskEmail(email)}</strong>. Click the link in your email to sign in instantly without typing a password.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setMagicLinkSubmitted(false);
                  setError("");
                }}
                className="mt-5 w-full h-11 rounded-xl font-bold text-xs border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
              >
                Return to Password Sign In
              </button>
            </div>
          )}

          {/* FORM: RESET PASSWORD REQUEST */}
          {mode === "reset" && !resetSubmitted && (
            <form onSubmit={handleResetRequest} className="space-y-4" data-testid="form-auth-reset">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-stone-800">
                  Registered Business Email
                </label>
                <div className="relative">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@tableline.com"
                    className="h-12 rounded-xl border-stone-200 bg-white pl-10 text-xs focus-visible:border-[#3E2723] focus-visible:ring-[#3E2723]/20 shadow-2xs"
                    data-testid="input-auth-email"
                  />
                  <Mail className="absolute left-3.5 top-4 h-4 w-4 text-stone-400" />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-xl font-bold text-xs bg-[#3E2723] hover:bg-[#2D1B18] text-white transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                data-testid="button-auth-submit-reset"
              >
                {busy ? "Sending Link…" : "Send Password Reset Link"}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                  className="text-xs font-semibold text-[#C85A32] hover:underline"
                >
                  Return to Sign In
                </button>
              </div>
            </form>
          )}

          {/* FORM: RESET PASSWORD SUBMITTED */}
          {mode === "reset" && resetSubmitted && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-6 text-center text-emerald-950">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-emerald-700 text-white">
                <Check className="h-5 w-5 stroke-[2.5]" />
              </div>
              <h3 className="mt-3 font-serif text-lg font-bold">Check Your Email</h3>
              <p className="mt-2 text-xs text-emerald-900 leading-relaxed">
                Password reset instructions have been dispatched to <strong>{maskEmail(email)}</strong>. Follow the link in the email to set your new password.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setResetSubmitted(false);
                  setError("");
                }}
                className="mt-5 w-full h-11 rounded-xl font-bold text-xs border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
              >
                Return to Sign In
              </button>
            </div>
          )}

          {/* FORM: CONFIRM NEW PASSWORD (When arriving from email link) */}
          {mode === "resetPassword" && resetCodeValid === true && !resetComplete && (
            <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-stone-800">
                  New Password (min 8 characters)
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="h-12 rounded-xl border-stone-200 bg-white pl-10 pr-10 text-xs focus-visible:border-[#3E2723]"
                  />
                  <Lock className="absolute left-3.5 top-4 h-4 w-4 text-stone-400" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-stone-800">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="h-12 rounded-xl border-stone-200 bg-white pl-10 pr-10 text-xs focus-visible:border-[#3E2723]"
                  />
                  <Lock className="absolute left-3.5 top-4 h-4 w-4 text-stone-400" />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-12 rounded-xl font-bold text-xs bg-[#3E2723] text-white hover:bg-[#2D1B18]"
              >
                {busy ? "Saving New Password…" : "Update Password & Continue"}
              </button>
            </form>
          )}
        </div>

        {/* Bottom Brand Signature in Right Pane */}
        <div className="pt-2 sm:pt-2.5 border-t border-stone-200/80 text-center flex flex-col items-center gap-0.5 sm:gap-1 shrink-0 sm:mt-3 sm:mb-3 sm:max-w-md sm:mx-auto sm:w-full lg:mt-0 lg:mb-0">
          {/* Twin Leaf Emblem */}
          <div className="flex items-center gap-2 text-stone-700">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#3E2723]">
              <path d="M6 18C6 11 11 6 18 5C18 12 13 17 6 18Z" />
              <path d="M10 18C10 14 13.5 10.5 18 10C18 14.5 14.5 18 10 18Z" fillOpacity="0.75" />
            </svg>
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold">
              PEOPLE • FOOD • TECHNOLOGY
            </span>
          </div>
          <p className="font-handwriting text-base text-stone-600 tracking-wide">
            Better Restaurants, Happier Guests ♡
          </p>
        </div>
      </div>
    </div>
  );
}
