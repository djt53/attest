/**
 * Generic JWT "Bring Your Own" Adapter
 *
 * For agent runtimes that already have their own JWT signing infrastructure.
 * This adapter validates that a JWT conforms to the Attest spec v0 claims
 * structure before sending it.
 *
 * Usage:
 * ```ts
 * import { validateAttestationClaims, REQUIRED_CLAIMS } from "@attest/sdk/adapters/generic-jwt";
 *
 * // Your runtime creates a JWT with its own signing
 * const jwt = await mySigningService.sign(payload);
 *
 * // Validate it conforms to the Attest spec
 * const validation = validateAttestationClaims(decodedPayload);
 * if (!validation.valid) {
 *   throw new Error(`Invalid attestation: ${validation.errors.join(", ")}`);
 * }
 *
 * // Use it
 * fetch(merchantUrl, { headers: { "Agent-Attestation": jwt } });
 * ```
 */

export const SPEC_VERSION = "0";
export const REQUIRED_CLAIMS = ["v", "iss", "sub", "act", "aud", "scope", "exp", "iat", "jti"];

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAttestationClaims(
  claims: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];

  // Check version
  if (claims.v !== SPEC_VERSION) {
    errors.push(`Invalid spec version: expected "${SPEC_VERSION}", got "${claims.v}"`);
  }

  // Check required string claims
  for (const claim of ["iss", "sub", "aud", "jti"]) {
    if (typeof claims[claim] !== "string" || (claims[claim] as string).length === 0) {
      errors.push(`Missing or empty required claim: ${claim}`);
    }
  }

  // Check act claim
  if (!claims.act || typeof claims.act !== "object") {
    errors.push("Missing or invalid 'act' claim (must be an object)");
  } else {
    const act = claims.act as Record<string, unknown>;
    if (typeof act.sub !== "string" || act.sub.length === 0) {
      errors.push("act.sub is required and must be a non-empty string");
    }
    if (act.email !== undefined && typeof act.email !== "string") {
      errors.push("act.email must be a string if present");
    }
  }

  // Check scope
  if (!Array.isArray(claims.scope)) {
    errors.push("'scope' must be an array of strings");
  } else if (!claims.scope.every((s: unknown) => typeof s === "string")) {
    errors.push("All scope entries must be strings");
  }

  // Check timestamps
  if (typeof claims.exp !== "number") {
    errors.push("'exp' must be a Unix timestamp (number)");
  }
  if (typeof claims.iat !== "number") {
    errors.push("'iat' must be a Unix timestamp (number)");
  }

  // Check TTL
  if (typeof claims.exp === "number" && typeof claims.iat === "number") {
    const ttl = claims.exp - claims.iat;
    if (ttl > 3600) {
      errors.push(`TTL exceeds maximum: ${ttl}s > 3600s`);
    }
    if (ttl <= 0) {
      errors.push("Token is already expired (exp <= iat)");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns the required JWT header for Attest tokens.
 */
export function getRequiredHeader(kid?: string): Record<string, string> {
  return {
    alg: "ES256",
    typ: "JWT",
    ...(kid && { kid }),
  };
}
