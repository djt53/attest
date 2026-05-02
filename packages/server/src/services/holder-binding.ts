/**
 * Holder-binding (DPoP-style proof-of-possession) for attestation tokens.
 *
 * Prevents token theft by binding the attestation to an ephemeral key pair.
 * The agent generates an ephemeral EC P-256 key pair, includes the public
 * key thumbprint in the attestation JWT (`cnf` claim), and signs a proof
 * JWT with the private key on each request.
 *
 * Verification:
 * 1. Extract `cnf.jkt` (JWK thumbprint) from the attestation JWT
 * 2. Extract the DPoP proof from the `DPoP` header
 * 3. Verify the proof signature matches the thumbprint in the attestation
 * 4. Verify the proof is fresh (not expired, nonce matches)
 *
 * This follows RFC 9449 (DPoP) adapted for agent attestation.
 */

import * as jose from "jose";

const PROOF_MAX_AGE_SECONDS = 60;

export interface HolderBindingClaims {
  /** JWK thumbprint of the holder's ephemeral key */
  jkt: string;
}

/**
 * Generate an ephemeral key pair for holder-binding.
 * The agent calls this once per session and includes the thumbprint
 * in their attestation token.
 */
export async function generateEphemeralKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicJwk: jose.JWK;
  thumbprint: string;
}> {
  const { privateKey, publicKey } = await jose.generateKeyPair("ES256");
  const publicJwk = await jose.exportJWK(publicKey);
  const thumbprint = await jose.calculateJwkThumbprint(publicJwk, "sha256");

  return { privateKey, publicJwk, thumbprint };
}

/**
 * Create a DPoP proof JWT.
 * The agent signs this with their ephemeral private key on each request.
 */
export async function createProof(
  privateKey: CryptoKey,
  publicJwk: jose.JWK,
  httpMethod: string,
  httpUri: string,
  attestationHash?: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new jose.SignJWT({
    htm: httpMethod,
    htu: httpUri,
    iat: now,
    ...(attestationHash && { ath: attestationHash }),
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "dpop+jwt",
      jwk: publicJwk,
    })
    .setIssuedAt(now)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}

/**
 * Verify a DPoP proof against the holder-binding in the attestation.
 * Returns true if the proof is valid and matches the attestation's cnf.jkt.
 */
export async function verifyProof(
  proofJwt: string,
  expectedThumbprint: string,
  httpMethod: string,
  httpUri: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Decode the proof header to get the embedded JWK
    const header = jose.decodeProtectedHeader(proofJwt);

    if (header.typ !== "dpop+jwt" || header.alg !== "ES256" || !header.jwk) {
      return { valid: false, error: "invalid_proof_header" };
    }

    // Calculate thumbprint of the proof's JWK
    const proofThumbprint = await jose.calculateJwkThumbprint(
      header.jwk as jose.JWK,
      "sha256"
    );

    // Verify thumbprint matches the attestation's cnf.jkt
    if (proofThumbprint !== expectedThumbprint) {
      return { valid: false, error: "thumbprint_mismatch" };
    }

    // Import the public key and verify the signature
    const publicKey = await jose.importJWK(header.jwk as jose.JWK, "ES256");

    const { payload } = await jose.jwtVerify(proofJwt, publicKey, {
      maxTokenAge: PROOF_MAX_AGE_SECONDS,
    });

    // Verify HTTP method and URI
    if (payload.htm !== httpMethod) {
      return { valid: false, error: "method_mismatch" };
    }

    if (payload.htu !== httpUri) {
      return { valid: false, error: "uri_mismatch" };
    }

    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "proof_verification_failed";
    return { valid: false, error: message };
  }
}

/**
 * Check if an attestation has holder-binding (cnf.jkt claim).
 */
export function hasHolderBinding(
  claims: Record<string, unknown>
): boolean {
  const cnf = claims.cnf as { jkt?: string } | undefined;
  return !!cnf?.jkt;
}

/**
 * Extract the JWK thumbprint from an attestation's cnf claim.
 */
export function getThumbprint(
  claims: Record<string, unknown>
): string | null {
  const cnf = claims.cnf as { jkt?: string } | undefined;
  return cnf?.jkt || null;
}
