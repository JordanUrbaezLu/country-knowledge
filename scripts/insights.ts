/**
 * LOCAL insights generator — run by the maintainer, never deployed.
 *
 *   npx tsx scripts/insights.ts
 *
 * Reads every player's attempt log from the prod DB (DATABASE_URL), computes a
 * deterministic feature summary (server/insights.ts), and asks Claude (the
 * cheapest current model, Haiku 4.5) to turn each summary into a warm 1–2
 * sentence message — using YOUR local ANTHROPIC_API_KEY (never deployed). The
 * result is written to data/insights.json, which you commit + deploy; the live
 * app serves each player theirs via the gated GET /api/insights.
 *
 * Regenerates only when you run this. Override the output path with INSIGHTS_OUT.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";
import worldCountries from "world-countries";
import { createData, type Queryable } from "../server/db";
import { computeInsightFeatures, type InsightFeatures } from "../server/insights";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* absent — fine */
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set — add it to .env (Neon connection string).");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set — add it to .env (local only; never deployed).");
  process.exit(1);
}

const OUT = process.env.INSIGHTS_OUT ?? "data/insights.json";
const MODEL = "claude-haiku-4-5"; // cheapest current model; the input is a tiny summary
const MIN_ATTEMPTS = 5; // not enough signal below this

// Map country id (ISO cca3) → common name so the prompt can name real countries.
const nameOf = new Map<string, string>();
for (const c of worldCountries as { cca3?: string; name?: { common?: string } }[]) {
  if (c.cca3) nameOf.set(c.cca3, c.name?.common ?? c.cca3);
}
const label = (id: string) => nameOf.get(id) ?? id;

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const data = createData(pool as unknown as Queryable);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM = `You write ONE short, warm, specific insight (1–2 sentences, max ~45 words) about a player's geography-quiz performance, addressed to them as "you". Ground every claim in the numbers provided — name the actual countries, regions, and quiz modes (flag = identify a flag, locate = name a highlighted country, name = find a named country on the globe). Call out one genuine strength and one concrete thing to work on. Encouraging, never condescending. No preamble, no greeting, no markdown, no surrounding quotes.`;

async function messageFor(features: InsightFeatures): Promise<string> {
  const summary = {
    totalAnswers: features.totalAttempts,
    overallAccuracyPct: Math.round(features.accuracy * 100),
    games: features.games,
    bySource: features.bySource,
    favoriteMode: features.favoriteMode,
    longestCorrectStreak: features.longestStreak,
    avgSecondsPerAnswer: features.avgTimeMs ? Math.round(features.avgTimeMs / 1000) : null,
    modes: features.perMode.map((m) => ({
      mode: m.mode,
      accuracyPct: Math.round(m.accuracy * 100),
      answers: m.attempts,
    })),
    mostMissed: features.topMissed.map((m) => ({ country: label(m.countryId), missed: m.misses, seen: m.attempts })),
    confusedFor: features.confusedPairs.map((p) => ({ answered: p.given, wasActually: p.correct, times: p.count })),
    trend: features.trend
      ? { earlierPct: Math.round(features.trend.earlier * 100), recentPct: Math.round(features.trend.recent * 100) }
      : null,
  };
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(summary) }],
  });
  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}

async function main(): Promise<void> {
  const { rows: users } = await pool.query<{ id: string; username: string }>(
    "SELECT id, username FROM users",
  );
  const out: Record<string, { message: string; generated_at: string }> = {};
  const stamp = new Date().toISOString();
  let generated = 0;
  let skipped = 0;

  for (const u of users) {
    const attempts = await data.getUserAttempts(u.id);
    if (attempts.length < MIN_ATTEMPTS) {
      skipped++;
      continue;
    }
    const features = computeInsightFeatures(attempts);
    try {
      const message = await messageFor(features);
      if (message) {
        out[u.id] = { message, generated_at: stamp };
        generated++;
        console.log(`✓ ${u.username}: ${message}`);
      }
    } catch (e) {
      console.error(`✗ ${u.username}:`, e instanceof Error ? e.message : e);
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${OUT}: ${generated} insight(s); ${skipped} player(s) skipped (<${MIN_ATTEMPTS} answers).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
