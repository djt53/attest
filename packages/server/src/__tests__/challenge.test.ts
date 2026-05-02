import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as jose from "jose";
import { Hono } from "hono";
import { challengeMiddleware } from "../middleware/challenge.js";
import { benefitMiddleware, getBenefits } from "../middleware/benefits.js";
import { registerRuntime, injectJWKS, clearCache } from "../services/jwks.js";

const MERCHANT = "test-store.myshopify.com";

let privateKey: CryptoKey;
let publicJwk: jose.JWK;

beforeAll(async () => {
  const keyPair = await jose.generateKeyPair("ES256");
  privateKey = keyPair.privateKey;
  publicJwk = await jose.exportJWK(keyPair.publicKey);
  publicJwk.kid = "challenge-test-key";
  publicJwk.use = "sig";
  publicJwk.alg = "ES256";
});

beforeEach(() => {
  clearCache();
  registerRuntime("test-runtime", "https://test-runtime/.well-known/attest-jwks.json");
  injectJWKS("test-runtime", { keys: [publicJwk] });
});

async function mintToken() {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    v: "0",
    act: { sub: "user_test", email: "test@example.com" },
    scope: ["browse"],
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "challenge-test-key" })
    .setIssuer("test-runtime")
    .setSubject("test-agent")
    .setAudience(MERCHANT)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(`att_${crypto.randomUUID().replace(/-/g, "")}`)
    .sign(privateKey);
}

describe("challenge-response flow", () => {
  it("sends WWW-Attest header when agent detected", async () => {
    const app = new Hono();
    app.use(
      "*",
      challengeMiddleware({ realm: MERCHANT, benefits: ["loyalty_pricing"] })
    );
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      headers: { "User-Agent": "GPTBot/1.0" },
    });

    expect(res.status).toBe(200);
    const challenge = res.headers.get("WWW-Attest");
    expect(challenge).toContain(`realm="${MERCHANT}"`);
    expect(challenge).toContain("loyalty_pricing");
    expect(challenge).toContain('version="0"');
  });

  it("does not send challenge for normal browsers", async () => {
    const app = new Hono();
    app.use(
      "*",
      challengeMiddleware({ realm: MERCHANT, benefits: ["loyalty_pricing"] })
    );
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      headers: {
        "User-Agent": "Mozilla/5.0 Chrome/120.0",
        "Accept-Language": "en-US",
        "Sec-Fetch-Dest": "document",
        "Sec-Ch-Ua": '"Chrome"',
      },
    });

    expect(res.headers.get("WWW-Attest")).toBeNull();
  });

  it("verifies attestation and sets verified tier", async () => {
    const app = new Hono();
    app.use(
      "*",
      challengeMiddleware({ realm: MERCHANT, benefits: ["loyalty_pricing"] })
    );
    app.use("*", benefitMiddleware());
    app.get("/", (c) => {
      const benefits = getBenefits(c);
      return c.json({
        tier: c.get("attest_tier"),
        loyaltyPricing: benefits.loyaltyPricing,
        rateLimit: benefits.rateLimit,
      });
    });

    const token = await mintToken();
    const res = await app.request("/", {
      headers: { "Agent-Attestation": token },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBe("verified");
    expect(body.loyaltyPricing).toBe(true);
    expect(body.rateLimit).toBe(600);
    expect(res.headers.get("X-Attest-Tier")).toBe("verified");
  });

  it("sets detected tier for unattested agents", async () => {
    const app = new Hono();
    app.use(
      "*",
      challengeMiddleware({ realm: MERCHANT, benefits: ["loyalty_pricing"] })
    );
    app.use("*", benefitMiddleware());
    app.get("/", (c) => {
      const benefits = getBenefits(c);
      return c.json({
        tier: c.get("attest_tier"),
        loyaltyPricing: benefits.loyaltyPricing,
        rateLimit: benefits.rateLimit,
      });
    });

    const res = await app.request("/", {
      headers: { "User-Agent": "Claude/1.0" },
    });

    const body = await res.json();
    expect(body.tier).toBe("detected");
    expect(body.loyaltyPricing).toBe(false);
    expect(body.rateLimit).toBe(60);
    expect(res.headers.get("X-Attest-Tier")).toBe("detected");
  });

  it("sets unknown tier for normal browsers", async () => {
    const app = new Hono();
    app.use(
      "*",
      challengeMiddleware({ realm: MERCHANT, benefits: ["loyalty_pricing"] })
    );
    app.use("*", benefitMiddleware());
    app.get("/", (c) => {
      const benefits = getBenefits(c);
      return c.json({
        tier: c.get("attest_tier"),
        loyaltyPricing: benefits.loyaltyPricing,
        detection: c.get("attest_detection"),
      });
    });

    const res = await app.request("/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "document",
        "Sec-Ch-Ua": '"Chromium";v="120"',
      },
    });

    const body = await res.json();
    expect(body.detection.isAgent).toBe(false);
    expect(body.tier).toBe("unknown");
    expect(body.loyaltyPricing).toBe(true); // Humans get full access
  });
});
