import { useEffect, useState } from "react";

/**
 * Height in px of the on-screen keyboard overlapping the layout viewport
 * (0 when closed, and always 0 on desktop).
 *
 * iOS Safari does NOT resize the layout viewport when the keyboard opens, so
 * bottom-anchored UI (like the quiz answer input) ends up hidden behind the
 * keyboard unless it's lifted by this amount.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
