import { describe, it, expect } from "vitest";
import * as jose from "jose";
import { AttestClient } from "../client.js";

describe("AttestClient", () => {
  it("creates a signed attestation token with correct claims", async () => {
    const { privateKey, publicJwk } = await AttestClient.generateKeyPair("key-1");

    const client = new AttestClient({
      issuer: "test-runtime",
      privateKey,
      kid: "key-1",
    });

    const result = await client.attest({
      agentId: "shopping-agent",
      humanPrincipal: { id: "user_123", email: "alice@example.com" },
      scope: ["browse", "purchase<=500"],
      audience: "cool-store.myshopify.com",
    });

    expect(result.token).toBeTruthy();
    expect(result.jti).toMatch(/^att_/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Decode and verify claims
    const claims = jose.decodeJwt(result.token);
    expect(claims.v).toBe("0");
    expect(claims.iss).toBe("test-runtime");
    expect(claims.sub).toBe("shopping-agent");
    expect(claims.aud).toBe("cool-store.myshopify.com");
    expect(claims.act).toEqual({ sub: "user_123", email: "alice@example.com" });
    expect(claims.scope).toEqual(["browse", "purchase<=500"]);
    expect(claims.jti).toBe(result.jti);

    // Verify signature
    const jwks = jose.createLocalJWKSet({ keys: [publicJwk] });
    const verified = await jose.jwtVerify(result.token, jwks);
    expect(verified.payload.iss).toBe("test-runtime");
  });

  it("respects TTL cap of 3600 seconds", async () => {
    const { privateKey } = await AttestClient.generateKeyPair();

    const client = new AttestClient({
      issuer: "test-runtime",
      privateKey,
    });

    const result = await client.attest({
      agentId: "agent",
      humanPrincipal: { id: "user_1" },
      scope: ["browse"],
      audience: "merchant.com",
      ttl: 99999,
    });

    const claims = jose.decodeJwt(result.token);
    const ttl = (claims.exp as number) - (claims.iat as number);
    expect(ttl).toBe(3600);
  });

  it("generates valid ES256 key pairs", async () => {
    const { privateKey, publicJwk } = await AttestClient.generateKeyPair("my-key");

    expect(publicJwk.kty).toBe("EC");
    expect(publicJwk.crv).toBe("P-256");
    expect(publicJwk.kid).toBe("my-key");
    expect(publicJwk.use).toBe("sig");
    expect(publicJwk.alg).toBe("ES256");
    expect(privateKey).toBeTruthy();
  });

  it("omits email from act claim when not provided", async () => {
    const { privateKey } = await AttestClient.generateKeyPair();

    const client = new AttestClient({
      issuer: "test-runtime",
      privateKey,
    });

    const result = await client.attest({
      agentId: "agent",
      humanPrincipal: { id: "user_1" },
      scope: ["browse"],
      audience: "merchant.com",
    });

    const claims = jose.decodeJwt(result.token);
    expect(claims.act).toEqual({ sub: "user_1" });
  });
});
