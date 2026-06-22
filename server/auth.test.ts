// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  parseCookies,
  validateUsername,
  validatePassword,
  createRateLimiter,
  sessionCookie,
  clearSessionCookie,
} from "./auth";

const SECRET = "test-secret-please-ignore";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const { hash, salt } = hashPassword("hunter2");
    expect(verifyPassword("hunter2", hash, salt)).toBe(true);
    expect(verifyPassword("Hunter2", hash, salt)).toBe(false);
    expect(verifyPassword("", hash, salt)).toBe(false);
  });

  it("uses a random salt so equal passwords hash differently", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a.hash).not.toBe(b.hash);
    expect(a.salt).not.toBe(b.salt);
  });
});

describe("sessions", () => {
  it("round-trips a valid token", () => {
    const token = signSession("user-1", { secret: SECRET });
    expect(verifySession(token, { secret: SECRET })).toBe("user-1");
  });

  it("rejects a tampered payload", () => {
    const token = signSession("user-1", { secret: SECRET });
    const forged = token.replace("user-1", "user-2");
    expect(verifySession(forged, { secret: SECRET })).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession("user-1", { secret: SECRET });
    expect(verifySession(token, { secret: "other" })).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = 1_000_000;
    const token = signSession("user-1", { secret: SECRET, ttlMs: 1000, now });
    expect(verifySession(token, { secret: SECRET, now: now + 500 })).toBe("user-1");
    expect(verifySession(token, { secret: SECRET, now: now + 2000 })).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySession(undefined, { secret: SECRET })).toBeNull();
    expect(verifySession("", { secret: SECRET })).toBeNull();
    expect(verifySession("a.b", { secret: SECRET })).toBeNull();
  });
});

describe("cookies", () => {
  it("parses a cookie header", () => {
    expect(parseCookies("gr_session=abc; other=def")).toEqual({ gr_session: "abc", other: "def" });
    expect(parseCookies(undefined)).toEqual({});
  });

  it("serializes httpOnly session cookies", () => {
    const c = sessionCookie("tok", { secure: true });
    expect(c).toContain("gr_session=tok");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
    expect(c).toMatch(/Max-Age=\d+/);
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });
});

describe("validation", () => {
  it("accepts good usernames and rejects bad ones", () => {
    expect(validateUsername("john_99")).toBeNull();
    expect(validateUsername("ab")).toMatch(/at least/);
    expect(validateUsername("has spaces")).toMatch(/letters/);
    expect(validateUsername("waytoolongusername12345")).toMatch(/fewer/);
    expect(validateUsername(123)).toMatch(/required/);
  });

  it("enforces a password floor", () => {
    expect(validatePassword("secret")).toBeNull();
    expect(validatePassword("123")).toMatch(/at least/);
    expect(validatePassword(null)).toMatch(/required/);
  });
});

describe("rate limiter", () => {
  it("allows up to max then blocks within the window", () => {
    const allow = createRateLimiter({ windowMs: 1000, max: 3 });
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 0)).toBe(false);
    // window reset
    expect(allow("ip", 2000)).toBe(true);
    // separate key unaffected
    expect(allow("other", 0)).toBe(true);
  });
});
