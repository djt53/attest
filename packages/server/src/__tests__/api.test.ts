import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as jose from "jose";
import { Hono } from "hono";
import { verifyRoute } from "../routes/verify.js";
import { healthRoute } from "../routes/health.js";
import { registerRuntime, injectJWKS, clearCache } from "../services/jwks.js";

/**
 * HTTP-level API tests using Hono's test client.
 * Tests the actual route handlers as an HTTP consumer would call them.
 */

const app = new Hono();
app.route("/health", healthRoute);
app.route("/v0/verify", verifyRoute);

const ISSUER = "api-test-runtime";
const MERCHANT = "api-test-store.com";

let privateKey: CryptoKey;
let publicJwk: jose.JWK;

beforeAll(async () => {
  const keyPair = await jose.generateKeyPair("ES256");
  privateKey = keyPair.privateKey;
  publicJwk = await jose.exportJWK(keyPair.publicKey);
  publicJwk.kid = "api-test-key";
  publicJwk.use = "sig";
  publicJwk.alg = "ES256";
});

beforeEach(() => {
  clearCache();
  registerRuntime(ISSUER, `https://${ISSUER}/.well-known/attest-jwks.json`);
  injectJWKS(ISSUER, { keys: [publicJwk] });
});

async function mintToken() {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    v: "0",
    act: { sub: "user_api_test", email: "test@example.com" },
    scope: ["browse", "purchase<=100"],
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "api-test-key" })
    .setIssuer(ISSUER)
    .setSubject("test-agent")
    .setAudience(MERCHANT)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(`att_${crypto.randomUUID().replace(/-/g, "")}`)
    .sign(privateKey);
}

describe("API routes", () => {
  describe("GET /health", () => {
    it("returns ok", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.1.0");
    });
  });

  describe("POST /v0/verify", () => {
    it("verifies a valid token via POST", async () => {
      const token = await mintToken();
      const res = await app.request("/v0/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, merchant_id: MERCHANT }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(true);
      expect(body.attestation.runtime).toBe(ISSUER);
      expect(body.attestation.agent).toBe("test-agent");
      expect(body.attestation.human.email).toBe("test@example.com");
    });

    it("returns 400 for missing body", async () => {
      const res = await app.request("/v0/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing token field", async () => {
      const res = await app.request("/v0/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: MERCHANT }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 401 for invalid token", async () => {
      const res = await app.request("/v0/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "not.a.jwt", merchant_id: MERCHANT }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /v0/verify", () => {
    it("verifies via attestation header", async () => {
      const token = await mintToken();
      const res = await app.request(
        `/v0/verify?merchant_id=${MERCHANT}`,
        {
          headers: { "Agent-Attestation": token },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(true);
    });

    it("returns 400 when attestation header is missing", async () => {
      const res = await app.request(`/v0/verify?merchant_id=${MERCHANT}`);
      expect(res.status).toBe(400);
    });

    it("returns 400 when merchant_id is missing", async () => {
      const token = await mintToken();
      const res = await app.request("/v0/verify", {
        headers: { "Agent-Attestation": token },
      });
      expect(res.status).toBe(400);
    });
  });
});
