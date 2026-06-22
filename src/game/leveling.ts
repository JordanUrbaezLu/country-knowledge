/**
 * XP & levels — pure and shared by client (display) and server (totalling), the
 * same way `multiplayer/protocol.ts` shares `scorePoints`. No imports, no I/O.
 *
 * Design: XP is DERIVED from the stored `attempts` log (+ a bonus per MP win),
 * never a separate mutable counter — so it can't drift and existing players are
 * credited retroactively, matching the rest of the stats system. Every answered
 * question in a scored game (solo or multiplayer) earns XP; the amount scales
 * with **performance** (how right you were) and **difficulty**.
 */

/** Difficulty multiplier. Unknown / null difficulty falls back to 1×. */
const DIFFICULTY_MULT: Record<string, number> = { easy: 1, medium: 1.5, hard: 2 };

/** XP just for answering a question, win or lose (rewards showing up). */
export const XP_PARTICIPATION = 2;
/** Extra XP for a perfect answer, scaled by accuracy (0..1) so near-misses count. */
export const XP_PERFECT = 10;
/** Flat bonus added once per multiplayer game won (from `mp_games`). */
export const XP_MP_WIN_BONUS = 25;

export interface AttemptXp {
  /** 0..1 (1 = exact, fractional = near-miss/partial credit); may be null. */
  accuracy: number | null;
  /** fallback when accuracy is null. */
  isCorrect: boolean;
  /** "easy" | "medium" | "hard" | null. */
  difficulty: string | null;
}

/** XP earned for one answered question: (participation + perfect·accuracy) × difficulty. */
export function xpForAttempt(a: AttemptXp): number {
  const acc = a.accuracy != null ? a.accuracy : a.isCorrect ? 1 : 0;
  const clamped = acc < 0 ? 0 : acc > 1 ? 1 : acc;
  const mult = (a.difficulty != null && DIFFICULTY_MULT[a.difficulty]) || 1;
  return Math.round((XP_PARTICIPATION + XP_PERFECT * clamped) * mult);
}

/** XP for a list of attempts plus any MP wins — the canonical total formula. */
export function totalXp(attempts: AttemptXp[], mpWins = 0): number {
  let xp = mpWins * XP_MP_WIN_BONUS;
  for (const a of attempts) xp += xpForAttempt(a);
  return xp;
}

/**
 * Level curve. Cumulative XP to *reach* a level is `cum(L) = 50·L·(L−1)`, so each
 * level costs `100·L` more than the last (L1→L2 = 100, L2→L3 = 200, …): a gentle
 * ramp that's quick early and slows down. Level 1 starts at 0 XP.
 */
export function xpAtLevelStart(level: number): number {
  return 50 * level * (level - 1);
}

export interface LevelInfo {
  /** current level (≥ 1). */
  level: number;
  /** total XP (clamped ≥ 0, integer). */
  xp: number;
  /** XP accumulated within the current level. */
  xpIntoLevel: number;
  /** total XP span of the current level (xpIntoLevel + remaining = this). */
  xpForLevel: number;
  /** XP still needed to reach the next level. */
  xpToNext: number;
  /** progress through the current level, 0..1. */
  progress: number;
}

/** Invert the curve: the level (and within-level progress) for a total XP. */
export function levelForXp(totalXpValue: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXpValue));
  // cum(L) ≤ xp  ⇒  50L² − 50L − xp ≤ 0  ⇒  L = ⌊(50 + √(2500 + 200·xp)) / 100⌋
  const level = Math.floor((50 + Math.sqrt(2500 + 200 * xp)) / 100);
  const start = xpAtLevelStart(level);
  const span = xpAtLevelStart(level + 1) - start; // = 100·level
  const xpIntoLevel = xp - start;
  return {
    level,
    xp,
    xpIntoLevel,
    xpForLevel: span,
    xpToNext: span - xpIntoLevel,
    progress: span > 0 ? xpIntoLevel / span : 0,
  };
}
