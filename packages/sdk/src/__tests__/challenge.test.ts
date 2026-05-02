import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChallengeHandler } from "../challenge.js";
import { AttestClient } from "../client.js";

describe("ChallengeHandler", () => {
  beforeEach(() => {
    ChallengeHandler.clearCache();
  });

  describe("parseChallenge", () => {
    it("parses a valid WWW-Attest header", () => {
      const headers = new Headers({
        "WWW-Attest":
          'realm="cool-store.com", version="0", benefits="loyalty_pricing skip_captcha", verify_url="https://api.attest.dev/v0/verify"',
      });

      const challenge = ChallengeHandler.parseChallenge(headers);
      expect(challenge).not.toBeNull();
      expect(challenge!.realm).toBe("cool-store.com");
      expect(challenge!.version).toBe("0");
      expect(challenge!.benefits).toEqual(["loyalty_pricing", "skip_captcha"]);
      expect(challenge!.verifyUrl).toBe("https://api.attest.dev/v0/verify");
    });

    it("returns null for missing header", () => {
      const headers = new Headers();
      expect(ChallengeHandler.parseChallenge(headers)).toBeNull();
    });

    it("returns null for invalid header (no realm)", () => {
      const headers = new Headers({
        "WWW-Attest": 'version="0", benefits="loyalty_pricing"',
      });
      expect(ChallengeHandler.parseChallenge(headers)).toBeNull();
    });

    it("parses from plain object headers", () => {
      const headers = {
        "WWW-Attest": 'realm="store.com", version="0", benefits="full_catalog"',
      };

      const challenge = ChallengeHandler.parseChallenge(headers);
      expect(challenge).not.toBeNull();
      expect(challenge!.realm).toBe("store.com");
    });
  });

  describe("respondToChallenge", () => {
    it("creates an attestation token for a challenge", async () => {
      const { privateKey } = await AttestClient.generateKeyPair("test-key");
      const client = new AttestClient({
        issuer: "test-runtime",
        privateKey,
        kid: "test-key",
      });

      const handler = new ChallengeHandler({
        client,
        agentId: "test-agent",
        humanPrincipal: { id: "user_123", email: "alice@test.com" },
        defaultScope: ["browse"],
        cacheTokens: false,
      });

      const challenge = {
        realm: "store.com",
        version: "0",
        benefits: ["loyalty_pricing"],
      };

      const token = await handler.respondToChallenge(challenge);
      expect(token).toBeTruthy();
      expect(token.split(".")).toHaveLength(3); // Valid JWT
    });

    it("caches tokens per realm", async () => {
      const { privateKey } = await AttestClient.generateKeyPair();
      const client = new AttestClient({ issuer: "test", privateKey });

      const handler = new ChallengeHandler({
        client,
        agentId: "agent",
        humanPrincipal: { id: "user_1" },
        defaultScope: ["browse"],
        cacheTokens: true,
      });

      const challenge = { realm: "cached-store.com", version: "0", benefits: [] };

      const token1 = await handler.respondToChallenge(challenge);
      const token2 = await handler.respondToChallenge(challenge);

      // Same token from cache
      expect(token1).toBe(token2);
    });
  });

  describe("fetch with auto-retry", () => {
    it("retries with attestation when challenge received", async () => {
      const { privateKey } = await AttestClient.generateKeyPair();
      const client = new AttestClient({ issuer: "test", privateKey });

      const handler = new ChallengeHandler({
        client,
        agentId: "agent",
        humanPrincipal: { id: "user_1" },
        defaultScope: ["browse"],
        cacheTokens: false,
      });

      let callCount = 0;
      const originalFetch = globalThis.fetch;

      globalThis.fetch = vi.fn(async (input: any, init: any) => {
        callCount++;
        const headers = new Headers(init?.headers);

        if (!headers.has("Agent-Attestation")) {
          // First call — return challenge
          return new Response('{"products": []}', {
            headers: {
              "WWW-Attest":
                'realm="test-store.com", version="0", benefits="loyalty_pricing"',
            },
          });
        }

        // Retry — has attestation
        return new Response('{"products": ["premium"], "tier": "vip"}');
      }) as any;

      const response = await handler.fetch("https://test-store.com/products");
      const body = await response.json();

      expect(callCount).toBe(2);
      expect(body.tier).toBe("vip");

      globalThis.fetch = originalFetch;
    });

    it("returns original response when no challenge", async () => {
      const { privateKey } = await AttestClient.generateKeyPair();
      const client = new AttestClient({ issuer: "test", privateKey });

      const handler = new ChallengeHandler({
        client,
        agentId: "agent",
        humanPrincipal: { id: "user_1" },
        defaultScope: ["browse"],
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => {
        return new Response('{"products": ["basic"]}');
      }) as any;

      const response = await handler.fetch("https://no-attest-store.com/products");
      const body = await response.json();

      expect(body.products).toEqual(["basic"]);

      globalThis.fetch = originalFetch;
    });
  });
});
