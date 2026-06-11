/** True on phones/tablets (touch primary), false on desktop (mouse primary). */
export const isTouchDevice =
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
