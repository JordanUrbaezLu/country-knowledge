// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computeInsightFeatures } from "./insights";
import type { AttemptRow } from "./db";

let seq = 0;
function row(p: Partial<AttemptRow>): AttemptRow {
  return {
    id: String(++seq),
    user_id: "u1",
    game_id: "g1",
    source: "solo",
    difficulty: "medium",
    mode: "flag",
    country_id: "FRA",
    prompt_label: "France",
    given_answer: "France",
    correct_answer: "France",
    is_correct: true,
    accuracy: 1,
    time_ms: 4000,
    score_awarded: null,
    created_at: "2026-06-21T00:00:00Z",
    ...p,
  };
}

describe("computeInsightFeatures", () => {
  it("summarizes accuracy, per-mode, streaks, and most-missed", () => {
    const attempts: AttemptRow[] = [
      row({ mode: "flag", country_id: "FRA", is_correct: true }),
      row({ mode: "flag", country_id: "DEU", is_correct: true }),
      row({ mode: "locate", country_id: "ESP", is_correct: false, given_answer: "Portugal", correct_answer: "Spain" }),
      row({ mode: "locate", country_id: "ESP", is_correct: false, given_answer: "Portugal", correct_answer: "Spain" }),
      row({ mode: "name", country_id: "TCD", is_correct: false, given_answer: "Niger", correct_answer: "Chad" }),
    ];
    const f = computeInsightFeatures(attempts);

    expect(f.totalAttempts).toBe(5);
    expect(f.totalCorrect).toBe(2);
    expect(f.accuracy).toBeCloseTo(0.4);
    expect(f.longestStreak).toBe(2); // first two correct
    expect(f.favoriteMode).toBe("flag"); // most attempts (2) — tie broken by order/count

    const locate = f.perMode.find((m) => m.mode === "locate")!;
    expect(locate.accuracy).toBe(0);

    // Spain missed twice → top of the list
    expect(f.topMissed[0]).toMatchObject({ countryId: "ESP", misses: 2 });
    // "answered Portugal when it was Spain" twice
    expect(f.confusedPairs[0]).toMatchObject({ correct: "Spain", given: "Portugal", count: 2 });
  });

  it("computes an improvement trend over time (first half vs second half)", () => {
    const attempts: AttemptRow[] = [
      ...Array.from({ length: 4 }, () => row({ is_correct: false })),
      ...Array.from({ length: 4 }, () => row({ is_correct: true })),
    ];
    const f = computeInsightFeatures(attempts);
    expect(f.trend).not.toBeNull();
    expect(f.trend!.earlier).toBeLessThan(f.trend!.recent);
  });

  it("handles an empty log without throwing", () => {
    const f = computeInsightFeatures([]);
    expect(f).toMatchObject({ totalAttempts: 0, accuracy: 0, longestStreak: 0, favoriteMode: null, trend: null });
  });
});
