import { describe, it, expect } from "vitest";
import {
  xpForAttempt,
  totalXp,
  levelForXp,
  xpAtLevelStart,
  XP_MP_WIN_BONUS,
} from "./leveling";

describe("xpForAttempt", () => {
  it("scales with performance and difficulty", () => {
    // perfect medium: (2 + 10) * 1.5 = 18
    expect(xpForAttempt({ accuracy: 1, isCorrect: true, difficulty: "medium" })).toBe(18);
    // perfect hard: (2 + 10) * 2 = 24  (the most a single answer can earn)
    expect(xpForAttempt({ accuracy: 1, isCorrect: true, difficulty: "hard" })).toBe(24);
    // perfect easy: (2 + 10) * 1 = 12
    expect(xpForAttempt({ accuracy: 1, isCorrect: true, difficulty: "easy" })).toBe(12);
  });

  it("still rewards a wrong answer (participation) and credits partial accuracy", () => {
    // wrong easy: (2 + 0) * 1 = 2
    expect(xpForAttempt({ accuracy: 0, isCorrect: false, difficulty: "easy" })).toBe(2);
    // near-miss (0.5) hard: (2 + 5) * 2 = 14
    expect(xpForAttempt({ accuracy: 0.5, isCorrect: false, difficulty: "hard" })).toBe(14);
  });

  it("falls back to isCorrect when accuracy is null, and to 1x for unknown difficulty", () => {
    expect(xpForAttempt({ accuracy: null, isCorrect: true, difficulty: null })).toBe(12); // (2+10)*1
    expect(xpForAttempt({ accuracy: null, isCorrect: false, difficulty: "weird" })).toBe(2);
  });

  it("clamps out-of-range accuracy", () => {
    expect(xpForAttempt({ accuracy: 5, isCorrect: true, difficulty: "easy" })).toBe(12);
    expect(xpForAttempt({ accuracy: -1, isCorrect: false, difficulty: "easy" })).toBe(2);
  });
});

describe("totalXp", () => {
  it("sums attempts and adds the MP win bonus", () => {
    const attempts = [
      { accuracy: 1, isCorrect: true, difficulty: "medium" }, // 18
      { accuracy: 0, isCorrect: false, difficulty: "medium" }, // 3 → round((2)*1.5)=3
    ];
    expect(totalXp(attempts, 0)).toBe(18 + 3);
    expect(totalXp(attempts, 2)).toBe(18 + 3 + 2 * XP_MP_WIN_BONUS);
  });
});

describe("levelForXp", () => {
  it("starts at level 1 with 0 XP", () => {
    const l = levelForXp(0);
    expect(l).toMatchObject({ level: 1, xp: 0, xpIntoLevel: 0, xpForLevel: 100, xpToNext: 100, progress: 0 });
  });

  it("crosses level boundaries exactly on the cumulative thresholds", () => {
    // cum(2)=100, cum(3)=300, cum(4)=600
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(299).level).toBe(2);
    expect(levelForXp(300).level).toBe(3);
    expect(levelForXp(599).level).toBe(3);
    expect(levelForXp(600).level).toBe(4);
  });

  it("reports within-level progress consistently with xpAtLevelStart", () => {
    const l = levelForXp(150); // level 2 (100..300), 50 into a 200-wide level
    expect(l.level).toBe(2);
    expect(xpAtLevelStart(2)).toBe(100);
    expect(l.xpIntoLevel).toBe(50);
    expect(l.xpForLevel).toBe(200);
    expect(l.xpToNext).toBe(150);
    expect(l.progress).toBeCloseTo(0.25, 5);
  });

  it("is the inverse of xpAtLevelStart at every boundary", () => {
    for (let lvl = 1; lvl <= 30; lvl++) {
      expect(levelForXp(xpAtLevelStart(lvl)).level).toBe(lvl);
      expect(levelForXp(xpAtLevelStart(lvl) - 1).level).toBe(lvl - 1 || 1);
    }
  });

  it("clamps negative / fractional XP", () => {
    expect(levelForXp(-50)).toMatchObject({ level: 1, xp: 0 });
    expect(levelForXp(150.9).xpIntoLevel).toBe(50); // floored to 150
  });
});
