import { expect } from "chai";
import { resolveAuthRedirect, safeCallbackPath } from "../src/lib/auth/redirect";
import { describeAuthError, getAuthConfigStatus } from "../src/lib/auth/config-status";
import { rateLimit, resetRateLimits } from "../src/server/rate-limit";
import { organizationSchema, roleRequestSchema } from "../src/lib/validation/schemas";

describe("Open-redirect protection", () => {
  const fallback = "/app/dashboard";
  it("allows same-origin relative paths", () => {
    expect(safeCallbackPath("/app/ngo")).to.equal("/app/ngo");
    expect(safeCallbackPath("/campaigns/3?x=1#top")).to.equal("/campaigns/3?x=1#top");
    expect(safeCallbackPath("%2Fapp%2Fdonor")).to.equal("/app/donor");
  });

  it("rejects absolute, protocol-relative, backslash, scheme, and encoded attacks", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "%2F%2Fevil.example",
      "/%5Cevil.example",
      "http:/evil.example",
      "/app\u0000/x",
      "data:text/html,hi",
      "",
      "   ",
      "/auth/sign-in",
      "/api/auth/signout",
    ]) {
      expect(safeCallbackPath(bad), bad).to.equal(fallback);
    }
    expect(safeCallbackPath(undefined)).to.equal(fallback);
    expect(safeCallbackPath(["/app"])).to.equal(fallback);
    expect(safeCallbackPath("/" + "a".repeat(600))).to.equal(fallback);
  });

  it("Auth.js redirect callback never leaves the base origin", () => {
    const base = "https://openaid.example";
    expect(resolveAuthRedirect("/app/vendor", base)).to.equal("https://openaid.example/app/vendor");
    expect(resolveAuthRedirect("https://openaid.example/app/ngo", base)).to.equal("https://openaid.example/app/ngo");
    expect(resolveAuthRedirect("https://evil.example/app", base)).to.equal(base);
    expect(resolveAuthRedirect("https://openaid.example.evil.com/", base)).to.equal(base);
    expect(resolveAuthRedirect("//evil.example", base)).to.equal("https://openaid.example/app/dashboard");
    expect(resolveAuthRedirect("not a url", base)).to.equal(base);
  });
});

describe("Google OAuth configuration status", () => {
  it("reports every missing variable by name and is not ready", () => {
    const s = getAuthConfigStatus({});
    expect(s.ready).to.equal(false);
    expect(s.missing).to.have.members(["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "DATABASE_URL"]);
  });

  it("rejects a short AUTH_SECRET and a non-Postgres DATABASE_URL", () => {
    const s = getAuthConfigStatus({ AUTH_SECRET: "short", AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "sec", DATABASE_URL: "file:./dev.db" });
    expect(s.secretConfigured).to.equal(false);
    expect(s.databaseConfigured).to.equal(false);
    expect(s.ready).to.equal(false);
  });

  it("is ready only when all four settings are valid, and never echoes values", () => {
    const env = { AUTH_SECRET: "x".repeat(32), AUTH_GOOGLE_ID: "client-id-value", AUTH_GOOGLE_SECRET: "client-secret-value", DATABASE_URL: "postgresql://u:p@h:5432/db" };
    const s = getAuthConfigStatus(env);
    expect(s.ready).to.equal(true);
    expect(JSON.stringify(s)).to.not.include("client-secret-value");
    expect(JSON.stringify(s)).to.not.include("postgresql://");
  });

  it("maps auth error codes to fixed copy and does not reflect attacker input", () => {
    expect(describeAuthError("AccessDenied").title).to.equal("Access denied");
    expect(describeAuthError("Configuration").title).to.match(/not configured/);
    const evil = describeAuthError("<script>alert(1)</script>");
    expect(JSON.stringify(evil)).to.not.include("script");
  });
});

describe("Input validation schemas", () => {
  it("role requests are strict and cannot carry extra privilege fields", () => {
    expect(roleRequestSchema.safeParse({ role: "VALIDATOR", justification: "x".repeat(25), isAdmin: true }).success).to.equal(false);
    expect(roleRequestSchema.safeParse({ role: "VALIDATOR", justification: "x".repeat(25), walletAddress: "0x123" }).success).to.equal(false);
    expect(roleRequestSchema.safeParse({ role: "VALIDATOR", justification: "x".repeat(25), walletAddress: "0x" + "a".repeat(40) }).success).to.equal(true);
  });

  it("rejects bidi/control characters and non-https websites", () => {
    const base = { kind: "NGO", name: "Org", country: "KE", description: "d".repeat(30) };
    expect(organizationSchema.safeParse({ ...base, name: "Evil‮Org" }).success).to.equal(false);
    expect(organizationSchema.safeParse({ ...base, website: "javascript:alert(1)" }).success).to.equal(false);
    expect(organizationSchema.safeParse({ ...base, website: "http://plain.example" }).success).to.equal(false);
    expect(organizationSchema.safeParse({ ...base, website: "https://ok.example" }).success).to.equal(true);
  });
});

describe("Rate limiter", () => {
  beforeEach(() => resetRateLimits());
  it("allows up to the limit then blocks until the window resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t0).allowed).to.equal(true);
    const blocked = rateLimit("k", 3, 1000, t0 + 10);
    expect(blocked.allowed).to.equal(false);
    expect(blocked.retryAfterSeconds).to.be.greaterThan(0);
    expect(rateLimit("k", 3, 1000, t0 + 1001).allowed).to.equal(true);
  });
  it("keys are isolated per caller", () => {
    expect(rateLimit("a", 1, 1000).allowed).to.equal(true);
    expect(rateLimit("a", 1, 1000).allowed).to.equal(false);
    expect(rateLimit("b", 1, 1000).allowed).to.equal(true);
  });
});
