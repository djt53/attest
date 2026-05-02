import { describe, it, expect, vi } from "vitest";
import { attest, generateDiscoveryDocument } from "../express.js";

describe("unified Express middleware", () => {
  it("detects agent and sends challenge", async () => {
    const middleware = attest({
      apiKey: "att_live_test",
      merchantId: "test-store.com",
      benefits: ["loyalty_pricing", "skip_captcha"],
    });

    const req = {
      headers: { "user-agent": "Claude/1.0 (Anthropic)" },
    } as any;
    const res = {
      setHeader: vi.fn(),
    } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.attest.isAgent).toBe(true);
    expect(req.attest.runtime).toBe("anthropic");
    expect(req.attest.tier).toBe("detected");
    expect(req.attest.verified).toBe(false);
    expect(req.attest.benefits.loyaltyPricing).toBe(false); // Detected tier
    expect(req.attest.benefits.rateLimit).toBe(60); // Detected rate limit

    // Challenge header sent
    const challengeCall = res.setHeader.mock.calls.find(
      (c: any) => c[0] === "WWW-Attest"
    );
    expect(challengeCall).toBeTruthy();
    expect(challengeCall[1]).toContain('realm="test-store.com"');
    expect(challengeCall[1]).toContain("loyalty_pricing");

    // Tier header sent
    const tierCall = res.setHeader.mock.calls.find(
      (c: any) => c[0] === "X-Attest-Tier"
    );
    expect(tierCall[1]).toBe("detected");

    expect(next).toHaveBeenCalled();
  });

  it("passes humans through with full access", async () => {
    const middleware = attest({
      apiKey: "att_live_test",
      merchantId: "test-store.com",
    });

    const req = {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        "accept-language": "en-US",
        "sec-fetch-dest": "document",
        "sec-ch-ua": '"Chrome"',
      },
    } as any;
    const res = { setHeader: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.attest.isAgent).toBe(false);
    expect(req.attest.tier).toBe("unknown");
    expect(req.attest.benefits.loyaltyPricing).toBe(true); // Humans get full access
    expect(req.attest.benefits.rateLimit).toBe(120);

    // No challenge header
    const challengeCall = res.setHeader.mock.calls.find(
      (c: any) => c[0] === "WWW-Attest"
    );
    expect(challengeCall).toBeUndefined();

    expect(next).toHaveBeenCalled();
  });

  it("handles verification failure gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const middleware = attest({
      apiKey: "att_live_test",
      merchantId: "test-store.com",
    });

    const req = {
      headers: {
        "user-agent": "GPTBot/1.0",
        "agent-attestation": "fake.jwt.token",
      },
    } as any;
    const res = { setHeader: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    // Falls back to detected (not verified)
    expect(req.attest.isAgent).toBe(true);
    expect(req.attest.verified).toBe(false);
    expect(req.attest.tier).toBe("detected");
    expect(next).toHaveBeenCalled();

    globalThis.fetch = originalFetch;
  });

  it("does not send challenge when disabled", async () => {
    const middleware = attest({
      apiKey: "att_live_test",
      merchantId: "test-store.com",
      challenge: false,
    });

    const req = {
      headers: { "user-agent": "Claude/1.0" },
    } as any;
    const res = { setHeader: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    const challengeCall = res.setHeader.mock.calls.find(
      (c: any) => c[0] === "WWW-Attest"
    );
    expect(challengeCall).toBeUndefined();
  });
});

describe("generateDiscoveryDocument", () => {
  it("generates valid discovery JSON", () => {
    const doc = generateDiscoveryDocument({
      merchantId: "cool-store.com",
      contact: "ops@cool-store.com",
    }) as any;

    expect(doc.version).toBe("0");
    expect(doc.realm).toBe("cool-store.com");
    expect(doc.verify_url).toContain("/v0/verify");
    expect(doc.benefits.loyalty_pricing).toBeDefined();
    expect(doc.benefits.loyalty_pricing.description).toBeTruthy();
    expect(doc.supported_runtimes).toEqual(["*"]);
    expect(doc.contact).toBe("ops@cool-store.com");
  });
});
