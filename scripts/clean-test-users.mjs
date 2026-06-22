/**
 * Remove test/throwaway accounts (the `zz_*` convention used by the e2e + UI
 * verification scripts) and all their data from the live Neon DB, so only real
 * players appear on the leaderboard / stats.
 *
 *   node scripts/clean-test-users.mjs          # dry run — lists what WOULD be deleted
 *   node scripts/clean-test-users.mjs --apply  # actually delete
 *
 * Matches usernames starting with "zz" (case-insensitive) — the throwaway
 * prefix used by all test/verify scripts. Real accounts never use that prefix.
 */
import { existsSync } from "node:fs";
import pg from "pg";

// Load env the same first-wins way the server does (.env.local overrides .env).
for (const f of [".env.local", ".env"]) {
  try {
    if (existsSync(f)) process.loadEnvFile(f);
  } catch {
    /* ignore */
  }
}

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (need .env / .env.local).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  const all = await pool.query("SELECT username FROM users ORDER BY username");
  console.log(`all accounts (${all.rows.length}):`, all.rows.map((r) => r.username).join(", ") || "(none)");

  // Match any "zz"-prefixed account — the throwaway prefix every test/verify
  // script uses (zz_e2e_*, zz_audit_*, zzgm*, …). Real accounts never start "zz".
  const test = await pool.query(
    "SELECT id, username FROM users WHERE username_lower LIKE 'zz%'",
  );
  const names = test.rows.map((r) => r.username);
  console.log(`test accounts (${test.rows.length}):`, names.join(", ") || "(none)");

  if (!test.rows.length) {
    console.log("nothing to clean.");
  } else if (!apply) {
    console.log("\nDRY RUN — re-run with --apply to delete the above + their attempts/mp_games/settings.");
  } else {
    for (const u of test.rows) {
      await pool.query("DELETE FROM attempts WHERE user_id=$1", [u.id]);
      await pool.query("DELETE FROM mp_games WHERE user_id=$1", [u.id]);
      await pool.query("DELETE FROM user_settings WHERE user_id=$1", [u.id]);
      await pool.query("DELETE FROM users WHERE id=$1", [u.id]);
    }
    const after = await pool.query("SELECT username FROM users ORDER BY username");
    console.log(`\ndeleted ${test.rows.length}. remaining accounts (${after.rows.length}):`, after.rows.map((r) => r.username).join(", ") || "(none)");
  }
} finally {
  await pool.end();
}
