import { useAuth, type AuthStats } from "./useAuth";

export interface SoloAttempt {
  mode: string;
  countryId: string;
  promptLabel: string;
  givenAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

/**
 * Persist a finished solo round to the player's account (per-question rows feed
 * the profile stats + the insights analysis). No-op for guests — we check the
 * cookie-backed session first to avoid a pointless 401. On success we refresh
 * the cached stats so the profile reflects the round immediately.
 */
export async function recordSoloRound(payload: {
  gameId: string;
  difficulty: string;
  attempts: SoloAttempt[];
}): Promise<void> {
  if (!useAuth.getState().user) return;
  try {
    const res = await fetch("/api/solo/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.stats) useAuth.getState().setStats(json.stats as AuthStats);
    }
  } catch {
    /* offline — the local best score still persists via the game store */
  }
}
