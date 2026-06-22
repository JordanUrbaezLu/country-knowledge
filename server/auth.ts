/**
 * Auth primitives: password hashing, stateless signed sessions, cookie helpers,
 * input validation, and a tiny in-memory rate limiter. No external deps — all
 * built on `node:crypto`.
 *
 * Session model: "log in once, effectively forever." The token is an HMAC-signed
 * `userId.expiry` string carried in a server-set **httpOnly** cookie with a ~1y
 * Max-Age that we RE-SET on every authenticated request (sliding window), so an
 * active player never gets logged out. (First-party server `Set-Cookie` httpOnly
 * cookies aren't subject to Safari's 7-day JS-cookie cap, so this persists on iPhone.)
 */
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

const SCRYPT_KEYLEN = 64;
export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // ~1 year
export const SESSION_COOKIE = "gr_session";

// ---------- password hashing ----------

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const known = Buffer.from(hash, "hex");
  let candidate: Buffer;
  try {
    candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  if (known.length !== candidate.length) return false;
  return timingSafeEqual(known, candidate);
}

// ---------- sessions (stateless, HMAC-signed) ----------

function getSecret(secret?: string): string {
  const s = secret ?? process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

const hmac = (data: string, secret: string): string =>
  createHmac("sha256", secret).update(data).digest("base64url");

export function signSession(
  userId: string,
  opts: { ttlMs?: number; secret?: string; now?: number } = {},
): string {
  const secret = getSecret(opts.secret);
  const now = opts.now ?? Date.now();
  const exp = now + (opts.ttlMs ?? SESSION_TTL_MS);
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmac(payload, secret)}`;
}

/** Returns the userId if the token is valid & unexpired, else null. */
export function verifySession(
  token: string | undefined | null,
  opts: { secret?: string; now?: number } = {},
): string | null {
  if (!token) return null;
  const secret = getSecret(opts.secret);
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uid, expStr, sig] = parts;
  const expected = hmac(`${uid}.${expStr}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || (opts.now ?? Date.now()) > exp) return null;
  return uid;
}

// ---------- cookies ----------

export function sessionCookie(token: string, opts: { secure?: boolean; maxAgeMs?: number } = {}): string {
  const maxAge = Math.floor((opts.maxAgeMs ?? SESSION_TTL_MS) / 1000);
  const attrs = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (opts.secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookie(opts: { secure?: boolean } = {}): string {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (opts.secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Verify the session cookie on any request (HTTP API and the WS upgrade share this). */
export function readSession(
  req: { headers: { cookie?: string | undefined } },
  opts: { secret?: string; now?: number } = {},
): string | null {
  return verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE], opts);
}

// ---------- validation ----------

const USERNAME_RE = /^[a-z0-9_]+$/i;

/** Returns an error message, or null if valid. */
export function validateUsername(name: unknown): string | null {
  if (typeof name !== "string") return "Username is required";
  const t = name.trim();
  if (t.length < 3) return "Username must be at least 3 characters";
  if (t.length > 20) return "Username must be 20 characters or fewer";
  if (!USERNAME_RE.test(t)) return "Use only letters, numbers, and underscores";
  return null;
}

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string") return "Password is required";
  if (pw.length < 6) return "Password must be at least 6 characters";
  if (pw.length > 200) return "Password is too long";
  return null;
}

// ---------- rate limiting (in-memory, fixed window per key) ----------

export function createRateLimiter(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function allow(key: string, now = Date.now()): boolean {
    // Opportunistic prune so the map can't grow without bound.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    const rec = hits.get(key);
    if (!rec || now > rec.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }
    if (rec.count >= opts.max) return false;
    rec.count++;
    return true;
  };
}
