import * as jose from "jose";
import type { AttestationOptions, AttestationToken } from "./types.js";

export interface AttestClientOptions {
  /** Runtime issuer identifier (e.g., "anthropic", "my-app.example.com") */
  issuer: string;
  /** ES256 private key for signing attestations */
  privateKey: CryptoKey | Uint8Array;
  /** Key ID for the signing key */
  kid?: string;
}

const MAX_TTL = 3600;
const DEFAULT_TTL = 300;

export class AttestClient {
  private issuer: string;
  private privateKey: CryptoKey | Uint8Array;
  private kid?: string;

  constructor(options: AttestClientOptions) {
    this.issuer = options.issuer;
    this.privateKey = options.privateKey;
    this.kid = options.kid;
  }

  /**
   * Create a signed attestation token.
   *
   * Usage:
   * ```ts
   * const { token } = await client.attest({
   *   agentId: "shopping-agent",
   *   humanPrincipal: { id: "user_123", email: "alice@example.com" },
   *   scope: ["browse", "purchase<=500"],
   *   audience: "cool-store.myshopify.com",
   * });
   *
   * // Attach to outbound request
   * fetch(url, { headers: { "Agent-Attestation": token } });
   * ```
   */
  async attest(options: AttestationOptions): Promise<AttestationToken> {
    const ttl = Math.min(options.ttl ?? DEFAULT_TTL, MAX_TTL);
    const now = Math.floor(Date.now() / 1000);
    const jti = generateJTI();

    const jwt = await new jose.SignJWT({
      v: "0",
      act: {
        sub: options.humanPrincipal.id,
        ...(options.humanPrincipal.email && {
          email: options.humanPrincipal.email,
        }),
      },
      scope: options.scope,
    })
      .setProtectedHeader({
        alg: "ES256",
        typ: "JWT",
        ...(this.kid && { kid: this.kid }),
      })
      .setIssuer(this.issuer)
      .setSubject(options.agentId)
      .setAudience(options.audience)
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .setJti(jti)
      .sign(this.privateKey);

    return {
      token: jwt,
      expiresAt: new Date((now + ttl) * 1000),
      jti,
    };
  }

  /**
   * Generate an ES256 key pair for signing attestations.
   * Returns the private key (for signing) and public JWK (for publishing).
   */
  static async generateKeyPair(kid?: string) {
    const { privateKey, publicKey } = await jose.generateKeyPair("ES256");
    const publicJwk = await jose.exportJWK(publicKey);
    if (kid) publicJwk.kid = kid;
    publicJwk.use = "sig";
    publicJwk.alg = "ES256";

    return { privateKey, publicJwk };
  }
}

function generateJTI(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return (
    "att_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
