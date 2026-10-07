import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { BrandAtelierMark } from "@/components/ui/BrandAtelierMark";
import { HeroCafeScene } from "@/components/HeroCafeScene";
import { validateOnboardingEmail, STANDARD_EMAIL_ERROR } from "@/lib/emailValidation";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  sendEmailVerification,
  reload,
  applyActionCode,
} from "firebase/auth";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Coffee,
  HelpCircle,
  Menu as MenuIcon,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  X as XIcon,
  Printer,
  Bell,
  Wallet,
  WifiOff,
  Monitor,
  Flame,
  Clock,
  ChevronDown,
  ShoppingBag,
  Send,
  Eye,
  Store,
  Layers,
  Plus,
  Minus,
  Mail,
  RefreshCw,
} from "lucide-react";

interface PlanItem {
  id: string;
  name: string;
  tagline?: string;
  monthlyFee: number;
  setupFee: number;
  highlight?: boolean;
  cta: string;
  features: string[];
}

const DEFAULT_PLANS: PlanItem[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For restaurants starting with QR ordering and money basics.",
    monthlyFee: 499,
    setupFee: 1999,
    highlight: false,
    cta: "Select Starter",
    features: [
      "QR Digital Menu & Table Ordering",
      "Up to 5 Tables",
      "Up to 50 Menu Items",
      "Kitchen Display System (KDS)",
      "Live Orders & KOT Ticket Routing",
      "Audio Attention Chimes",
      "Daily Sales & Payment Summary",
      "Basic Expenses & Excel Export",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Full QR ordering, KDS, waiter calls & restaurant finance for busy dining rooms",
    monthlyFee: 1299,
    setupFee: 4999,
    highlight: true,
    cta: "Select Growth",
    features: [
      "Full QR Ordering & Advanced KDS",
      "Up to 15 Tables",
      "Up to 200 Menu Items",
      "Spreadsheet & Document Menu Import",
      "Staff Role Permissions (RBAC)",
      "Waiter Call System & Diner Reviews",
      "Income vs Expenses & Estimated Net",
      "Financial PDF & Advanced Excel Export",
      "Captain Mobile Web Ordering",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "The complete hospitality floor operating system with unlimited capacity",
    monthlyFee: 2499,
    setupFee: 7999,
    highlight: false,
    cta: "Select Pro",
    features: [
      "Everything in Growth",
      "Unlimited Tables & Menu Items",
      "Day Close & Cash Reconciliation",
      "Expected vs Actual Cash Settlement",
      "Complete Finance Excel & Professional PDF",
      "Financial Activity & Audit History",
      "Custom Bill & Receipt Branding",
      "Priority Floor Support",
    ],
  },
];

function formatFeatureBullet(text: string): React.ReactNode {
  const parts = text.split(/(₹?[\d,]+(?:\.\d+)?)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => {
    if (/^₹?[\d,]+(?:\.\d+)?$/.test(part)) {
      return (
        <span key={index} className="font-sans font-semibold tracking-tight">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function PublicWebsite() {
  const [floorTab, setFloorTab] = useState<"menu" | "kitchen" | "dashboard">("menu");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [planDropdownOpen, setPlanDropdownOpen] = useState(false);

  // Lead Form State
  const [formData, setFormData] = useState({
    restaurantName: "",
    ownerName: "",
    phone: "",
    email: "",
    city: "",
    numberOfTables: "12",
    requestedPlan: "growth",
    timeline: "Within 1 month",
    message: "",
  });

  // Lead Email Verification State (EmailJS + Secure Token Verification)
  const [verificationSessionId, setVerificationSessionId] = useState<string>(
    () => (typeof window !== "undefined" ? window.sessionStorage.getItem("tableline_verification_session") || "" : "")
  );
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationCooldown, setVerificationCooldown] = useState(0);
  const [totalCooldownSeconds, setTotalCooldownSeconds] = useState(60);
  const [emailVerificationError, setEmailVerificationError] = useState("");

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState("");

  const saveFormToStorage = (data: typeof formData) => {
    try {
      window.sessionStorage.setItem("tableline_onboarding_form", JSON.stringify(data));
    } catch {}
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Cooldown timer countdown
  useEffect(() => {
    if (verificationCooldown > 0) {
      const timer = setTimeout(() => {
        setVerificationCooldown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [verificationCooldown]);

  // Process incoming verification link callback (?verified=1 or error) & restore stored form
  useEffect(() => {
    const processVerificationCallback = async () => {
      try {
        if (typeof window === "undefined") return;

        // Restore stored form data
        const stored = window.sessionStorage.getItem("tableline_onboarding_form");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === "object") {
              setFormData((prev) => ({ ...prev, ...parsed }));
            }
          } catch {}
        }

        const searchParams = new URLSearchParams(window.location.search);
        let hashParams = new URLSearchParams();
        const hash = window.location.hash || "";
        if (hash.includes("?")) {
          hashParams = new URLSearchParams(hash.split("?")[1]);
        }

        const isVerifiedParam = searchParams.get("verified") === "1" || hashParams.get("verified") === "1";
        const urlEmail = searchParams.get("email") || hashParams.get("email");
        const urlSession = searchParams.get("session") || hashParams.get("session");
        const verificationError = searchParams.get("verificationError") || hashParams.get("verificationError");

        if (verificationError) {
          if (verificationError === "expired") {
            setEmailVerificationError("This verification link has expired. Please request a new verification email.");
          } else if (verificationError === "already_used") {
            setEmailVerificationError("This verification link has already been used.");
          } else {
            setEmailVerificationError("This verification link is invalid or no longer available.");
          }
        }

        if (urlEmail) {
          setFormData((prev) => ({ ...prev, email: urlEmail }));
        }

        if (urlSession) {
          setVerificationSessionId(urlSession);
          window.sessionStorage.setItem("tableline_verification_session", urlSession);
        }

        const currentSession = urlSession || window.sessionStorage.getItem("tableline_verification_session") || "";
        const currentEmail = urlEmail || formData.email;

        if (isVerifiedParam || currentSession) {
          try {
            const res = await fetch(
              `/api/contact/verify-status?email=${encodeURIComponent(currentEmail)}&session=${encodeURIComponent(currentSession)}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data?.verified) {
                setIsEmailVerified(true);
                setVerificationSent(false);
                setEmailVerificationError("");
                if (data.session) {
                  setVerificationSessionId(data.session);
                  window.sessionStorage.setItem("tableline_verification_session", data.session);
                }

                // Clean URL query while preserving #contact
                window.history.replaceState({}, document.title, window.location.pathname + "#contact");

                const el = document.getElementById("contact") || document.getElementById("onboarding");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth" });
                }
              }
            }
          } catch {}
        }
      } catch (err) {
        console.warn("Could not process verification callback:", err);
      }
    };

    processVerificationCallback();
  }, []);

  // Live polling while visitor is awaiting verification link click
  useEffect(() => {
    if (verificationSent && !isEmailVerified && formData.email) {
      const pollStatus = async () => {
        try {
          const cleanEmail = formData.email.trim().toLowerCase();
          const session = verificationSessionId || window.sessionStorage.getItem("tableline_verification_session") || "";
          const res = await fetch(
            `/api/contact/verify-status?email=${encodeURIComponent(cleanEmail)}&session=${encodeURIComponent(session)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.verified) {
              setIsEmailVerified(true);
              setVerificationSent(false);
              setEmailVerificationError("");
              if (data.session) {
                setVerificationSessionId(data.session);
                window.sessionStorage.setItem("tableline_verification_session", data.session);
              }
            }
          }
        } catch {}
      };

      const interval = setInterval(pollStatus, 3000);
      const onFocus = () => pollStatus();
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onFocus);

      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onFocus);
      };
    }
  }, [verificationSent, isEmailVerified, formData.email, verificationSessionId]);

  const handleSendVerificationEmail = async () => {
    setEmailVerificationError("");
    const emailValidation = validateOnboardingEmail(formData.email);
    if (!emailValidation.valid) {
      const isDisposable =
        emailValidation.error?.toLowerCase().includes("temporary") ||
        emailValidation.error?.toLowerCase().includes("disposable");
      setEmailVerificationError(
        isDisposable
          ? "Please use a permanent email address. Temporary email addresses are not supported."
          : "Please enter a valid email address."
      );
      return;
    }

    const cleanEmail = emailValidation.normalizedEmail;
    setIsVerifying(true);

    try {
      saveFormToStorage(formData);

      const res = await fetch("/api/contact/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          name: formData.ownerName || formData.restaurantName || "Customer",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "We couldn't send the verification email right now. Please try again in a moment."
        );
      }

      setVerificationSent(true);
      const cooldownSec = data.cooldownSeconds || 60;
      setTotalCooldownSeconds(cooldownSec);
      setVerificationCooldown(cooldownSec);
      if (data.verificationSessionId) {
        setVerificationSessionId(data.verificationSessionId);
        window.sessionStorage.setItem("tableline_verification_session", data.verificationSessionId);
      }
    } catch (err: any) {
      setEmailVerificationError(
        err?.message || "We couldn't send the verification email right now. Please try again in a moment."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEmailVerified) {
      setEmailVerificationError("Please verify your email before submitting your request.");
      return;
    }

    const emailValidation = validateOnboardingEmail(formData.email);
    if (!emailValidation.valid) {
      const isDisposable =
        emailValidation.error?.toLowerCase().includes("temporary") ||
        emailValidation.error?.toLowerCase().includes("disposable");
      setFormError(
        isDisposable
          ? "Please use a permanent email address. Temporary email addresses are not supported."
          : "Please enter a valid email address."
      );
      return;
    }

    setFormSubmitting(true);
    setFormError("");

    try {
      const session = verificationSessionId || window.sessionStorage.getItem("tableline_verification_session") || "";

      const res = await fetch("/api/platform/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          email: emailValidation.normalizedEmail,
          numberOfTables: Number(formData.numberOfTables),
          verificationSessionId: session,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.message || "Unable to submit your request.");
      }

      setFormSuccess(true);
      window.sessionStorage.removeItem("tableline_onboarding_form");
      window.sessionStorage.removeItem("tableline_verification_session");
      setIsEmailVerified(false);
      setVerificationSent(false);
      setVerificationSessionId("");
      setFormData({
        restaurantName: "",
        ownerName: "",
        phone: "",
        email: "",
        city: "",
        numberOfTables: "12",
        requestedPlan: "growth",
        timeline: "Within 1 month",
        message: "",
      });
    } catch (err: any) {
      setFormError(err.message || "Submission failed. Please try again.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const faqs = [
    {
      q: "What hardware is required to run Tableline at my restaurant?",
      a: "None required! Tableline is 100% web-based and runs on any existing smartphone, tablet, iPad, POS terminal, or kitchen touchscreen. For physical kitchen tickets, it connects seamlessly with standard 58mm and 80mm ESC/POS thermal printers via Wi-Fi, Bluetooth, or USB.",
    },
    {
      q: "Do diners need to download an app or register an account?",
      a: "Never. Guests simply point their camera at the table QR code and the menu opens immediately in Safari, Chrome, or any mobile browser in under one second. Zero sign-up friction, zero apps to download, and zero app store delays.",
    },
    {
      q: "How does the kitchen receive and organize incoming orders?",
      a: "As soon as a guest confirms their order, it immediately pops up on the Kitchen Display System (KDS) screen with an audible chime, table badge, and live timer. Simultaneously, an ESC/POS kitchen ticket auto-prints at the pass.",
    },
    {
      q: "Can diners pay directly from the table or only at the counter?",
      a: "Both modes are fully supported. You can allow diners to settle immediately via UPI / QR or enable Pay at Counter where guests browse and place orders at will, settling their cumulative bill before leaving.",
    },
    {
      q: "How does the system prevent prank or accidental spam orders?",
      a: "Every table can be assigned a dynamic 4-digit PIN code. Tableline also includes intelligent anti-abuse safeguards, such as per-order item velocity limits, cart value ceilings requiring staff confirmation, and IP/device rate-limiting.",
    },
    {
      q: "What happens if our restaurant's Wi-Fi temporarily drops?",
      a: "Tableline is engineered with offline cache resilience. Guests can continue browsing the loaded menu without facing blank error screens, while clear offline indicators notify staff to verify connectivity before confirming kitchen sync.",
    },
  ];

  return (
    <div className="min-h-screen w-full bg-[#FBF8F4] text-[#2D1E18] selection:bg-[#2D1E18] selection:text-white font-sans antialiased">
      {/* 1. EDITORIAL HOSPITALITY HEADER */}
      <header
        className={`sticky top-0 z-50 transition-all duration-200 ${
          scrolled
            ? "border-b border-stone-200/80 bg-[#FBF8F4]/95 backdrop-blur-md shadow-xs"
            : "border-b border-transparent bg-[#FBF8F4]"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-18">
          {/* Tableline Brand Mark */}
          <div className="flex items-center shrink-0">
            <BrandAtelierMark withAtelier />
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 xl:gap-9 text-xs font-semibold text-stone-700 tracking-wide">
            <a href="#features" className="hover:text-[#2D1E18] transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#2D1E18] transition-colors">
              How It Works
            </a>
            <a href="#floor-view" className="hover:text-[#2D1E18] transition-colors">
              Floor View
            </a>
            <a href="#ai-menu" className="hover:text-[#2D1E18] transition-colors">
              AI Menu
            </a>
            <a href="#pricing" className="hover:text-[#2D1E18] transition-colors">
              Pricing
            </a>
            <a href="#faq" className="hover:text-[#2D1E18] transition-colors">
              FAQ
            </a>
          </nav>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-xs font-semibold text-stone-700 hover:text-[#2D1E18] transition-colors px-2 py-1"
            >
              Sign In
            </Link>

            <a
              href="#contact"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#2D1E18] hover:bg-[#1a110d] active:scale-[0.98] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all whitespace-nowrap"
            >
              <span>Request Onboarding</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="grid h-9 w-9 place-items-center rounded-full border border-stone-200 bg-white text-[#2D1E18] lg:hidden shadow-xs"
              aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            >
              {mobileNavOpen ? <XIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileNavOpen && (
          <div className="border-b border-stone-200 bg-[#FBF8F4] px-5 py-5 lg:hidden shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col space-y-2 text-sm font-medium text-[#2D1E18]">
              <a
                href="#features"
                onClick={() => setMobileNavOpen(false)}
                className="py-2 border-b border-stone-200/60 flex items-center justify-between"
              >
                <span>Features</span>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileNavOpen(false)}
                className="py-2 border-b border-stone-200/60 flex items-center justify-between"
              >
                <span>How It Works</span>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </a>
              <a
                href="#floor-view"
                onClick={() => setMobileNavOpen(false)}
                className="py-2 border-b border-stone-200/60 flex items-center justify-between"
              >
                <span>Floor View</span>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </a>
              <a
                href="#ai-menu"
                onClick={() => setMobileNavOpen(false)}
                className="py-2 border-b border-stone-200/60 flex items-center justify-between"
              >
                <span>AI Menu</span>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </a>
              <a
                href="#pricing"
                onClick={() => setMobileNavOpen(false)}
                className="py-2 border-b border-stone-200/60 flex items-center justify-between"
              >
                <span>Pricing</span>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </a>
              <a
                href="#faq"
                onClick={() => setMobileNavOpen(false)}
                className="py-2 border-b border-stone-200/60 flex items-center justify-between"
              >
                <span>FAQ</span>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </a>
              <div className="pt-3 flex flex-col gap-2">
                <a
                  href="#contact"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-full bg-[#2D1E18] py-3 text-xs font-semibold text-white shadow-xs"
                >
                  <span>Request Onboarding</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/login"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center justify-center rounded-full border border-stone-200 bg-white py-2.5 text-xs font-semibold text-[#2D1E18]"
                >
                  Operator Sign In
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="w-full">
        {/* 2. HERO SECTION */}
        <section className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-14 pb-16 sm:pb-20">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
            {/* Left Hero Column: Typography & CTAs */}
            <div>
              {/* Eyebrow Badge */}
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-stone-200/80 bg-stone-100 px-3.5 py-1.5 font-mono text-xs font-semibold text-[#2D1E18]">
                <span>&bull;</span>
                Hospitality, simplified
              </div>

              {/* Master Serif Headline */}
              <h1 className="font-serif text-3xl sm:text-5xl lg:text-[56px] font-bold leading-[1.08] tracking-tight text-[#2D1E18]">
                The simplest way for your guests to order from their table.
              </h1>

              {/* Subtitle Statement */}
              <p className="mt-4 sm:mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-stone-600 font-sans">
                No apps to download. No accounts to create. No complicated setup. Guests scan a table QR code, browse your food, and place their order in seconds.
              </p>

              {/* Primary & Secondary Action CTAs (Rounded Pills) */}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-[#2D1E18] hover:bg-[#1a110d] active:scale-95 px-7 py-3.5 text-xs sm:text-sm font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all"
                  data-testid="hero-cta-primary"
                >
                  Open Restaurant Dashboard <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/menu/the-roast-room/table/t-04"
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white hover:bg-stone-50 active:scale-95 px-6 py-3.5 text-xs sm:text-sm font-semibold text-[#2D1E18] transition-colors shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
                  data-testid="hero-cta-secondary"
                >
                  <Coffee className="h-4 w-4 text-[#2D1E18]" /> View Table Menu
                </Link>
              </div>
            </div>

            {/* Right Hero Column: Real Photographic Composition & Smartphone Mockup */}
            <div className="relative w-full flex items-center justify-center overflow-visible">
              <HeroCafeScene />
            </div>
          </div>

          {/* 3 Quick Step Badges Bar */}
          <div className="mt-10 sm:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 border-t border-stone-200/80 pt-6 sm:pt-8">
            <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-2xs flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200/90 flex items-center justify-center text-[#2D1E18] shrink-0 font-sans font-semibold text-xs tracking-normal">
                01
              </div>
              <div>
                <p className="font-serif text-base font-bold text-stone-900">Scan & View</p>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Guests scan the QR code to see your menu.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-2xs flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200/90 flex items-center justify-center text-[#2D1E18] shrink-0 font-sans font-semibold text-xs tracking-normal">
                02
              </div>
              <div>
                <p className="font-serif text-base font-bold text-stone-900">Order in Seconds</p>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  They choose their items and send it to the kitchen.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-2xs flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200/90 flex items-center justify-center text-[#2D1E18] shrink-0 font-sans font-semibold text-xs tracking-normal">
                03
              </div>
              <div>
                <p className="font-serif text-base font-bold text-stone-900">Pay at Counter</p>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Guests pay via UPI or cash — your way.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. "THE TABLELINE EDGE" SECTION (4 White Cards) */}
        <section id="how-it-works" className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t border-stone-200/80 overflow-hidden">
          {/* Subtle Decorative Twin Coffee Beans Accent (Low prominence) */}
          <div className="absolute right-6 top-8 pointer-events-none select-none opacity-10 hidden sm:block" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="currentColor" className="w-12 h-12 text-[#2D1E18]">
              <path d="M12 4C7.58 4 4 8.03 4 13C4 18.5 8.5 22 13.5 22C18 22 21 18.5 21 13.5C21 8.25 17 4 12 4ZM12.5 19.5C9 19.5 6 16.5 6 13C6 10 8.5 6.5 12 6.5C13.5 6.5 14.8 7.2 15.5 8.5C14.5 10 13.5 12 13 14.5C12.5 17 12.2 18.5 12.5 19.5Z" />
              <path d="M22 11C18.5 11 16 13.5 15.5 16.5C17.5 16 19.5 16.5 21 18C22.5 19.5 23 21.5 22.5 23.5C25.5 23 28 20.5 28 17C28 13.7 25.3 11 22 11Z" opacity="0.75" />
            </svg>
          </div>

          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C85A32]">
              THE TABLELINE EDGE
            </span>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
              From table scan to kitchen pass in 12 seconds.
            </h2>
            <p className="mt-2.5 text-sm text-stone-600 leading-relaxed">
              A thoughtful experience designed to eliminate friction for both guests and restaurant staff.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] mb-4">
                <QrCode className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-stone-900">The Table Plaque</h3>
              <p className="mt-2 text-xs text-stone-600 leading-relaxed">
                Unique QR code for every table with your brand, ready to print and display.
              </p>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] mb-4">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-stone-900">Instant Browser Menu</h3>
              <p className="mt-2 text-xs text-stone-600 leading-relaxed">
                A beautiful, photo-rich menu that loads in under a second on any smartphone browser.
              </p>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] mb-4">
                <Bell className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-stone-900">Live Cook Chime</h3>
              <p className="mt-2 text-xs text-stone-600 leading-relaxed">
                Orders pop onto the kitchen display with an audible chime and automatic ticket print.
              </p>
            </div>

            {/* Card 4 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] mb-4">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-stone-900">Calm Closeout</h3>
              <p className="mt-2 text-xs text-stone-600 leading-relaxed">
                Guests pay at the counter via UPI or cash, and staff mark tables ready for the next party.
              </p>
            </div>
          </div>
        </section>

        {/* 4. "INTERACTIVE FLOOR VIEW" SECTION */}
        <section id="floor-view" className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t border-stone-200/80 overflow-hidden">
          {/* Subtle Decorative Table Number Stamp (Low prominence) */}
          <div className="absolute left-8 top-8 pointer-events-none select-none opacity-15 hidden md:block" aria-hidden="true">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#2D1E18] font-bold border border-stone-400/30 px-2.5 py-1 rounded">
              SECT 04 • TABLE 07
            </span>
          </div>

          <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C85A32]">
              INTERACTIVE FLOOR VIEW
            </span>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
              One system. Three synchronized perspectives.
            </h2>
            <p className="mt-2.5 text-sm text-stone-600 leading-relaxed">
              See how the same order looks to the guest, the kitchen staff, and the manager in real-time.
            </p>

            {/* View Selector Pills */}
            <div className="mt-6 inline-flex p-1 rounded-xl bg-stone-200/70 border border-stone-300/60 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFloorTab("menu")}
                className={`px-4 py-2 rounded-lg transition-all ${
                  floorTab === "menu"
                    ? "bg-[#3E2723] text-white shadow-xs"
                    : "text-stone-700 hover:text-stone-950"
                }`}
              >
                1 Guest Menu
              </button>
              <button
                type="button"
                onClick={() => setFloorTab("kitchen")}
                className={`px-4 py-2 rounded-lg transition-all ${
                  floorTab === "kitchen"
                    ? "bg-[#3E2723] text-white shadow-xs"
                    : "text-stone-700 hover:text-stone-950"
                }`}
              >
                2 Kitchen Pass (KDS)
              </button>
              <button
                type="button"
                onClick={() => setFloorTab("dashboard")}
                className={`px-4 py-2 rounded-lg transition-all ${
                  floorTab === "dashboard"
                    ? "bg-[#3E2723] text-white shadow-xs"
                    : "text-stone-700 hover:text-stone-950"
                }`}
              >
                3 Admin Dashboard
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-8 items-center">
            {/* Left Column: Descriptive Benefits */}
            <div className="space-y-6">
              <div className="rounded-2xl bg-white p-6 sm:p-8 border border-stone-200 shadow-2xs">
                <h3 className="font-serif text-2xl font-bold text-stone-900">
                  {floorTab === "menu" && "A Seamless Dining Experience"}
                  {floorTab === "kitchen" && "Order Rhythm for Line Cooks"}
                  {floorTab === "dashboard" && "Full Floor Control in Real-Time"}
                </h3>
                <p className="mt-3 text-sm text-stone-600 leading-relaxed">
                  {floorTab === "menu" &&
                    "Guests can browse your menu, customise their items, and send orders to the kitchen — all from their phone."}
                  {floorTab === "kitchen" &&
                    "Kitchen staff see live tickets grouped by table with prep timers, order modifications, and audible alerts."}
                  {floorTab === "dashboard" &&
                    "Operators monitor active tables, bill settlements, revenue velocity, and popular menu items from one calm screen."}
                </p>

                <div className="mt-6 space-y-3 font-medium text-xs text-stone-800">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#3E2723] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span>No app download or sign-up required</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#3E2723] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span>Fast, intuitive, and touch-optimized</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#3E2723] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span>High-resolution dish photos & dietary tags</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#3E2723] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span>Synchronized instantly across table, pass, and register</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Live Interactive Device Frame */}
            <div className="relative rounded-2xl bg-white border border-stone-200 shadow-md p-4 sm:p-6 overflow-hidden">
              {/* Handwritten Perspective Label */}
              <div className="absolute top-4 right-6 pointer-events-none z-10 hidden sm:flex items-center gap-1.5">
                <span className="font-handwriting text-xl text-stone-700 font-bold">
                  {floorTab === "menu" && "Guest View ⤹"}
                  {floorTab === "kitchen" && "Kitchen View ⤹"}
                  {floorTab === "dashboard" && "Owner View ⤹"}
                </span>
              </div>

              {/* View 1: Guest Menu */}
              {floorTab === "menu" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-800">
                        The Roast Room • Table 04
                      </span>
                      <p className="font-serif text-base font-bold text-stone-900">Signature Brunch Menu</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px] font-semibold">
                      Table Active
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 flex items-center gap-3 justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src="/pastry_croissant.jpg"
                          alt="Wild Truffle Tartine"
                          className="w-12 h-12 rounded-lg object-cover shrink-0 shadow-2xs"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-900 truncate">Wild Truffle Tartine</p>
                          <p className="text-[10.5px] text-stone-500 truncate">Sourdough, herb creme</p>
                          <p className="text-xs font-bold text-stone-900 mt-0.5">₹340</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#3E2723] text-white text-[10px] font-bold shrink-0">
                        ADD
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 flex items-center gap-3 justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src="/hero_coffee_landscape.jpg"
                          alt="Cascara Cold Brew"
                          className="w-12 h-12 rounded-lg object-cover shrink-0 shadow-2xs"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-900 truncate">Cascara Cold Brew</p>
                          <p className="text-[10.5px] text-stone-500 truncate">18hr cold brew, orange</p>
                          <p className="text-xs font-bold text-stone-900 mt-0.5">₹220</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#3E2723] text-white text-[10px] font-bold shrink-0">
                        ADD
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-stone-900 text-white flex items-center justify-between text-xs">
                    <div>
                      <span className="text-stone-300">2 Items in Cart</span>
                      <p className="font-bold text-amber-300">Total: ₹560</p>
                    </div>
                    <span className="font-bold bg-white text-stone-900 px-3 py-1.5 rounded-lg text-[11px]">
                      Send Order to Kitchen →
                    </span>
                  </div>
                </div>
              )}

              {/* View 2: Kitchen Pass (KDS) */}
              {floorTab === "kitchen" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-mono text-xs font-bold text-stone-800">
                        KDS PASS 01 • ACTIVE ORDERS (3)
                      </span>
                    </div>
                    <span className="text-xs text-stone-500 font-mono">Synced</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Ticket 1 */}
                    <div className="p-3.5 rounded-xl border-2 border-stone-800 bg-white shadow-xs">
                      <div className="flex items-center justify-between pb-1.5 border-b border-stone-100 font-mono text-[11px]">
                        <span className="font-bold text-stone-900">Table 04 • #K1042</span>
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                          3m ago
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between font-medium">
                          <span>1x Cascara Cold Brew</span>
                          <span className="text-amber-800">Fired</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>1x Wild Truffle Tartine</span>
                          <span className="text-emerald-700">Prep</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-stone-100 flex justify-between items-center text-[10.5px]">
                        <span className="font-mono text-stone-500">PIN: 4182</span>
                        <span className="font-bold text-stone-900 bg-stone-100 px-2 py-1 rounded">
                          Mark Ready
                        </span>
                      </div>
                    </div>

                    {/* Ticket 2 */}
                    <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/80">
                      <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 font-mono text-[11px]">
                        <span className="font-bold text-stone-900">Table 01 • #K1041</span>
                        <span className="text-stone-500">8m ago</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between font-medium text-stone-700">
                          <span>2x Espresso Tonic</span>
                          <span className="text-emerald-700 font-bold">Ready</span>
                        </div>
                        <div className="flex justify-between font-medium text-stone-700">
                          <span>1x Brioche Toast</span>
                          <span className="text-emerald-700 font-bold">Ready</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-stone-200 flex justify-between items-center text-[10.5px]">
                        <span className="font-mono text-stone-500">PIN: 1849</span>
                        <span className="text-emerald-700 font-semibold">Served ✓</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* View 3: Admin Dashboard */}
              {floorTab === "dashboard" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500">
                        Shift Summary • Friday Afternoon
                      </span>
                      <p className="font-serif text-base font-bold text-stone-900">Dining Room Live Pulse</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-stone-900 text-white font-mono text-[10px] font-semibold">
                      16 Tables Synced
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                      <p className="text-[10px] font-mono text-stone-500 uppercase">Today's Sales</p>
                      <p className="text-base sm:text-lg font-serif font-bold text-stone-900">₹14,850</p>
                    </div>
                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                      <p className="text-[10px] font-mono text-stone-500 uppercase">Active Orders</p>
                      <p className="text-base sm:text-lg font-serif font-bold text-[#C85A32]">7 Tables</p>
                    </div>
                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
                      <p className="text-[10px] font-mono text-stone-500 uppercase">Avg Prep Time</p>
                      <p className="text-base sm:text-lg font-serif font-bold text-emerald-800">8.4 mins</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-stone-100/70 border border-stone-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Printer className="w-4 h-4 text-stone-600" />
                      <span className="font-medium text-stone-800">Kitchen & Bar Thermal Printers</span>
                    </div>
                    <span className="text-emerald-700 font-bold font-mono text-[11px]">Online (Wi-Fi)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 5. AI MENU IMPORT */}
        <section id="ai-menu" className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t border-stone-200/80">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
            {/* Left Column: Descriptive Content & Step Workflow */}
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C85A32]">
                AI MENU IMPORT
              </span>
              <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
                Turn your paper menu into a digital menu in minutes.
              </h2>
              <p className="mt-2.5 text-sm sm:text-base text-stone-600 leading-relaxed font-sans">
                Upload a menu photo and let Tableline help turn it into digital menu items.
              </p>

              {/* Step Flow Ribbon */}
              <div className="mt-6 p-3.5 rounded-xl bg-white border border-stone-200 shadow-2xs">
                <p className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-2">
                  HOW AI MENU IMPORT WORKS
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-800 font-medium">
                  <span className="px-2.5 py-1 rounded-md bg-stone-100 text-stone-900 font-semibold">Upload Image</span>
                  <span className="text-stone-400">→</span>
                  <span className="px-2.5 py-1 rounded-md bg-stone-100 text-stone-900 font-semibold">AI Extracts Info</span>
                  <span className="text-stone-400">→</span>
                  <span className="px-2.5 py-1 rounded-md bg-stone-100 text-stone-900 font-semibold">Review</span>
                  <span className="text-stone-400">→</span>
                  <span className="px-2.5 py-1 rounded-md bg-stone-100 text-stone-900 font-semibold">Edit</span>
                  <span className="text-stone-400">→</span>
                  <span className="px-2.5 py-1 rounded-md bg-[#3E2723] text-white font-semibold">Save</span>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#3E2723] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="font-serif text-base font-bold text-stone-900">Automatic Draft Extraction</h3>
                    <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                      Upload a photo or PDF of your physical menu. Tableline identifies dish titles, descriptions, categories, and prices into editable drafts.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#3E2723] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="font-serif text-base font-bold text-stone-900">You Are Always in Control</h3>
                    <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                      Review, adjust, or tweak every item and price before saving. Nothing is published to guests without your explicit confirmation.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Tactile Menu Extraction Preview Card */}
            <div className="relative">
              {/* Handwritten Note */}
              <div className="absolute -top-6 right-6 z-20 hidden sm:flex items-center gap-1.5 pointer-events-none">
                <span className="font-handwriting text-2xl text-stone-700 font-bold">
                  Review &amp; Edit ⤹
                </span>
              </div>

              {/* Extraction Preview Card */}
              <div className="rounded-2xl bg-white p-5 sm:p-6 border border-stone-200 shadow-md">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 font-mono text-[10.5px] font-bold">
                    <Sparkles className="w-3 h-3 text-[#C85A32]" /> AI MENU EXTRACTION
                  </span>
                  <span className="text-[11px] font-mono text-stone-500">Draft Status: Needs Review</span>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-4 items-center">
                  <div className="w-full sm:w-36 h-28 rounded-xl overflow-hidden shadow-2xs shrink-0 border border-stone-200">
                    <img
                      src="/cafe_photo_3.jpg"
                      alt="Physical printed cafe menu being digitized"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0 w-full space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-base font-bold text-stone-900">
                        Cascara Cold Brew
                      </span>
                      <span className="font-serif font-bold text-stone-900 text-sm">₹220</span>
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Single-origin Ethiopian cold brew infused with sun-dried coffee cherry husk and citrus peel.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-[10.5px] font-medium">
                        Category: Cold Beverages
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10.5px] font-medium">
                        Veg
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-[11px] text-stone-500 font-sans">
                    Extracted 28 items from page 1
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-800 text-xs font-semibold"
                    >
                      Edit Item
                    </button>
                    <button
                      type="button"
                      className="px-3.5 py-1.5 rounded-lg bg-[#3E2723] hover:bg-[#2D1B18] text-white text-xs font-bold shadow-2xs"
                    >
                      Save to Menu ✓
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. "ENGINEERED FOR BUSY SHIFTS" - 3 COLUMN FEATURE GRID */}
        <section id="features" className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t border-stone-200/80 overflow-hidden">
          {/* Subtle Decorative Botanical Leaf Sprig (Low prominence) */}
          <div className="absolute left-6 top-8 pointer-events-none select-none opacity-10 hidden sm:block" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="currentColor" className="w-12 h-12 text-[#2D1E18]">
              <path d="M20 5C20 5 21 12 16 16C11 20 5 20 5 20C5 20 12 21 16 26C20 31 20 37 20 37C20 37 21 30 26 26C31 22 37 22 37 22C37 22 30 21 26 16C22 11 20 5 20 5Z" />
            </svg>
          </div>

          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C85A32]">
              ROBUST ARCHITECTURE
            </span>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
              Engineered for busy shifts and demanding floors.
            </h2>
            <p className="mt-2.5 text-sm text-stone-600 leading-relaxed">
              Powerful features to keep your restaurant running smoothly, always.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">Printable Table Plaques</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Custom QR codes formatted with your restaurant's branding, table numbers, and security PINs.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] shrink-0">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">Kitchen Display System</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Real-time ticket routing with audio chime alerts, elapsed time counters, and station routing.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] shrink-0">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">ESC/POS Thermal Printing</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Automatic printing on standard thermal receipt printers for both kitchen passes and billing counters.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">Waiter Calls &amp; Diner Reviews</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Guests can call waitstaff, request cutlery or water, and leave diner reviews directly from their table screen.
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">Flexible Settlement &amp; Bills</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  UPI, cards, or cash at counter with custom receipts, split bills, and order closeout.
                </p>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl bg-white p-6 border border-stone-200 shadow-2xs flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-[#3E2723] shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">Staff Permissions &amp; Shift Close</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Granular role permissions (RBAC) with security audit trail logs and day-end shift settlement.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. TRANSPARENT PRICING LADDER (GROWTH HIGHLIGHTED) */}
        <section id="pricing" className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t border-stone-200/80">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C85A32]">
              TRANSPARENT PRICING
            </span>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
              Simple plans scaled for your room.
            </h2>
            <p className="mt-2.5 text-sm text-stone-600 leading-relaxed">
              Run your tables, orders, kitchen and bills in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
            {DEFAULT_PLANS.map((plan) => {
              const isGrowth = plan.id === "growth";

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl bg-white p-6 sm:p-8 flex flex-col justify-between transition-all ${
                    isGrowth
                      ? "border-2 border-stone-800 shadow-xl scale-[1.02] z-10"
                      : "border border-stone-200 shadow-2xs hover:shadow-md"
                  }`}
                >
                  {/* Most Popular Badge for Growth Plan */}
                  {isGrowth && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="px-3.5 py-1 rounded-full bg-[#3E2723] text-white font-mono text-[10px] font-bold uppercase tracking-wider shadow-sm">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div>
                    <h3 className="font-serif text-2xl font-bold text-stone-900">{plan.name}</h3>
                    {plan.tagline && (
                      <p className="mt-1 text-xs text-stone-500 leading-relaxed min-h-[32px]">{plan.tagline}</p>
                    )}

                    <div className="mt-5 pb-5 border-b border-stone-100">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl text-stone-900">
                          <span className="font-sans font-semibold tracking-tight">
                            ₹{plan.monthlyFee.toLocaleString("en-IN")}
                          </span>
                        </span>
                        <span className="text-xs text-stone-500 font-sans">/ month</span>
                      </div>
                      <p className="mt-2 text-[11px] font-mono text-stone-600 font-medium">
                        + <span className="font-sans font-semibold tracking-tight">₹{plan.setupFee.toLocaleString("en-IN")}</span> one-time onboarding &amp; QR hardware setup
                      </p>
                    </div>

                    <div className="mt-6 space-y-3">
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-xs text-stone-700">
                          <Check className="w-4 h-4 text-[#C85A32] shrink-0 stroke-[2.5] mt-0.5" />
                          <span className="leading-snug">{formatFeatureBullet(feature)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-stone-100">
                    <a
                      href="#contact"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, requestedPlan: plan.id }))
                      }
                      className={`w-full py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        isGrowth
                          ? "bg-[#3E2723] hover:bg-[#2D1B18] text-white shadow-sm"
                          : "border border-stone-300 bg-white hover:bg-stone-50 text-stone-900"
                      }`}
                    >
                      {plan.cta}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 8. FREQUENTLY ASKED QUESTIONS (VERTICAL ACCORDION) */}
        <section id="faq" className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t border-stone-200/80">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 sm:mb-10 max-w-4xl mx-auto">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C85A32]">
                CLEAR ANSWERS
              </span>
              <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
                Frequently Asked Questions
              </h2>
            </div>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 text-xs font-bold text-white bg-[#3E2723] hover:bg-[#2D1B18] px-4 py-2.5 rounded-xl shadow-xs self-start md:self-auto transition-colors"
            >
              Still have questions? Contact Us
            </a>
          </div>

          {/* Single Vertical Accordion List */}
          <div className="max-w-4xl mx-auto space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="rounded-2xl bg-white border border-stone-200/90 shadow-2xs overflow-hidden transition-all duration-200 hover:border-stone-300"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full text-left px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-4 font-serif font-bold text-base sm:text-lg text-stone-900 hover:text-stone-950 transition-colors cursor-pointer"
                  >
                    <span className="leading-snug">{faq.q}</span>
                    <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0 text-[#2D1E18] transition-colors">
                      {isOpen ? (
                        <Minus className="w-4 h-4 stroke-[2.5]" />
                      ) : (
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-5 sm:px-6 pb-5 pt-0 text-xs sm:text-sm text-stone-600 leading-relaxed border-t border-stone-100/90 font-sans mt-1">
                      <div className="pt-3">
                        {faq.a}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 9. ONBOARDING REQUEST FORM ("LET'S GET YOUR RESTAURANT ONLINE") */}
        <section id="contact" className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t border-stone-200/80">
          <span id="onboarding" className="sr-only" />
          <div className="relative rounded-3xl bg-[#18110D] text-white overflow-hidden p-6 sm:p-10 lg:p-12 shadow-2xl border border-stone-800">
            {/* Background Texture & Ambient Hospitality Glow */}
            <div className="absolute inset-0 bg-radial-at-tr from-amber-900/20 via-transparent to-transparent pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-10 lg:gap-12 items-start">
              {/* Left Column: Heading, Value Props & Real Hospitality Atmosphere Image */}
              <div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">
                  ONBOARDING & SETUP
                </span>
                <h2 className="mt-2 font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
                  Let's Get Your Restaurant Online
                </h2>
                <p className="mt-3.5 text-sm sm:text-base text-stone-300 leading-relaxed max-w-md">
                  Tell us a bit about your restaurant and we'll handle the rest. We configure your menu, generate branded table plaques, and train your staff.
                </p>

                <div className="mt-7 space-y-3.5 text-xs sm:text-sm text-stone-300">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span>Free menu digitalization & dish photo staging</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span>Print-ready PDF table plaque templates</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                    <span>Dedicated operator support on WhatsApp</span>
                  </div>
                </div>

                {/* Handwritten Annotation */}
                <div className="mt-6 flex items-center gap-2">
                  <span className="font-handwriting text-2xl text-amber-200/90 font-bold">
                    Start Your Journey Today ♡
                  </span>
                </div>

                {/* Integrated Hospitality Atmosphere Photography Card */}
                <div className="mt-8 relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-stone-950/70 max-w-md group">
                  <img
                    src="/table_scene_full.jpg"
                    alt="Warm artisan restaurant dining atmosphere"
                    className="w-full h-44 sm:h-48 object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/25 to-transparent pointer-events-none" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono text-stone-300">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Floor Setup Assistant
                    </span>
                    <span className="text-amber-300 font-semibold">Live in 2 hours</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Refined Warm White Form Card */}
              <div className="rounded-2xl bg-[#FCFAF7] text-stone-900 p-6 sm:p-8 shadow-xl border border-stone-200/80">
                {formSuccess ? (
                  <div className="py-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                      <Check className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <h3 className="font-serif text-2xl font-bold text-stone-900">
                      Request Received!
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-600 max-w-sm mx-auto leading-relaxed">
                      Thank you for choosing Tableline. Our onboarding team will reach out within 2 hours to configure your dining room.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFormSuccess(false)}
                      className="mt-4 px-5 py-2.5 rounded-full text-xs font-bold bg-[#2D1E18] text-white hover:bg-[#1a110e] transition-colors cursor-pointer"
                    >
                      Submit Another Request
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleLeadSubmit} className="space-y-4">
                    {formError && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                        {formError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                          Restaurant Name*
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.restaurantName}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, restaurantName: e.target.value }))
                          }
                          placeholder="e.g. The Urban Cafe"
                          className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-xs focus:border-[#2D1E18] focus:ring-1 focus:ring-[#2D1E18] outline-hidden transition-all shadow-2xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                          Owner / Manager Name*
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.ownerName}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, ownerName: e.target.value }))
                          }
                          placeholder="e.g. Rohit Mehta"
                          className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-xs focus:border-[#2D1E18] focus:ring-1 focus:ring-[#2D1E18] outline-hidden transition-all shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                          Phone Number*
                        </label>
                        <input
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData((prev) => ({ ...prev, phone: val }));
                            saveFormToStorage({ ...formData, phone: val });
                          }}
                          placeholder="e.g. +91 98765 43210"
                          className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-xs focus:border-[#2D1E18] focus:ring-1 focus:ring-[#2D1E18] outline-hidden transition-all shadow-2xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                          City*
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.city}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData((prev) => ({ ...prev, city: val }));
                            saveFormToStorage({ ...formData, city: val });
                          }}
                          placeholder="e.g. Mumbai, Maharashtra"
                          className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-xs focus:border-[#2D1E18] focus:ring-1 focus:ring-[#2D1E18] outline-hidden transition-all shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Email Field with In-Form Verification Action */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                          Email Address*
                        </label>
                        {isEmailVerified ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300 shadow-2xs">
                            <Check className="w-3.5 h-3.5 stroke-[3] text-emerald-600" />
                            <span>Email Verified</span>
                          </span>
                        ) : verificationSent ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                            </span>
                            Verification link sent
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="email"
                            required
                            value={formData.email}
                            disabled={isEmailVerified || isVerifying}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormData((prev) => ({ ...prev, email: val }));
                              saveFormToStorage({ ...formData, email: val });
                              if (isEmailVerified) setIsEmailVerified(false);
                              if (verificationSent) setVerificationSent(false);
                              setEmailVerificationError("");
                            }}
                            placeholder="owner@gmail.com"
                            className={`w-full h-11 px-3.5 rounded-xl border text-xs outline-hidden transition-all shadow-2xs ${
                              isEmailVerified
                                ? "pl-9 border-2 border-emerald-500 bg-emerald-50/80 text-emerald-950 font-bold ring-2 ring-emerald-500/20 cursor-not-allowed"
                                : "border-stone-200 bg-white text-stone-900 focus:border-[#2D1E18] focus:ring-1 focus:ring-[#2D1E18]"
                            }`}
                          />
                          {isEmailVerified && (
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </div>
                          )}
                        </div>

                        {isEmailVerified ? (
                          <div className="h-11 px-3.5 rounded-xl bg-emerald-600 border border-emerald-700 text-white text-xs font-bold flex items-center gap-2 shrink-0 select-none shadow-sm">
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>✓ Email Verified</span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEmailVerified(false);
                                setVerificationSent(false);
                                setVerificationSessionId("");
                                window.sessionStorage.removeItem("tableline_verification_session");
                              }}
                              className="ml-1 px-1.5 py-0.5 rounded bg-emerald-700/60 hover:bg-emerald-700 text-[10px] text-emerald-100 hover:text-white font-medium cursor-pointer transition-colors"
                              title="Change email address"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSendVerificationEmail}
                            disabled={isVerifying || !formData.email.trim() || verificationCooldown > 0}
                            className="h-11 px-4 rounded-xl bg-[#2D1E18] hover:bg-[#1a110e] text-white text-xs font-bold shrink-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.98]"
                          >
                            {isVerifying ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Sending…</span>
                              </span>
                            ) : (
                              <span>Send Verification Email</span>
                            )}
                          </button>
                        )}
                      </div>

                      {emailVerificationError && (
                        <p className="text-[11px] text-rose-600 font-medium mt-1 leading-normal">
                          {emailVerificationError}
                        </p>
                      )}

                      {/* Prominent Green Banner when Verified */}
                      {isEmailVerified && (
                        <div className="mt-2.5 p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-400/90 text-emerald-950 flex items-start gap-3 shadow-xs animate-in fade-in duration-300">
                          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold text-emerald-950">
                                ✓ Email Verified
                              </p>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 border border-emerald-300">
                                Confirmed
                              </span>
                            </div>
                            <p className="text-[11px] text-emerald-800 mt-1 leading-relaxed font-medium">
                              Your email <span className="font-bold text-emerald-950 underline">{formData.email}</span> has been confirmed. You can now complete and submit your onboarding request below.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Proper 60-Second Mail Timer UI/UX */}
                      {verificationSent && !isEmailVerified && (
                        <div className="mt-2.5 p-4 rounded-2xl bg-amber-50/95 border border-amber-300/80 text-amber-950 space-y-3.5 shadow-xs animate-in fade-in slide-in-from-top-1 duration-300">
                          {/* Header with live sync pulse */}
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                              <Mail className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="font-bold text-stone-900 text-xs">
                                  Verification Email Sent
                                </p>
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-900 border border-amber-200 text-[10px] font-medium">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                  </span>
                                  Listening for your click...
                                </span>
                              </div>
                              <p className="text-stone-600 text-[11px] mt-1 leading-relaxed">
                                We sent a secure verification link to <span className="font-mono font-bold text-amber-950 underline">{formData.email}</span>. Click <span className="font-semibold text-stone-900">"Verify Email"</span> in your inbox to confirm.
                              </p>
                            </div>
                          </div>

                          {/* 60s Live Countdown Timer Bar & Badge */}
                          <div className="p-3 rounded-xl bg-white/90 border border-amber-200/90 space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Clock className={`w-4 h-4 ${verificationCooldown > 0 ? "text-amber-600 animate-spin" : "text-emerald-600"}`} />
                                <span className="text-[11px] font-bold text-stone-800">
                                  {verificationCooldown > 0 ? "Resend Cooldown Timer" : "Cooldown Complete"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-mono text-xs font-black px-2 py-0.5 rounded-md ${
                                  verificationCooldown > 0
                                    ? "bg-amber-100 text-amber-950 border border-amber-200"
                                    : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                }`}>
                                  {Math.floor(verificationCooldown / 60)}:{String(verificationCooldown % 60).padStart(2, "0")}
                                </span>
                                <span className="text-[10px] text-stone-500">
                                  {verificationCooldown > 0 ? `(${verificationCooldown}s)` : "(Ready)"}
                                </span>
                              </div>
                            </div>

                            {/* Smooth Progress Bar */}
                            <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden border border-stone-200/60">
                              <div
                                className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                                  verificationCooldown > 0
                                    ? "bg-gradient-to-r from-amber-500 to-[#C85A32]"
                                    : "bg-emerald-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.max(0, ((totalCooldownSeconds - verificationCooldown) / totalCooldownSeconds) * 100))}%`
                                }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-stone-500">
                              <span>60-second security timer</span>
                              <span>
                                {verificationCooldown > 0
                                  ? `${verificationCooldown}s remaining until resend`
                                  : "Resend is now available"}
                              </span>
                            </div>
                          </div>

                          {/* Footer: Help instructions & Resend Button */}
                          <div className="pt-2 border-t border-amber-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <p className="text-[11px] text-stone-600">
                              Didn't receive it? Check your <span className="font-semibold text-stone-800">Spam / Junk</span> folder.
                            </p>
                            <button
                              type="button"
                              disabled={isVerifying || verificationCooldown > 0}
                              onClick={handleSendVerificationEmail}
                              className={`h-9 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 ${
                                verificationCooldown > 0 || isVerifying
                                  ? "bg-stone-100 text-stone-400 border border-stone-200 cursor-not-allowed opacity-75"
                                  : "bg-[#2D1E18] hover:bg-[#1a110e] text-white active:scale-[0.98] cursor-pointer"
                              }`}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} />
                              <span>
                                {isVerifying
                                  ? "Sending..."
                                  : verificationCooldown > 0
                                  ? `Resend in ${verificationCooldown}s`
                                  : "Resend Verification Email"}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                        Number of Tables*
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={formData.numberOfTables}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev) => ({ ...prev, numberOfTables: val }));
                          saveFormToStorage({ ...formData, numberOfTables: val });
                        }}
                        className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-xs focus:border-[#2D1E18] focus:ring-1 focus:ring-[#2D1E18] outline-hidden transition-all shadow-2xs"
                      />
                    </div>

                    {/* Plan Selection Dropdown */}
                    <div className="space-y-1 relative">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                        Selected Service Plan
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setPlanDropdownOpen(!planDropdownOpen)}
                          className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-white text-xs text-left flex items-center justify-between text-stone-900 focus:border-[#2D1E18] focus:ring-1 focus:ring-[#2D1E18] outline-hidden shadow-2xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {formData.requestedPlan === "growth" && (
                                <>
                                  Growth — <span className="font-sans font-semibold tracking-tight">₹1,299</span>/mo (+ <span className="font-sans font-semibold tracking-tight">₹4,999</span> setup) — Most Popular
                                </>
                              )}
                              {formData.requestedPlan === "starter" && (
                                <>
                                  Starter — <span className="font-sans font-semibold tracking-tight">₹499</span>/mo (+ <span className="font-sans font-semibold tracking-tight">₹1,999</span> setup)
                                </>
                              )}
                              {formData.requestedPlan === "pro" && (
                                <>
                                  Pro — <span className="font-sans font-semibold tracking-tight">₹2,499</span>/mo (+ <span className="font-sans font-semibold tracking-tight">₹7,999</span> setup)
                                </>
                              )}
                            </span>
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-stone-500 transition-transform ${
                              planDropdownOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {planDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-stone-200 rounded-xl shadow-lg z-30 py-1.5 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, requestedPlan: "growth" }));
                                setPlanDropdownOpen(false);
                              }}
                              className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between transition-colors ${
                                formData.requestedPlan === "growth"
                                  ? "bg-stone-100 font-bold text-stone-950"
                                  : "text-stone-700 hover:bg-stone-50"
                              }`}
                            >
                              <div>
                                <span className="font-semibold">Growth Plan</span>
                                <span className="ml-2 text-stone-500 font-normal">
                                  <span className="font-sans font-semibold tracking-tight">₹1,299</span>/mo + <span className="font-sans font-semibold tracking-tight">₹4,999</span> setup
                                </span>
                              </div>
                              <span className="px-2 py-0.5 rounded-full bg-[#3E2723] text-white text-[10px] font-bold">
                                Most Popular
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, requestedPlan: "starter" }));
                                setPlanDropdownOpen(false);
                              }}
                              className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between transition-colors ${
                                formData.requestedPlan === "starter"
                                  ? "bg-stone-100 font-bold text-stone-950"
                                  : "text-stone-700 hover:bg-stone-50"
                              }`}
                            >
                              <div>
                                <span className="font-semibold">Starter Plan</span>
                                <span className="ml-2 text-stone-500 font-normal">
                                  <span className="font-sans font-semibold tracking-tight">₹499</span>/mo + <span className="font-sans font-semibold tracking-tight">₹1,999</span> setup
                                </span>
                              </div>
                              <span className="text-[11px] text-stone-400">
                                Up to <span className="font-sans font-semibold tracking-tight">5</span> Tables
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, requestedPlan: "pro" }));
                                setPlanDropdownOpen(false);
                              }}
                              className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between transition-colors ${
                                formData.requestedPlan === "pro"
                                  ? "bg-stone-100 font-bold text-stone-950"
                                  : "text-stone-700 hover:bg-stone-50"
                              }`}
                            >
                              <div>
                                <span className="font-semibold">Pro Plan</span>
                                <span className="ml-2 text-stone-500 font-normal">
                                  <span className="font-sans font-semibold tracking-tight">₹2,499</span>/mo + <span className="font-sans font-semibold tracking-tight">₹7,999</span> setup
                                </span>
                              </div>
                              <span className="text-[11px] text-stone-400">Unlimited Capacity</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Optional Notes / Message */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                        Special Requirements or Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={formData.message}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, message: e.target.value }))
                        }
                        placeholder="Any current POS software, hardware details, or launch timeline..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-xs focus:border-[#2D1E18] focus:ring-1 focus:ring-[#2D1E18] outline-hidden transition-all shadow-2xs resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={formSubmitting || !isEmailVerified}
                      className={`w-full h-12 rounded-full font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] mt-2 shadow-[0_8px_25px_rgba(45,30,24,0.18)] disabled:opacity-50 disabled:cursor-not-allowed ${
                        isEmailVerified
                          ? "bg-emerald-700 hover:bg-emerald-800 text-white ring-2 ring-emerald-500/40 shadow-[0_8px_25px_rgba(4,120,87,0.28)]"
                          : "bg-[#2D1E18] hover:bg-[#1a110e] text-white"
                      }`}
                    >
                      {formSubmitting ? (
                        <span>Submitting Request…</span>
                      ) : !isEmailVerified ? (
                        <span className="flex items-center gap-2 text-stone-300">
                          <Clock className="w-4 h-4 opacity-75" />
                          <span>Verify Email Above to Continue</span>
                          <ArrowRight className="w-4 h-4 opacity-50" />
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-white">
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>✓ Email Verified — Request Free Onboarding</span>
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 10. EDITORIAL FOOTER */}
      <footer className="border-t border-stone-200/80 bg-white py-12 text-stone-700 text-xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <BrandAtelierMark withAtelier />
            <span className="hidden sm:inline text-stone-300">|</span>
            <span className="text-stone-500 text-[11px]">
              Independent Dining Architecture
            </span>
          </div>

          <div className="flex items-center gap-6 font-medium text-stone-600">
            <a href="#features" className="hover:text-stone-900 transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-stone-900 transition-colors">
              How It Works
            </a>
            <a href="#pricing" className="hover:text-stone-900 transition-colors">
              Pricing
            </a>
            <a href="#faq" className="hover:text-stone-900 transition-colors">
              FAQ
            </a>
            <Link href="/login" className="hover:text-stone-900 transition-colors">
              Operator Portal
            </Link>
          </div>

          <p className="text-stone-500 font-mono text-[11px]">
            © {new Date().getFullYear()} Tableline. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
