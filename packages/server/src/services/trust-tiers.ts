/**
 * Runtime trust tiers.
 *
 * Differentiates between vendor-signed runtimes (high trust),
 * registered runtimes (medium trust), and self-signed runtimes (low trust).
 *
 * Trust tiers affect:
 * - Which benefits the merchant is willing to offer
 * - How much the merchant trusts the attestation claims
 * - Policy evaluation (merchant can set different rules per tier)
 *
 * Tier definitions:
 * - **vendor-attested**: The runtime's JWKS is signed by a known vendor
 *   (e.g., Anthropic publishes a registry of their runtime keys).
 *   Highest trust — the vendor vouches for the runtime.
 * - **registered**: The runtime registered its JWKS with Attest and
 *   verified ownership of the issuer domain. Medium trust.
 * - **self-signed**: The runtime presents a valid JWKS but hasn't been
 *   verified. Lowest trust — could be anyone.
 */

import { requireDb } from "../db/connection.js";

export type TrustTier = "vendor-attested" | "registered" | "self-signed";

// Known vendor issuers — these are pre-trusted
const VENDOR_ISSUERS = new Set([
  "anthropic",
  "openai",
  "google",
  "microsoft",
  "cohere",
  "perplexity",
]);

/**
 * Determine the trust tier for a given runtime issuer.
 */
export async function getRuntimeTrustTier(
  issuer: string
): Promise<TrustTier> {
  // Check if this is a known vendor
  if (VENDOR_ISSUERS.has(issuer.toLowerCase())) {
    return "vendor-attested";
  }

  // Check if registered in our database
  try {
    const db = requireDb();
    const [row] = await db`
      SELECT status FROM runtimes
      WHERE issuer = ${issuer} AND status = 'active'
    `;
    if (row) return "registered";
  } catch {
    // No database — fall through to self-signed
  }

  return "self-signed";
}

/**
 * Get the trust tier for a runtime without database access.
 * Uses only the vendor list (useful for JWT-only mode).
 */
export function getStaticTrustTier(issuer: string): TrustTier {
  if (VENDOR_ISSUERS.has(issuer.toLowerCase())) {
    return "vendor-attested";
  }
  return "self-signed";
}

/**
 * Check if a trust tier meets a minimum requirement.
 */
export function meetsMinimumTrust(
  actual: TrustTier,
  minimum: TrustTier
): boolean {
  const order: Record<TrustTier, number> = {
    "vendor-attested": 3,
    "registered": 2,
    "self-signed": 1,
  };
  return order[actual] >= order[minimum];
}

/**
 * Register a vendor issuer (for testing or custom deployments).
 */
export function registerVendorIssuer(issuer: string): void {
  VENDOR_ISSUERS.add(issuer.toLowerCase());
}

/**
 * Check if an issuer is a known vendor.
 */
export function isVendorIssuer(issuer: string): boolean {
  return VENDOR_ISSUERS.has(issuer.toLowerCase());
}
