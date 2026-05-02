import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as jose from "jose";
import { verifyAttestation } from "../services/verification.js";
import { injectJWKS, clearCache, registerRuntime } from "../services/jwks.js";

const TEST_ISSUER = "test-runtime";
const TEST_MERCHANT = "cool-store.myshopify.com";

let privateKey: jose.KeyLike;
let publicJwk: jose.JWK;

beforeAll(async () => {
  const keyPair = await jose.generateKeyPair("ES256");
  privateKey = keyPair.privateKey;
  publicJwk = await jose.exportJWK(keyPair.publicKey);
  publicJwk.kid = "test-key-1";
  publicJwk.use = "sig";
  publicJwk.alg = "ES256";
});

beforeEach(() => {
  clearCache();
  registerRuntime(TEST_ISSUER, "https://test-runtime/.well-known/attest-jwks.json");
  injectJWKS(TEST_ISSUER, { keys: [publicJwk] });
});

async function createToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    v: "0",
    act: { sub: "user_123", email: "alice@example.com" },
    scope: ["browse", "purchase<=500"],
    ...overrides,
  };

  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "test-key-1" })
    .setIssuer(TEST_ISSUER)
    .setSubject("test-agent")
    .setAudience(TEST_MERCHANT)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(`att_${crypto.randomUUID().replace(/-/g, "")}`)
    .sign(privateKey);
}

describe("verifyAttestation", () => {
  it("verifies a valid attestation token", async () => {
    const token = await createToken();
    const result = await verifyAttestation(token, TEST_MERCHANT);

    expect(result.valid).toBe(true);
    expect(result.attestation).toBeDefined();
    expect(result.attestation!.runtime).toBe(TEST_ISSUER);
    expect(result.attestation!.agent).toBe("test-agent");
    expect(result.attestation!.human.id).toBe("user_123");
    expect(result.attestation!.human.email).toBe("alice@example.com");
    expect(result.attestation!.scope).toEqual(["browse", "purchase<=500"]);
  });

  it("rejects a token with wrong audience", async () => {
    const token = await createToken();
    const result = await verifyAttestation(token, "wrong-merchant.com");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("aud");
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new jose.SignJWT({
      v: "0",
      act: { sub: "user_123" },
      scope: ["browse"],
    })
      .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "test-key-1" })
      .setIssuer(TEST_ISSUER)
      .setSubject("test-agent")
      .setAudience(TEST_MERCHANT)
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .setJti(`att_${crypto.randomUUID().replace(/-/g, "")}`)
      .sign(privateKey);

    const result = await verifyAttestation(token, TEST_MERCHANT);
    expect(result.valid).toBe(false);
  });

  it("rejects replay (same jti)", async () => {
    const token = await createToken();

    const first = await verifyAttestation(token, TEST_MERCHANT);
    expect(first.valid).toBe(true);

    const second = await verifyAttestation(token, TEST_MERCHANT);
    expect(second.valid).toBe(false);
    expect(second.error).toBe("replay_detected");
  });

  it("rejects unknown runtime", async () => {
    clearCache();
    // Don't register runtime — issuer is unknown
    const token = await createToken();
    const result = await verifyAttestation(token, TEST_MERCHANT);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("jwks_unavailable");
  });

  it("rejects invalid spec version", async () => {
    const token = await createToken({ v: "99" });
    const result = await verifyAttestation(token, TEST_MERCHANT);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid_claims");
  });
});
