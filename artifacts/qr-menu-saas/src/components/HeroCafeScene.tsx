import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  UtensilsCrossed,
  Coffee,
  Check,
  ShoppingBag,
  X,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Camera,
  ScanLine,
  ChefHat,
  Clock,
} from "lucide-react";
import QRCode from "qrcode";

interface HeroCafeSceneProps {
  className?: string;
}

/**
 * Editorial, tactile Hero Product Composition:
 * 1. A matte-white card with a clean black QR code layered slightly behind the phone on the left.
 * 2. A photorealistic modern smartphone with a matte black bezel displaying:
 *    - Phase 1: Real-time Camera QR scanning with animated laser reticle
 *    - Phase 2: Sleek editorial menu fetching transition
 *    - Phase 3: Interactive digital menu with food-to-cart flying particle animation
 *    - Phase 4: Dynamic slide-up cart drawer (showing ₹220 if unopened, or ₹560 if ₹340 toast added)
 *    - Phase 5: Google Pay animated UPI confirmation with expanding ripples, check bounce & confetti!
 * 3. A physical polaroid photo of a real barista pouring latte art peeking out from behind the bottom right.
 * 4. A delicate handwritten note reading "Scan Order Enjoy ♡" with a hand-drawn SVG arrow pointing to the phone.
 * Soft, diffused natural studio lighting and ultra-realistic subtle drop shadows.
 */
export function HeroCafeScene({ className = "" }: HeroCafeSceneProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  // Mobile Screen Interactive & Animation States
  type ScreenState = "scan" | "fetching" | "menu" | "cart" | "processing" | "success";
  const [screenState, setScreenState] = useState<ScreenState>("scan");
  const isScanning = screenState === "scan";
  const [qrDetected, setQrDetected] = useState<boolean>(false);
  const [toastAdded, setToastAdded] = useState<boolean>(false);
  const [croissantAdded, setCroissantAdded] = useState<boolean>(false);
  const [isFlyingFood, setIsFlyingFood] = useState<boolean>(false);
  const [flyingParticle, setFlyingParticle] = useState<{ emoji: string; text: string }>({
    emoji: "🍞",
    text: "+₹340",
  });
  const [cartBumping, setCartBumping] = useState<boolean>(false);

  // Kitchen Display System (KDS) Notification States
  const [kdsAlert, setKdsAlert] = useState<boolean>(false);
  const [kdsReceived, setKdsReceived] = useState<boolean>(false);
  const [kdsPoppedOut, setKdsPoppedOut] = useState<boolean>(false);

  // Reference for the responsive mobile scaling container
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const [mobileScale, setMobileScale] = useState<number>(1);

  // Dynamically scale down the 3-part composition proportionally on mobile devices
  // ensuring the QR card, smartphone, and KDS card scale together elegantly without horizontal scrollbars
  useEffect(() => {
    const updateScale = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth < 640) {
        // Reference base composition width for mobile layout
        const baseWidth = 352;
        const available = Math.min(
          window.innerWidth - 20,
          sceneContainerRef.current?.parentElement?.clientWidth || window.innerWidth
        );
        if (available < baseWidth) {
          setMobileScale(Math.max(0.72, available / baseWidth));
        } else {
          setMobileScale(1);
        }
      } else {
        setMobileScale(1);
      }
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // Play subtle restaurant kitchen notification chime (two-tone marimba/service bell)
  const playKitchenChime = () => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const t = ctx.currentTime;

      // Note 1: C6 (1046.5 Hz) soft warm sine wave
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1046.5, t);
      gain1.gain.setValueAtTime(0.06, t);
      gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.35);

      // Note 2: E6 (1318.5 Hz) cheerful chime
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1318.5, t + 0.1);
      gain2.gain.setValueAtTime(0.06, t + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.1);
      osc2.stop(t + 0.55);
    } catch {
      // Gracefully ignore if autoplay policy blocks audio before user interaction
    }
  };

  // Synchronize KDS notification when payment succeeds
  // Holds popped-out state for exactly 3 seconds, then smoothly tucks back
  useEffect(() => {
    if (screenState === "success") {
      playKitchenChime();
      setKdsAlert(true);
      setKdsReceived(true);
      setKdsPoppedOut(true);

      const timer = setTimeout(() => {
        setKdsPoppedOut(false);
        setKdsAlert(false);
      }, 3000);

      return () => clearTimeout(timer);
    } else if (screenState === "scan" || screenState === "fetching" || screenState === "menu") {
      setKdsAlert(false);
      setKdsReceived(false);
      setKdsPoppedOut(false);
    }
    return undefined;
  }, [screenState]);

  // Auto-demonstration vs Manual Interaction
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(true);
  const [pointer, setPointer] = useState<{
    visible: boolean;
    x: number;
    y: number;
    clicking: boolean;
  }>({ visible: false, x: 0, y: 0, clicking: false });

  const autoTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const manualTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Stop auto demonstration immediately when user interacts
  const stopAutoDemo = () => {
    if (autoTimeoutsRef.current.length > 0) {
      autoTimeoutsRef.current.forEach(clearTimeout);
      autoTimeoutsRef.current = [];
    }
    setIsAutoPlaying(false);
    setPointer({ visible: false, x: 0, y: 0, clicking: false });
  };

  // Dynamic cart calculations based on user actions:
  // Base item: Cascara Cold Brew (₹220)
  // French toast: +₹340
  // Croissant: +₹290
  const currentTotal =
    220 + (toastAdded ? 340 : 0) + (croissantAdded ? 290 : 0);
  const currentCount =
    1 + (toastAdded ? 1 : 0) + (croissantAdded ? 1 : 0);

  // Generate real QR code for Table 04
  useEffect(() => {
    let isMounted = true;
    const targetUrl =
      typeof window !== "undefined" && window.location.origin.includes("run.app")
        ? `${window.location.origin}/menu/the-roast-room/table/04`
        : "https://tableline.app/menu/the-roast-room/table/04";

    QRCode.toDataURL(targetUrl, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: "H",
      color: {
        dark: "#1F1714",
        light: "#FFFFFF",
      },
    })
      .then((url: string) => {
        if (isMounted) setQrCodeDataUrl(url);
      })
      .catch((err: unknown) => {
        console.warn("Could not generate QR data URL", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Action to start manual QR scanning (from QR plaque card, Scan button, etc.)
  const handleStartScan = (isManual = true) => {
    if (isManual) {
      stopAutoDemo();
    }
    manualTimeoutsRef.current.forEach(clearTimeout);
    manualTimeoutsRef.current = [];

    setScreenState("scan");
    setQrDetected(false);
    setToastAdded(false);
    setCroissantAdded(false);

    // 1. Scan laser sweeps for 2.2s -> detect QR (giving clear visibility to the scan)
    const t1 = setTimeout(() => {
      setQrDetected(true);
      // 2. Recognized badge shows for 1.0s -> fetching screen
      const t2 = setTimeout(() => {
        setScreenState("fetching");
        // 3. Fetching screen for 1.2s -> lands on menu page and STOPS there for manual user!
        const t3 = setTimeout(() => {
          setScreenState("menu");
          // STOPS AT MENU PAGE IN MANUAL MODE!
        }, 1200);
        manualTimeoutsRef.current.push(t3);
      }, 1000);
      manualTimeoutsRef.current.push(t2);
    }, 2200);
    manualTimeoutsRef.current.push(t1);
  };

  // Toggle French Toast (₹340)
  const handleToggleFrenchToast = (isManual = true) => {
    if (isManual) {
      stopAutoDemo();
    }
    if (!toastAdded) {
      setToastAdded(true);
      setFlyingParticle({ emoji: "🍞", text: "+₹340" });
      setIsFlyingFood(true);
      setTimeout(() => {
        setIsFlyingFood(false);
        setCartBumping(true);
        setTimeout(() => setCartBumping(false), 350);
      }, 450);
    } else {
      setToastAdded(false);
      setCartBumping(true);
      setTimeout(() => setCartBumping(false), 250);
    }
  };

  // Toggle Truffle Croissant (₹290)
  const handleToggleCroissant = (isManual = true) => {
    if (isManual) {
      stopAutoDemo();
    }
    if (!croissantAdded) {
      setCroissantAdded(true);
      setFlyingParticle({ emoji: "🥐", text: "+₹290" });
      setIsFlyingFood(true);
      setTimeout(() => {
        setIsFlyingFood(false);
        setCartBumping(true);
        setTimeout(() => setCartBumping(false), 350);
      }, 450);
    } else {
      setCroissantAdded(false);
      setCartBumping(true);
      setTimeout(() => setCartBumping(false), 250);
    }
  };

  // Action to open cart drawer
  const handleOpenCart = (isManual = true) => {
    if (isManual) {
      stopAutoDemo();
    }
    setScreenState("cart");
  };

  // Action to close cart drawer
  const handleCloseCart = (isManual = true) => {
    if (isManual) {
      stopAutoDemo();
    }
    setScreenState("menu");
  };

  // Action to pay & order (Google Pay animation flow)
  const handlePayOrder = (isManual = true) => {
    if (isManual) {
      stopAutoDemo();
    }
    setScreenState("processing");
    setTimeout(() => {
      setScreenState("success");
    }, 450);
  };

  // Reset back to menu directly
  const handleResetToMenu = (isManual = true) => {
    if (isManual) {
      stopAutoDemo();
    }
    setScreenState("menu");
  };

  // FIRST-TIME AUTOMATIC DEMONSTRATION:
  // Runs automatically once on initial load/reload without user interruption.
  // When all animation finishes (Scan -> Fetch -> Menu -> Add Food -> Open Cart -> Google Pay Done),
  // it goes back to the MENU PAGE and STOPS completely.
  // From then on, it is 100% manual for the user.
  useEffect(() => {
    autoTimeoutsRef.current.forEach(clearTimeout);
    autoTimeoutsRef.current = [];

    // Phase 1: Camera QR Scan (at 0ms)
    setScreenState("scan");
    setQrDetected(false);
    setToastAdded(false);
    setCroissantAdded(false);
    setIsAutoPlaying(true);
    setPointer({ visible: false, x: 0, y: 0, clicking: false });

    const schedule = (fn: () => void, delay: number) => {
      const t = setTimeout(fn, delay);
      autoTimeoutsRef.current.push(t);
    };

    // 1) QR Code recognized (at 2800ms - gives user 2.8s to clearly see camera laser sweeping)
    schedule(() => {
      setQrDetected(true);
    }, 2800);

    // 2) Fetching the menu transition (at 4000ms)
    schedule(() => {
      setScreenState("fetching");
    }, 4000);

    // 3) Arrives at Menu page (at 5200ms)
    schedule(() => {
      setScreenState("menu");
    }, 5200);

    // 4) Touch pointer appears and glides to French Toast "+ ADD" button (at 6200ms)
    schedule(() => {
      setPointer({ visible: true, x: 195, y: 170, clicking: false });
    }, 6200);

    // 5) Pointer clicks "+ ADD" (at 6900ms)
    schedule(() => {
      setPointer({ visible: true, x: 195, y: 170, clicking: true });
      setToastAdded(true);
      setFlyingParticle({ emoji: "🍞", text: "+₹340" });
      setIsFlyingFood(true);
      setTimeout(() => {
        setIsFlyingFood(false);
        setCartBumping(true);
        setTimeout(() => setCartBumping(false), 350);
      }, 450);
    }, 6900);

    // 6) Pointer releases (at 7300ms)
    schedule(() => {
      setPointer({ visible: true, x: 195, y: 170, clicking: false });
    }, 7300);

    // 7) Pointer moves to "View Order →" button on bottom cart bar (at 8100ms)
    schedule(() => {
      setPointer({ visible: true, x: 175, y: 382, clicking: false });
    }, 8100);

    // 8) Pointer clicks "View Order →" (at 8700ms)
    schedule(() => {
      setPointer({ visible: true, x: 175, y: 382, clicking: true });
      setScreenState("cart");
    }, 8700);

    // 9) Pointer releases and moves to "Pay with Google Pay" (at 9500ms - elevated y position)
    schedule(() => {
      setPointer({ visible: true, x: 120, y: 358, clicking: false });
    }, 9500);

    // 10) Pointer clicks "Pay with Google Pay" (at 10200ms)
    schedule(() => {
      setPointer({ visible: true, x: 120, y: 358, clicking: true });
      setScreenState("processing");
      setTimeout(() => {
        setScreenState("success");
      }, 450);
    }, 10200);

    // 11) Pointer hides for Google Pay celebration (at 10700ms)
    schedule(() => {
      setPointer({ visible: false, x: 0, y: 0, clicking: false });
    }, 10700);

    // 12) ALL ANIMATION DONE -> GO TO MENU PAGE AND STOP THERE! (at 15000ms)
    schedule(() => {
      setScreenState("menu");
      setToastAdded(false); // Clean reset so user can click to add
      setCroissantAdded(false);
      setIsAutoPlaying(false);
      setPointer({ visible: false, x: 0, y: 0, clicking: false });
      // STOPS HERE! No further loop or timeout!
    }, 15000);

    return () => {
      autoTimeoutsRef.current.forEach(clearTimeout);
      manualTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      ref={sceneContainerRef}
      className={`relative w-full max-w-[352px] sm:max-w-[540px] lg:max-w-[610px] mx-auto select-none ${className}`}
      style={{
        transform: mobileScale < 1 ? `scale(${mobileScale})` : undefined,
        transformOrigin: "top center",
        marginBottom: mobileScale < 1 ? `-${Math.round((1 - mobileScale) * 450)}px` : undefined,
      }}
      aria-label="Tableline physical table plaque, minimalist digital mobile menu, and barista latte art polaroid"
    >
      {/* 1. SOFT NATURAL DIFFUSED STUDIO LIGHTING (Flat, soft, non-glow, completely natural) */}
      <div
        className="absolute inset-0 -top-6 -bottom-6 -left-6 -right-6 pointer-events-none rounded-full opacity-60 blur-2xl"
        style={{
          background: "radial-gradient(ellipse at center, rgba(235,225,212,0.45) 0%, rgba(251,248,244,0) 75%)",
        }}
      />

      {/* Main Relative Container for the Composition */}
      <div className="relative flex items-center justify-center min-h-[445px] sm:min-h-[495px] lg:min-h-[520px] py-2 sm:py-4 w-full mx-auto">
        {/* ------------------------------------------------------------- */}
        {/* 2. MATTE-WHITE CARD WITH CLEAN BLACK QR CODE (Layered behind) */}
        {/* ------------------------------------------------------------- */}
        <div
          onClick={() => handleStartScan(true)}
          className={`absolute left-0 sm:left-3 lg:left-6 top-5 sm:top-8 lg:top-10 z-10 w-[142px] sm:w-[195px] lg:w-[215px] rounded-2xl bg-white p-3 sm:p-4 lg:p-5 border transition-all duration-700 ease-out cursor-pointer group select-none ${
            isScanning
              ? "-translate-x-2 sm:-translate-x-4 -rotate-6 scale-105 shadow-xl shadow-stone-900/12 border-[#2D1E18]/30 ring-2 ring-[#2D1E18]/10"
              : "translate-x-0 -rotate-3 scale-100 border-stone-200/90 shadow-[0_16px_40px_rgba(45,30,24,0.06),0_2px_8px_rgba(0,0,0,0.03)] hover:-rotate-1 hover:border-[#2D1E18]/40 hover:shadow-lg"
          }`}
          style={{ willChange: "transform" }}
          title="Click to scan Table 04 QR code"
        >
          {/* Card Brand Header */}
          <div className="flex items-center justify-between pb-2 sm:pb-2.5 border-b border-stone-100">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#2D1E18]" />
              <span className="font-serif text-[10px] sm:text-[11px] font-bold tracking-tight text-[#2D1E18]">
                Tableline
              </span>
            </div>
            <span className="font-mono text-[7.5px] sm:text-[8.5px] uppercase tracking-widest text-stone-400">
              Atelier
            </span>
          </div>

          {/* Table Badge */}
          <div className="text-center my-2 sm:my-2.5">
            <span className="font-mono text-[8.5px] sm:text-[9.5px] uppercase tracking-[0.2em] text-[#2D1E18] font-bold">
              TABLE <span className="font-sans tabular-nums">04</span>
            </span>
            <p className="text-[8px] sm:text-[9px] text-stone-500 font-sans mt-0.5">
              The Roast Room &bull; Main Floor
            </p>
          </div>

          {/* Precision Matte QR Code Graphic */}
          <div className="relative mx-auto w-24 h-24 sm:w-32 sm:h-32 bg-white rounded-xl border border-stone-200/90 p-1.5 sm:p-2 flex items-center justify-center shadow-xs overflow-hidden group-hover:border-stone-300 transition-colors">
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="Table 04 Real Dining Menu QR Code"
                className="w-full h-full object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 43 43"
                shapeRendering="crispEdges"
                className="w-full h-full"
              >
                <path
                  stroke="#1F1714"
                  d="M1 1.5h7m3 0h3m4 0h2m1 0h1m1 0h2m1 0h6m3 0h7M1 2.5h1m5 0h1m1 0h1m2 0h6m1 0h1m3 0h2m1 0h2m2 0h1m1 0h2m1 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m2 0h2m5 0h2m5 0h2m1 0h2m3 0h1m2 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m3 0h5m1 0h3m3 0h3m2 0h4m3 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m9 0h1m3 0h1m1 0h1m4 0h2m1 0h1m3 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h3m2 0h1m1 0h3m1 0h4m2 0h2m4 0h1m2 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h3m1 0h7m2 0h1m3 0h3m1 0h1m2 0h1M5 9.5h4m3 0h2m3 0h3m1 0h3m1 0h3m2 0h1m4 0h2m3 0h1M1 10.5h3m1 0h2m1 0h4m1 0h4m3 0h1m2 0h2m1 0h4m1 0h1m2 0h5m2 0h1M1 11.5h4m2 0h2m1 0h3m2 0h1m1 0h1m2 0h2m4 0h3m1 0h2m1 0h3m5 0h1M2 12.5h5m1 0h2m1 0h1m2 0h2m3 0h1m1 0h3m2 0h3m1 0h7m1 0h1m1 0h1M1 13.5h2m1 0h1m1 0h2m1 0h3m3 0h3m2 0h2m1 0h1m3 0h1m2 0h1m5 0h1M12 14.5h2m1 0h5m1 0h2m1 0h1m2 0h1m1 0h9m3 0h1M1 15.5h1m3 0h1m1 0h1m1 0h3m1 0h3m4 0h1m2 0h1m1 0h3m1 0h1m1 0h1m1 0h3m3 0h3M1 16.5h3m1 0h1m2 0h1m2 0h2m1 0h1m3 0h4m1 0h4m3 0h2m4 0h1m1 0h1m2 0h1M1 17.5h9m1 0h3m2 0h1m5 0h1m2 0h1m1 0h4m1 0h1m3 0h1m1 0h1m1 0h1M3 18.5h2m3 0h1m1 0h3m1 0h1m3 0h4m1 0h4m1 0h2m1 0h1m2 0h4m3 0h1M7 19.5h2m5 0h1m1 0h2m1 0h4m1 0h2m1 0h2m1 0h1m2 0h4m1 0h1m2 0h1M2 20.5h1m7 0h2m1 0h4m2 0h1m3 0h4m3 0h2m1 0h4m1 0h1m2 0h1M1 21.5h3m1 0h3m1 0h2m1 0h3m3 0h3m1 0h2m1 0h1m2 0h2m1 0h1m1 0h2m1 0h1m4 0h1M1 22.5h1m3 0h2m3 0h2m2 0h2m1 0h3m1 0h1m2 0h2m1 0h3m4 0h2m1 0h1m3 0h1M2 23.5h1m1 0h1m1 0h2m1 0h1m2 0h2m1 0h2m2 0h1m1 0h2m2 0h1m2 0h1m1 0h1m2 0h3m1 0h1m3 0h1M2 24.5h1m5 0h1m1 0h2m2 0h5m1 0h2m1 0h2m5 0h4m3 0h2m1 0h1M1 25.5h2m1 0h1m1 0h4m1 0h2m3 0h1m1 0h3m1 0h2m2 0h3m1 0h1m2 0h2m3 0h1M3 26.5h4m1 0h1m1 0h1m5 0h2m3 0h2m1 0h2m1 0h5m1 0h5m1 0h1m1 0h1M2 27.5h2m2 0h3m9 0h3m1 0h1m4 0h3m1 0h1m1 0h1m1 0h1m1 0h1m3 0h1M2 28.5h4m2 0h2m2 0h5m4 0h5m2 0h1m1 0h1m1 0h4m1 0h2m2 0h1M1 29.5h1m2 0h1m1 0h3m2 0h2m4 0h3m1 0h1m4 0h1m1 0h3m2 0h1M1 30.5h2m3 0h1m1 0h1m2 0h1m5 0h1m1 0h1m2 0h2m6 0h1m1 0h1m3 0h2m1 0h1m1 0h1M3 31.5h1m1 0h1m1 0h2m3 0h3m6 0h2m2 0h1m1 0h2m2 0h2m1 0h1m1 0h3m2 0h1M4 32.5h3m2 0h1m2 0h1m2 0h2m2 0h2m1 0h4m2 0h7m2 0h1m2 0h2M1 33.5h2m1 0h1m2 0h1m2 0h1m2 0h2m1 0h3m1 0h1m2 0h3m1 0h1m2 0h1m2 0h6m2 0h1M9 34.5h1m1 0h1m2 0h1m1 0h7m1 0h1m3 0h1m1 0h4m3 0h3m1 0h1M1 35.5h7m1 0h4m1 0h3m2 0h2m1 0h1m1 0h2m1 0h2m2 0h3m1 0h1m1 0h1m1 0h1m1 0h1M1 36.5h1m5 0h1m1 0h1m2 0h2m2 0h1m1 0h1m2 0h5m2 0h1m4 0h1m3 0h2m1 0h2M1 37.5h1m1 0h3m1 0h1m1 0h3m1 0h1m1 0h5m1 0h2m1 0h1m1 0h1m1 0h1m3 0h7m1 0h2M1 38.5h1m1 0h3m1 0h1m2 0h1m5 0h1m1 0h2m2 0h1m1 0h2m2 0h1m2 0h3m2 0h1m2 0h3M1 39.5h1m1 0h3m1 0h1m2 0h1m3 0h4m1 0h4m1 0h1m1 0h3m3 0h1m1 0h1m3 0h1m1 0h2M1 40.5h1m5 0h1m3 0h2m1 0h1m1 0h1m1 0h2m1 0h1m1 0h3m2 0h1m1 0h1m2 0h4m3 0h2M1 41.5h7m2 0h2m1 0h2m1 0h1m4 0h1m1 0h1m1 0h2m3 0h1m1 0h2m2 0h3m1 0h1"
                />
              </svg>
            )}
          </div>

          {/* Card Footer Caption */}
          <div className="text-center pt-1.5 sm:pt-2">
            <span className="block text-[9px] sm:text-[10px] font-bold tracking-wider text-[#2D1E18] group-hover:text-amber-800 transition-colors">
              Scan to Order
            </span>
            <div className="mt-0.5 sm:mt-1 inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full bg-stone-100 group-hover:bg-[#2D1E18] group-hover:text-white text-stone-600 font-mono text-[7.5px] sm:text-[8px] uppercase tracking-wider transition-colors shadow-2xs">
              <Camera className="w-2.5 h-2.5" />
              <span>Tap to Scan QR</span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 3. PHOTOREALISTIC MATTE BLACK BEZEL MODERN SMARTPHONE         */}
        {/* ------------------------------------------------------------- */}
        <div
          className="relative z-20 ml-4 sm:ml-16 lg:ml-16 w-[196px] sm:w-[235px] lg:w-[245px] rounded-[38px] sm:rounded-[44px] bg-[#141210] p-2 sm:p-2.5 lg:p-3 border border-stone-800 shadow-[0_25px_60px_rgba(45,30,24,0.18),0_10px_25px_rgba(0,0,0,0.08)] ring-1 ring-white/10 transition-transform duration-300 hover:scale-[1.01]"
        >
          {/* Inner Matte Phone Screen */}
          <div className="relative w-full h-[408px] sm:h-[435px] lg:h-[445px] rounded-[30px] sm:rounded-[36px] bg-white text-[#2D1E18] overflow-hidden border border-stone-200/70 shadow-inner flex flex-col justify-between select-none">
            {/* Embedded CSS Animations for Food to Cart & Google Pay */}
            <style>{`
              @keyframes flyFoodToCart {
                0% {
                  transform: translate(0, 0) scale(1);
                  opacity: 1;
                }
                25% {
                  transform: translate(-10px, -18px) scale(1.15);
                  opacity: 1;
                }
                70% {
                  transform: translate(-20px, 165px) scale(0.7);
                  opacity: 0.95;
                }
                100% {
                  transform: translate(-30px, 220px) scale(0.25);
                  opacity: 0;
                }
              }
              @keyframes gpayRipple1 {
                0% { transform: scale(0.75); opacity: 0.85; }
                100% { transform: scale(1.9); opacity: 0; }
              }
              @keyframes gpayRipple2 {
                0% { transform: scale(0.75); opacity: 0.6; }
                100% { transform: scale(2.4); opacity: 0; }
              }
              @keyframes gpayCheckPop {
                0% { transform: scale(0) rotate(-45deg); opacity: 0; }
                60% { transform: scale(1.22) rotate(4deg); opacity: 1; }
                85% { transform: scale(0.92) rotate(-1deg); }
                100% { transform: scale(1) rotate(0deg); opacity: 1; }
              }
              @keyframes confettiBurst {
                0% { transform: translate(0, 0) scale(0); opacity: 1; }
                50% { opacity: 1; }
                100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0; }
              }
              @keyframes laserSweep {
                0% { top: 6px; opacity: 0.9; }
                50% { top: calc(100% - 10px); opacity: 1; }
                100% { top: 6px; opacity: 0.9; }
              }
              @keyframes progressBarFill {
                0% { width: 0%; }
                40% { width: 60%; }
                100% { width: 100%; }
              }
            `}</style>

            {/* Dynamic Island & Status Bar (Always on Top) */}
            <div
              className={`relative z-40 pt-2 px-4 pb-1 transition-colors duration-300 flex items-center justify-between select-none ${
                screenState === "scan"
                  ? "bg-black/90 text-white"
                  : "bg-white/95 backdrop-blur-xs text-stone-900"
              }`}
            >
              <span className="text-[10px] font-semibold font-mono">9:41</span>
              {/* Dynamic Island pill */}
              <div className="w-16 h-3.5 rounded-full bg-[#141210] flex items-center justify-end px-1.5 shadow-xs border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="flex items-center gap-1 opacity-80">
                <span className="text-[9px] font-mono">5G</span>
                <div
                  className={`w-3.5 h-2 rounded-[2px] border p-0.5 flex items-center ${
                    screenState === "scan" ? "border-white" : "border-stone-700"
                  }`}
                >
                  <div
                    className={`w-full h-full rounded-2xs ${
                      screenState === "scan" ? "bg-white" : "bg-stone-700"
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* VIEW 1: CAMERA QR SCANNING ANIMATION                          */}
            {/* ------------------------------------------------------------- */}
            {screenState === "scan" && (
              <div
                onClick={() => handleStartScan(true)}
                className="relative flex-1 bg-[#12100E] text-white flex flex-col justify-between p-3 overflow-hidden select-none cursor-pointer"
              >
                {/* Viewfinder Top Bar */}
                <div className="flex items-center justify-between text-[8px] font-mono tracking-widest text-stone-400 px-1 pt-0.5">
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <Camera className="w-2.5 h-2.5" />
                    TABLE SCANNER 1x
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/90">
                    LIVE
                  </span>
                </div>

                {/* Central QR Viewfinder Box with Laser Sweeper */}
                <div className="relative mx-auto my-auto flex flex-col items-center">
                  <div className="relative w-36 h-36 rounded-2xl bg-black/60 border border-white/20 p-2.5 flex items-center justify-center shadow-2xl backdrop-blur-xs overflow-hidden">
                    {/* Glowing Emerald Corner Reticles */}
                    <div className="absolute top-1.5 left-1.5 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-400 rounded-tl" />
                    <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-400 rounded-tr" />
                    <div className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-400 rounded-bl" />
                    <div className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-400 rounded-br" />

                    {/* Laser Sweeper Line */}
                    <div
                      className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] z-20 pointer-events-none"
                      style={{
                        animation: "laserSweep 1.5s ease-in-out infinite",
                      }}
                    />

                    {/* QR Code in Viewfinder */}
                    <div className="w-24 h-24 bg-white p-1 rounded-lg shadow-inner flex items-center justify-center">
                      {qrCodeDataUrl ? (
                        <img
                          src={qrCodeDataUrl}
                          alt="Table 04 QR Code"
                          className="w-full h-full object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                      ) : (
                        <div className="w-full h-full bg-stone-900 rounded flex items-center justify-center text-[8px] font-mono text-white">
                          QR
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recognition Status Pill */}
                  <div className="mt-3">
                    {qrDetected ? (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 text-[8.5px] font-mono font-bold animate-pulse">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>Table 04 Recognized</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 text-stone-300 text-[8px] font-mono">
                        <ScanLine className="w-2.5 h-2.5 text-emerald-400" />
                        <span>Point camera at Table 04 QR</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Camera Shutter Indicator Footer */}
                <div className="flex items-center justify-between px-2 pt-1 border-t border-white/10">
                  <span className="text-[7.5px] font-mono text-stone-500">
                    The Roast Room
                  </span>
                  <div className="w-6 h-6 rounded-full border-2 border-white/70 p-0.5 flex items-center justify-center">
                    <div className="w-full h-full rounded-full bg-white" />
                  </div>
                  <span className="text-[7.5px] font-mono text-stone-500">
                    Auto-detect
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 2: FETCHING THE MENU STYLISH TRANSITION                  */}
            {/* ------------------------------------------------------------- */}
            {screenState === "fetching" && (
              <div className="relative flex-1 bg-[#FAF7F2] text-[#2D1E18] flex flex-col items-center justify-center p-4 text-center select-none animate-in fade-in duration-300">
                {/* Brand Badge with Spin Indicator */}
                <div className="relative w-12 h-12 rounded-2xl bg-white border border-stone-200/80 shadow-md flex items-center justify-center mb-3">
                  <Coffee className="w-6 h-6 text-[#2D1E18] animate-bounce" />
                  <div className="absolute inset-0 rounded-2xl border-2 border-[#2D1E18] border-t-transparent animate-spin" />
                </div>

                <p className="font-mono text-[7.5px] uppercase tracking-[0.2em] text-stone-400">
                  THE ROAST ROOM &bull; TABLE 04
                </p>
                <h4 className="font-serif text-xs font-bold text-[#2D1E18] mt-0.5">
                  Fetching Live Menu...
                </h4>
                <p className="text-[8px] text-stone-500 mt-1 max-w-[170px]">
                  Connecting to live kitchen catalog and table pricing
                </p>

                {/* Animated Minimalist Progress Bar */}
                <div className="w-32 h-1.5 bg-stone-200/80 rounded-full overflow-hidden mt-3 mx-auto">
                  <div
                    className="h-full bg-[#2D1E18] rounded-full"
                    style={{
                      animation: "progressBarFill 0.85s ease-out forwards",
                    }}
                  />
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 3: MAIN DIGITAL MENU VIEW                                */}
            {/* ------------------------------------------------------------- */}
            {(screenState === "menu" || screenState === "cart" || screenState === "processing") && (
              <div className="relative flex-1 flex flex-col justify-between overflow-hidden">
                {/* Clean Editorial Menu Header */}
                <div className="px-3.5 pt-1 pb-1.5 bg-white border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-stone-400">
                      THE ROAST ROOM
                    </p>
                    <h4 className="font-serif text-xs font-bold text-[#2D1E18] leading-tight">
                      Morning Service &bull; Table 04
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartScan(true)}
                    className="px-2 py-0.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-[8px] font-mono font-medium border border-stone-200 transition-colors flex items-center gap-1 active:scale-95"
                    title="Re-scan Table QR"
                  >
                    <Camera className="w-2.5 h-2.5 text-stone-500" />
                    <span>Scan</span>
                  </button>
                </div>

                {/* Category Navigation Pills */}
                <div className="flex items-center gap-1.5 px-3 py-1 bg-stone-50/80 border-b border-stone-100 overflow-x-hidden text-[9px] font-medium">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#2D1E18] text-white font-semibold shadow-2xs">
                    All
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-stone-500">
                    Bakes
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-stone-500">
                    Espresso
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-stone-500">
                    Plates
                  </span>
                </div>

                {/* Digital Menu Items */}
                <div className="p-3 space-y-1.5 bg-white flex-1 overflow-hidden relative">
                  {/* Flying Food Particle when Added */}
                  {isFlyingFood && (
                    <div
                      className="absolute z-50 pointer-events-none select-none flex items-center gap-1 px-2 py-1 rounded-full bg-[#2D1E18] text-white shadow-xl border border-white/20"
                      style={{
                        top: "14px",
                        right: "16px",
                        animation: "flyFoodToCart 0.48s cubic-bezier(0.2, 0.8, 0.25, 1) forwards",
                      }}
                    >
                      <span className="text-xs">{flyingParticle.emoji}</span>
                      <span className="text-[8px] font-mono font-bold text-amber-300">{flyingParticle.text}</span>
                    </div>
                  )}

                  {/* Item 1: French Toast (Interactive / Animated Target) */}
                  <div
                    onClick={() => handleToggleFrenchToast(true)}
                    className={`p-2 rounded-xl bg-stone-50/80 border transition-all duration-300 flex items-center justify-between gap-2 shadow-[0_2px_6px_rgba(0,0,0,0.02)] cursor-pointer ${
                      toastAdded
                        ? "border-emerald-300/80 bg-emerald-50/30"
                        : "border-stone-200/70 hover:border-stone-400"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-serif font-bold text-[#2D1E18] leading-tight">
                        Brioche French Toast
                      </p>
                      <p className="text-[8px] text-stone-500 truncate mt-0.5">
                        Whipped mascarpone, wild berries
                      </p>
                      <p className="text-[9.5px] font-semibold text-[#2D1E18] font-sans tabular-nums mt-0.5">
                        ₹340
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFrenchToast(true);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[8.5px] font-bold tracking-wider shrink-0 transition-all shadow-2xs flex items-center gap-0.5 ${
                        toastAdded
                          ? "bg-emerald-700 text-white scale-95"
                          : "bg-[#2D1E18] text-white hover:bg-stone-800 active:scale-95"
                      }`}
                    >
                      {toastAdded ? (
                        <>
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                          <span>ADDED</span>
                        </>
                      ) : (
                        <span>+ ADD</span>
                      )}
                    </button>
                  </div>

                  {/* Item 2: Cascara Cold Brew */}
                  <div className="p-2 rounded-xl bg-stone-50/70 border border-stone-200/70 flex items-center justify-between gap-2 shadow-[0_2px_6px_rgba(0,0,0,0.02)]">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-serif font-bold text-[#2D1E18] leading-tight">
                        Cascara Cold Brew
                      </p>
                      <p className="text-[8px] text-stone-500 truncate mt-0.5">
                        18-hr steep, fresh orange peel
                      </p>
                      <p className="text-[9.5px] font-semibold text-[#2D1E18] font-sans tabular-nums mt-0.5">
                        ₹220
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded-lg bg-emerald-700/80 text-white text-[8px] font-bold tracking-wider shrink-0 shadow-2xs flex items-center gap-0.5"
                    >
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                      <span>IN CART</span>
                    </button>
                  </div>

                  {/* Item 3: Truffle Croissant */}
                  <div
                    onClick={() => handleToggleCroissant(true)}
                    className={`p-2 rounded-xl bg-stone-50/70 border transition-all duration-300 flex items-center justify-between gap-2 shadow-[0_2px_6px_rgba(0,0,0,0.02)] cursor-pointer ${
                      croissantAdded
                        ? "border-emerald-300/80 bg-emerald-50/30"
                        : "border-stone-200/70 hover:border-stone-400"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-serif font-bold text-[#2D1E18] leading-tight">
                        Truffle Croissant
                      </p>
                      <p className="text-[8px] text-stone-500 truncate mt-0.5">
                        Aged Gruyère, thyme reduction
                      </p>
                      <p className="text-[9.5px] font-semibold text-[#2D1E18] font-sans tabular-nums mt-0.5">
                        ₹290
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleCroissant(true);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[8.5px] font-bold tracking-wider shrink-0 transition-all shadow-2xs flex items-center gap-0.5 ${
                        croissantAdded
                          ? "bg-emerald-700 text-white scale-95"
                          : "bg-[#2D1E18] text-white hover:bg-stone-800 active:scale-95"
                      }`}
                    >
                      {croissantAdded ? (
                        <>
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                          <span>ADDED</span>
                        </>
                      ) : (
                        <span>+ ADD</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Bottom Sticky Guest Order Bar */}
                <div
                  onClick={() => handleOpenCart(true)}
                  className={`p-2.5 bg-stone-50 border-t border-stone-100 flex items-center justify-between cursor-pointer transition-transform duration-200 ${
                    cartBumping ? "scale-[1.03] bg-stone-100/90" : "scale-100"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-[8px] font-mono uppercase tracking-wider text-stone-500 flex items-center gap-1">
                      <ShoppingBag className="w-2.5 h-2.5 text-stone-600" />
                      Cart (<span className="font-sans tabular-nums">{currentCount}</span> {currentCount === 1 ? "Item" : "Items"})
                    </span>
                    <span className="font-sans tabular-nums text-[10.5px] font-bold text-[#2D1E18]">
                      ₹{currentTotal}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#2D1E18] text-white text-[9px] font-semibold shadow-xs hover:bg-stone-800 transition-colors active:scale-95">
                    View Order &rarr;
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 4: CART SLIDE-UP DRAWER                                  */}
            {/* ------------------------------------------------------------- */}
            <div
              className={`absolute inset-x-0 bottom-[18px] top-[32px] bg-white z-30 flex flex-col justify-between p-3.5 pb-2.5 transition-transform duration-300 ease-out shadow-2xl ${
                screenState === "cart" || screenState === "processing"
                  ? "translate-y-0"
                  : "translate-y-full pointer-events-none"
              }`}
            >
              {/* Cart Drawer Header */}
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div>
                  <h5 className="font-serif text-xs font-bold text-[#2D1E18]">
                    Table <span className="font-sans tabular-nums">04</span> Order
                  </h5>
                  <p className="text-[8px] text-stone-400 font-mono">
                    The Roast Room &bull; Morning Service
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCloseCart(true)}
                  className="w-5 h-5 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center hover:bg-stone-200 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Cart Items List: Dynamic Bill (₹220 only if 340 not added) */}
              <div className="py-2 space-y-1.5 flex-1 overflow-y-auto">
                {toastAdded && (
                  <div className="flex items-center justify-between text-[9px] p-1.5 rounded-lg bg-stone-50 border border-stone-100">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#2D1E18] truncate">
                        Brioche French Toast
                      </p>
                      <p className="text-[7.5px] text-stone-400 font-sans tabular-nums">1 &times; ₹340</p>
                    </div>
                    <span className="font-sans tabular-nums font-bold text-[#2D1E18]">₹340</span>
                  </div>
                )}

                {croissantAdded && (
                  <div className="flex items-center justify-between text-[9px] p-1.5 rounded-lg bg-stone-50 border border-stone-100">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#2D1E18] truncate">
                        Truffle Croissant
                      </p>
                      <p className="text-[7.5px] text-stone-400 font-sans tabular-nums">1 &times; ₹290</p>
                    </div>
                    <span className="font-sans tabular-nums font-bold text-[#2D1E18]">₹290</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-[9px] p-1.5 rounded-lg bg-stone-50 border border-stone-100">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#2D1E18] truncate">
                      Cascara Cold Brew
                    </p>
                    <p className="text-[7.5px] text-stone-400 font-sans tabular-nums">1 &times; ₹220</p>
                  </div>
                  <span className="font-sans tabular-nums font-bold text-[#2D1E18]">₹220</span>
                </div>

                {/* Subtotal & Table Service info */}
                <div className="pt-2 border-t border-dashed border-stone-200 text-[8px] space-y-1 text-stone-500">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-sans tabular-nums">₹{currentTotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST & Service</span>
                    <span className="text-emerald-700 font-medium">Included</span>
                  </div>
                  <div className="flex justify-between text-[9.5px] font-bold text-[#2D1E18] pt-1 border-t border-stone-100">
                    <span>To Pay</span>
                    <span className="font-sans tabular-nums">₹{currentTotal}</span>
                  </div>
                </div>
              </div>

              {/* Pay with Google Pay CTA Button (Elevated from Bottom) */}
              <div className="pt-2 pb-1">
                <button
                  type="button"
                  onClick={() => handlePayOrder(true)}
                  disabled={screenState === "processing"}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#2D1E18] text-white text-[9.5px] font-bold shadow-md hover:bg-stone-800 transition-all flex items-center justify-between active:scale-95 group"
                >
                  <span className="flex items-center gap-1.5">
                    {/* GPay G Logo */}
                    <span className="w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-xs">
                      <span className="font-bold text-[9px] text-[#4285F4]">G</span>
                    </span>
                    <span>
                      {screenState === "processing" ? "Processing UPI..." : "Pay with Google Pay"}
                    </span>
                  </span>
                  <span className="font-sans tabular-nums text-[10.5px] text-amber-300 font-semibold flex items-center gap-0.5">
                    ₹{currentTotal} &rarr;
                  </span>
                </button>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* VIEW 5: GOOGLE PAY ANIMATED SUCCESS CONFIRMATION              */}
            {/* ------------------------------------------------------------- */}
            {screenState === "success" && (
              <div className="absolute inset-x-0 bottom-[18px] top-[32px] bg-white z-30 flex flex-col items-center justify-between p-3.5 pb-2 text-center overflow-hidden animate-in fade-in duration-300">
                {/* Google Pay Ripple Rings + Pop Checkmark */}
                <div className="relative my-auto flex flex-col items-center justify-center">
                  {/* Ripple Wave 1 */}
                  <div
                    className="absolute w-20 h-20 rounded-full bg-emerald-500/15"
                    style={{ animation: "gpayRipple1 1.8s ease-out infinite" }}
                  />
                  {/* Ripple Wave 2 */}
                  <div
                    className="absolute w-14 h-14 rounded-full bg-emerald-500/25"
                    style={{ animation: "gpayRipple2 1.8s ease-out infinite 0.25s" }}
                  />

                  {/* Confetti Particles Bursting Outward in Google Colors */}
                  {[
                    { dx: "-36px", dy: "-38px", color: "#4285F4", size: "5px" },
                    { dx: "38px", dy: "-34px", color: "#EA4335", size: "6px" },
                    { dx: "-44px", dy: "10px", color: "#FBBC05", size: "5px" },
                    { dx: "42px", dy: "12px", color: "#34A853", size: "6px" },
                    { dx: "-26px", dy: "40px", color: "#4285F4", size: "5px" },
                    { dx: "28px", dy: "38px", color: "#EA4335", size: "5px" },
                    { dx: "0px", dy: "-46px", color: "#34A853", size: "5px" },
                    { dx: "-38px", dy: "-14px", color: "#FBBC05", size: "4px" },
                    { dx: "36px", dy: "-14px", color: "#4285F4", size: "5px" },
                    { dx: "0px", dy: "44px", color: "#FBBC05", size: "5px" },
                  ].map((p, i) => (
                    <div
                      key={i}
                      className="absolute rounded-full pointer-events-none"
                      style={
                        {
                          width: p.size,
                          height: p.size,
                          backgroundColor: p.color,
                          "--dx": p.dx,
                          "--dy": p.dy,
                          animation: "confettiBurst 0.9s cubic-bezier(0.2, 0.9, 0.3, 1) forwards",
                        } as React.CSSProperties
                      }
                    />
                  ))}

                  {/* Vibrant Google Pay Green Check Badge */}
                  <div
                    className="relative z-10 w-12 h-12 rounded-full bg-[#0F9D58] shadow-[0_8px_24px_rgba(15,157,88,0.38)] flex items-center justify-center"
                    style={{
                      animation: "gpayCheckPop 0.65s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
                    }}
                  >
                    <Check className="w-6 h-6 text-white stroke-[3.5]" />
                  </div>

                  {/* Paid Amount (Dynamically reflects ₹220 or ₹560) */}
                  <div className="mt-2">
                    <span className="font-sans tabular-nums text-xl font-bold text-[#2D1E18] tracking-tight">
                      ₹{currentTotal}.00
                    </span>
                    <p className="text-[8.5px] font-medium text-stone-500 mt-0.5">
                      Paid to The Roast Room
                    </p>
                  </div>

                  {/* Google Pay Verified Badge */}
                  <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-[#0F9D58] text-[8px] font-semibold">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                    <span>Google Pay &bull; UPI Verified</span>
                  </div>

                  {/* Live Order Sent to Kitchen Notice */}
                  <div className="mt-2 p-2 rounded-xl bg-stone-50 border border-stone-200/80 text-left w-full max-w-[195px] shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-sans tabular-nums text-[8px] uppercase tracking-wider text-stone-400">
                        Order #042 &bull; Table 04
                      </span>
                      <span className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                    </div>
                    <p className="text-[8.5px] font-serif font-bold text-[#2D1E18] mt-0.5">
                      {toastAdded && croissantAdded
                        ? "French Toast, Croissant & Cold Brew"
                        : toastAdded
                        ? "Brioche French Toast & Cold Brew"
                        : croissantAdded
                        ? "Truffle Croissant & Cold Brew"
                        : "Cascara Cold Brew"}
                    </p>
                    <p className="text-[7.5px] text-stone-500">
                      Chef preparing &bull; Est. <span className="font-sans tabular-nums">8-10</span> mins
                    </p>
                  </div>
                </div>

                {/* Back to Menu / Re-scan Buttons (Elevated & Clearly Visible) */}
                <div className="w-full pt-1.5 pb-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResetToMenu(true)}
                    className="flex-1 py-2 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-[#2D1E18] text-[8.5px] font-bold transition-colors flex items-center justify-center gap-1 shadow-2xs active:scale-95"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Menu</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartScan(true)}
                    className="flex-1 py-2 px-2.5 rounded-xl bg-[#2D1E18] hover:bg-stone-800 text-white text-[8.5px] font-bold transition-colors flex items-center justify-center gap-1 shadow-2xs active:scale-95"
                  >
                    <Camera className="w-2.5 h-2.5" />
                    <span>Scan Again</span>
                  </button>
                </div>
              </div>
            )}

            {/* Simulated Touch Pointer for Auto-demonstration */}
            {pointer.visible && (
              <div
                className="absolute z-50 pointer-events-none transition-all duration-500 ease-out"
                style={{
                  left: `${pointer.x}px`,
                  top: `${pointer.y}px`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  className={`w-6 h-6 rounded-full bg-stone-900/40 backdrop-blur-xs border-2 border-white shadow-lg transition-transform duration-150 ${
                    pointer.clicking ? "scale-75 bg-stone-900/70" : "scale-100"
                  }`}
                />
              </div>
            )}

            {/* Home Indicator Bar (Always on Top) */}
            <div className="relative z-40 h-3.5 bg-white flex items-center justify-center pb-0.5 select-none">
              <div className="w-20 h-1 rounded-full bg-stone-300" />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 4. RESTAURANT KITCHEN NOTIFICATION SCENE (KDS Order Card)     */}
        {/*    Behind and slightly to the right of the phone              */}
        {/* ------------------------------------------------------------- */}
        <div
          className={`absolute right-2 sm:right-2 lg:right-6 bottom-2 sm:bottom-4 lg:bottom-6 w-[152px] sm:w-[178px] lg:w-[184px] rounded-2xl bg-[#FAF8F5] p-3 sm:p-3.5 border transition-all duration-700 ease-out select-none ${
            kdsPoppedOut
              ? "z-30 -translate-y-16 translate-x-2 rotate-1 sm:translate-x-5 sm:-translate-y-6 lg:translate-x-4 lg:-translate-y-8 sm:rotate-2 scale-[1.02] border-emerald-500/90 shadow-[0_20px_50px_rgba(16,185,129,0.24),0_6px_18px_rgba(0,0,0,0.06)] ring-2 ring-emerald-400/40"
              : kdsReceived
              ? "z-10 translate-x-0 translate-y-0 rotate-2 sm:rotate-2 scale-100 border-emerald-300/80 shadow-[0_16px_36px_rgba(45,30,24,0.1),0_2px_8px_rgba(0,0,0,0.03)]"
              : "z-10 translate-x-0 translate-y-0 rotate-2 sm:rotate-2 scale-100 border-stone-200/90 shadow-[0_16px_36px_rgba(45,30,24,0.08),0_2px_8px_rgba(0,0,0,0.03)] hover:rotate-1"
          }`}
          style={{ willChange: "transform" }}
        >
          {/* Card Top Brand & Notification Dot */}
          <div className="flex items-center justify-between pb-1.5 border-b border-stone-200/70">
            <div className="flex items-center gap-1">
              <ChefHat className="w-3 h-3 text-[#2D1E18]" />
              <span className="font-mono text-[7.5px] uppercase tracking-wider text-[#2D1E18] font-bold">
                KDS &bull; Kitchen
              </span>
            </div>

            {/* Notification Pulse Dot */}
            <div className="flex items-center gap-1">
              {kdsAlert ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              ) : kdsReceived ? (
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              ) : (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span className="font-mono text-[6.5px] text-stone-400 uppercase">Live</span>
                </span>
              )}
            </div>
          </div>

          {/* Ticket Header */}
          <div className="mt-2 text-left">
            <span className="font-mono text-[7px] uppercase tracking-wider text-amber-700/90 font-semibold block">
              {kdsAlert || kdsReceived ? "NEW ORDER RECEIVED" : "KITCHEN TICKET"}
            </span>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="font-bold text-[#2D1E18] tracking-tight text-[11px]">
                Table <span className="font-sans tabular-nums">04</span>
              </span>
              <span className="font-sans tabular-nums text-[7px] text-stone-400">
                09:41 AM
              </span>
            </div>
          </div>

          {/* Itemized Docket List (Customer Paid -> Kitchen Received) */}
          <div className="py-1.5 my-1.5 border-y border-dashed border-stone-200 text-[8px] space-y-1">
            {toastAdded && (
              <div className="flex justify-between items-center text-[#2D1E18]">
                <span className="font-medium truncate"><span className="font-sans tabular-nums">1</span>× Brioche French Toast</span>
                <span className="font-sans tabular-nums font-semibold shrink-0">₹340</span>
              </div>
            )}
            {croissantAdded && (
              <div className="flex justify-between items-center text-[#2D1E18]">
                <span className="font-medium truncate"><span className="font-sans tabular-nums">1</span>× Truffle Croissant</span>
                <span className="font-sans tabular-nums font-semibold shrink-0">₹290</span>
              </div>
            )}
            <div className="flex justify-between items-center text-[#2D1E18]">
              <span className="font-medium truncate"><span className="font-sans tabular-nums">1</span>× Cascara Cold Brew</span>
              <span className="font-sans tabular-nums font-semibold shrink-0">₹220</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-stone-100 text-[8.5px] font-bold text-[#2D1E18]">
              <span>Total Paid</span>
              <span className="font-sans tabular-nums text-emerald-800">₹{currentTotal}</span>
            </div>
          </div>

          {/* Success / Status Banner */}
          <div className="pt-0.5">
            {kdsAlert ? (
              <div className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-emerald-600 text-white text-[7.5px] font-bold tracking-wider shadow-xs animate-pulse">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
                <span>✓ Order Sent to Kitchen</span>
              </div>
            ) : kdsReceived ? (
              <div className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-emerald-50 border border-emerald-200/90 text-emerald-800 text-[7.5px] font-bold tracking-wider">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
                <span>✓ SENT TO KITCHEN</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-stone-100/90 text-stone-500 text-[7px] font-mono">
                <Clock className="w-2 h-2 text-stone-400" />
                <span>Waiting for payment...</span>
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 5. SUBTLE HANDWRITTEN NOTE "Scan Order Enjoy ♡" WITH ARROW     */}
        {/* ------------------------------------------------------------- */}
        <div className="absolute right-1 sm:right-2 lg:right-2 top-2 sm:top-5 lg:top-7 z-25 flex flex-col items-center pointer-events-none select-none transition-transform duration-700 ease-out translate-x-0">
          <div className="font-handwriting text-stone-700 text-base sm:text-2xl font-bold tracking-wide -rotate-6">
            <span>Scan</span>
            <br />
            <span className="ml-2">Order</span>
            <br />
            <span className="ml-4">Enjoy ♡</span>
          </div>

          {/* Delicate hand-drawn SVG arrow pointing to the phone screen */}
          <svg
            viewBox="0 0 64 54"
            fill="none"
            className="w-7 sm:w-11 h-5 sm:h-9 text-stone-600 -rotate-12 mt-0.5 sm:mt-1 drop-shadow-xs"
            aria-hidden="true"
          >
            <path
              d="M48 6C34 14 18 22 10 38M10 38L11 25M10 38L22 41"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
