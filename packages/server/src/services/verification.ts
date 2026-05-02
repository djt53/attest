import * as jose from "jose";
import { z } from "zod";
import { fetchJWKS, getJwksUrl } from "./jwks.js";

const CLOCK_SKEW_SECONDS = 30;
const MAX_TOKEN_AGE_SECONDS = 3600; // 1 hour

// Replay prevention: in-memory set with TTL
// TODO: Replace with Redis for multi-instance deployments
const seenJTIs = new Map<string, number>();

// Clean up expired JTIs periodically
setInterval(() => {
  const cutoff = Date.now() - MAX_TOKEN_AGE_SECONDS * 1000;
  for (const [jti, timestamp] of seenJTIs) {
    if (timestamp < cutoff) seenJTIs.delete(jti);
  }
}, 60_000);

const AttestationClaims = z.object({
  v: z.literal("0"),
  iss: z.string().min(1),
  sub: z.string().min(1),
  act: z.object({
    sub: z.string().min(1),
    email: z.string().email().optional(),
  }),
  aud: z.string().min(1),
  scope: z.array(z.string()),
  exp: z.number(),
  iat: z.number(),
  jti: z.string().min(1),
});

export type AttestationClaims = z.infer<typeof AttestationClaims>;

export interface VerificationResult {
  valid: boolean;
  error?: string;
  attestation?: {
    runtime: string;
    agent: string;
    human: {
      id: string;
      email?: string;
    };
    scope: string[];
    expires_at: string;
  };
}

export async function verifyAttestation(
  token: string,
  expectedAudience: string
): Promise<VerificationResult> {
  // Decode header to get issuer for JWKS lookup
  const header = jose.decodeProtectedHeader(token);
  let claims: jose.JWTPayload;

  try {
    // Peek at claims to get issuer
    claims = jose.decodeJwt(token);
  } catch {
    return { valid: false, error: "malformed_jwt" };
  }

  const issuer = claims.iss;
  if (!issuer) {
    return { valid: false, error: "missing_issuer" };
  }

  // Fetch JWKS for this runtime
  const jwksUrl = getJwksUrl(issuer);
  if (!jwksUrl) {
    return { valid: false, error: "unknown_runtime" };
  }

  const jwks = await fetchJWKS(issuer);
  if (!jwks) {
    return { valid: false, error: "jwks_unavailable" };
  }

  const keySet = jose.createLocalJWKSet(jwks);

  // Verify signature + standard claims
  let verified: jose.JWTVerifyResult;
  try {
    verified = await jose.jwtVerify(token, keySet, {
      audience: expectedAudience,
      clockTolerance: CLOCK_SKEW_SECONDS,
      maxTokenAge: MAX_TOKEN_AGE_SECONDS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "verification_failed";
    return { valid: false, error: message };
  }

  // Validate attestation-specific claims
  const parsed = AttestationClaims.safeParse(verified.payload);
  if (!parsed.success) {
    return {
      valid: false,
      error: `invalid_claims: ${parsed.error.issues[0]?.message}`,
    };
  }

  const att = parsed.data;

  // Replay prevention
  if (seenJTIs.has(att.jti)) {
    return { valid: false, error: "replay_detected" };
  }
  seenJTIs.set(att.jti, Date.now());

  return {
    valid: true,
    attestation: {
      runtime: att.iss,
      agent: att.sub,
      human: {
        id: att.act.sub,
        email: att.act.email,
      },
      scope: att.scope,
      expires_at: new Date(att.exp * 1000).toISOString(),
    },
  };
}
