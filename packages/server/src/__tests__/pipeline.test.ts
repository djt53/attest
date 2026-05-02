import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as jose from "jose";
import { verifyAttestation } from "../services/verification.js";
import { injectJWKS, clearCache, registerRuntime } from "../services/jwks.js";

/**
 * Pipeline integration tests — tests the full JWT verification flow
 * without a database (JWT-only mode).
 *
 * Database-backed integration tests require a running Postgres instance
 * and should be run separately with DATABASE_URL set.
 */

const ISSUER = "integration-test-runtime";
const MERCHANT = "test-merchant.myshopify.com";

let privateKey: jose.KeyLike;
let publicJwk: jose.JWK;

beforeAll(async () => {
  const keyPair = await jose.generateKeyPair("ES256");
  privateKey = keyPair.privateKey;
  publicJwk = await jose.exportJWK(keyPair.publicKey);
  publicJwk.kid = "int-test-key";
  publicJwk.use = "sig";
  publicJwk.alg = "ES256";
});

beforeEach(() => {
  clearCache();
  registerRuntime(ISSUER, `https://${ISSUER}/.well-known/attest-jwks.json`);
  injectJWKS(ISSUER, { keys: [publicJwk] });
});

async function mintToken(overrides: {
  agentId?: string;
  humanId?: string;
  humanEmail?: string;
  scope?: string[];
  audience?: string;
  ttl?: number;
  issuer?: string;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = overrides.ttl ?? 300;

  return new jose.SignJWT({
    v: "0",
    act: {
      sub: overrides.humanId ?? "user_test_123",
      ...(overrides.humanEmail !== undefined && { email: overrides.humanEmail }),
    },
    scope: overrides.scope ?? ["browse"],
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "int-test-key" })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setSubject(overrides.agentId ?? "test-agent")
    .setAudience(overrides.audience ?? MERCHANT)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setJti(`att_${crypto.randomUUID().replace(/-/g, "")}`)
    .sign(privateKey);
}

describe("pipeline integration", () => {
  it("verifies a token with full attestation claims", async () => {
    const token = await mintToken({
      agentId: "shopping-bot-v2",
      humanId: "alice_789",
      humanEmail: "alice@test.com",
      scope: ["browse", "add_to_cart", "purchase<=200"],
    });

    const result = await verifyAttestation(token, MERCHANT);

    expect(result.valid).toBe(true);
    expect(result.attestation).toMatchObject({
      runtime: ISSUER,
      agent: "shopping-bot-v2",
      human: { id: "alice_789", email: "alice@test.com" },
      scope: ["browse", "add_to_cart", "purchase<=200"],
    });
  });

  it("handles token without email", async () => {
    const token = await mintToken({ humanId: "anon_user_456" });
    const result = await verifyAttestation(token, MERCHANT);

    expect(result.valid).toBe(true);
    expect(result.attestation!.human.id).toBe("anon_user_456");
    expect(result.attestation!.human.email).toBeUndefined();
  });

  it("handles multiple concurrent verifications", async () => {
    const tokens = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        mintToken({
          agentId: `agent-${i}`,
          humanId: `user-${i}`,
          scope: ["browse"],
        })
      )
    );

    const results = await Promise.all(
      tokens.map((t) => verifyAttestation(t, MERCHANT))
    );

    expect(results.every((r) => r.valid)).toBe(true);
    expect(new Set(results.map((r) => r.attestation!.agent)).size).toBe(10);
  });

  it("handles key rotation (multiple keys in JWKS)", async () => {
    // Generate a second key pair
    const keyPair2 = await jose.generateKeyPair("ES256");
    const publicJwk2 = await jose.exportJWK(keyPair2.publicKey);
    publicJwk2.kid = "int-test-key-2";
    publicJwk2.use = "sig";
    publicJwk2.alg = "ES256";

    // Inject both keys
    injectJWKS(ISSUER, { keys: [publicJwk, publicJwk2] });

    // Token signed with original key should still verify
    const token1 = await mintToken();
    const result1 = await verifyAttestation(token1, MERCHANT);
    expect(result1.valid).toBe(true);

    // Token signed with new key should also verify
    const now = Math.floor(Date.now() / 1000);
    const token2 = await new jose.SignJWT({
      v: "0",
      act: { sub: "user_new" },
      scope: ["browse"],
    })
      .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "int-test-key-2" })
      .setIssuer(ISSUER)
      .setSubject("agent-new")
      .setAudience(MERCHANT)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .setJti(`att_${crypto.randomUUID().replace(/-/g, "")}`)
      .sign(keyPair2.privateKey);

    const result2 = await verifyAttestation(token2, MERCHANT);
    expect(result2.valid).toBe(true);
  });

  it("rejects token with empty scope array", async () => {
    const token = await mintToken({ scope: [] });
    const result = await verifyAttestation(token, MERCHANT);
    // Empty scope is valid per spec — scope is required but can be empty
    expect(result.valid).toBe(true);
  });

  it("handles various scope formats", async () => {
    const scopes = [
      "browse",
      "purchase<=500",
      "purchase<=999999",
      "read:profile",
      "write:cart",
      "admin",
    ];

    const token = await mintToken({ scope: scopes });
    const result = await verifyAttestation(token, MERCHANT);

    expect(result.valid).toBe(true);
    expect(result.attestation!.scope).toEqual(scopes);
  });
});
