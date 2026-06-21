import { COLOR_SLOTS } from "./protocol";

/**
 * Stable player identity colors. The server hands out a `colorIndex`; the client
 * maps it here. Chosen to stay distinguishable for the common colorblindness
 * types (a spread across hue + lightness, avoiding a pure red/green clash).
 * Length MUST equal COLOR_SLOTS.
 */
export interface PlayerColor {
  name: string;
  /** vivid fill for map glow / chips */
  hex: string;
  /** readable text color to pair on dark UI */
  text: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { name: "Sky", hex: "#38bdf8", text: "#bae6fd" },
  { name: "Amber", hex: "#f59e0b", text: "#fde68a" },
  { name: "Emerald", hex: "#34d399", text: "#a7f3d0" },
  { name: "Pink", hex: "#f472b6", text: "#fbcfe8" },
  { name: "Violet", hex: "#a78bfa", text: "#ddd6fe" },
  { name: "Orange", hex: "#fb7185", text: "#fecdd3" },
  { name: "Lime", hex: "#a3e635", text: "#d9f99d" },
  { name: "Cyan", hex: "#22d3ee", text: "#a5f3fc" },
  { name: "Indigo", hex: "#818cf8", text: "#c7d2fe" },
  { name: "Rose", hex: "#fda4af", text: "#fecdd3" },
];

if (PLAYER_COLORS.length !== COLOR_SLOTS) {
  // dev guard: keep palette and server slot count in lockstep
  console.warn(`PLAYER_COLORS length ${PLAYER_COLORS.length} != COLOR_SLOTS ${COLOR_SLOTS}`);
}

export function playerColor(colorIndex: number): PlayerColor {
  return PLAYER_COLORS[((colorIndex % COLOR_SLOTS) + COLOR_SLOTS) % COLOR_SLOTS];
}
