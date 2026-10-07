/**
 * Tableline Haptic Feedback Engine
 * Centralized, non-blocking tactile feedback using standard Navigator.vibrate API.
 * 
 * Rules:
 * - Respects `prefers-reduced-motion`
 * - Gracefully does nothing when vibration is unavailable or unsupported
 * - Never vibrates during automatic scroll, keystrokes, background sync, or other users' updates
 * - Haptics only respond to deliberate user actions with corresponding visual state
 */

export type HapticType =
  | "light"
  | "selection"
  | "success"
  | "error"
  | "medium"
  | "heavy";

export function haptic(type: HapticType = "light"): void {
  if (typeof window === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  // Respect system/user preference for reduced motion
  try {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
  } catch {
    // Ignore matchMedia evaluation error
  }

  try {
    switch (type) {
      case "light":
        // 50ms short light haptic on + ADD
        navigator.vibrate(50);
        break;

      case "selection":
        // 15ms extremely subtle selection tick for +, -, category selection, filter
        navigator.vibrate(15);
        break;

      case "success":
        // [40, 60, 40] short success pattern when server confirms order placement or waiter called
        navigator.vibrate([40, 60, 40]);
        break;

      case "error":
        // [50, 40, 50] short tactile warning pattern on failed actions
        navigator.vibrate([50, 40, 50]);
        break;

      case "medium":
        navigator.vibrate(40);
        break;

      case "heavy":
        navigator.vibrate(70);
        break;
    }
  } catch {
    // Graceful silent fallback for restrictive iframes / unsupported mobile contexts
  }
}

/**
 * Backward compatibility alias for existing callers
 */
export function triggerHaptic(style: string = "light"): void {
  if (style === "tick" || style === "soft") {
    haptic("selection");
  } else if (style === "warning") {
    haptic("error");
  } else if (style === "light" || style === "selection" || style === "success" || style === "error" || style === "medium" || style === "heavy") {
    haptic(style as HapticType);
  } else {
    haptic("light");
  }
}
