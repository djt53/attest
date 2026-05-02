import { verifyAttestation, type VerificationResult } from "./verification.js";
import { resolveIdentity, type ResolutionResult } from "./resolution.js";
import { evaluatePolicy, type PolicyAction } from "../db/policies.js";
import { logConsentEvent } from "../db/consent.js";
import { findMerchantByExternalId } from "../db/merchants.js";
import { sql } from "../db/connection.js";

export interface PipelineResult {
  valid: boolean;
  error?: string;
  attestation?: VerificationResult["attestation"];
  resolution?: ResolutionResult;
  policy_action?: PolicyAction;
  consent_id?: string;
}

/**
 * Full verification pipeline:
 * 1. Verify JWT signature + claims
 * 2. Resolve human identity against merchant's customer DB
 * 3. Evaluate merchant policy
 * 4. Log consent event
 *
 * When no database is configured, falls back to JWT-only verification.
 */
export async function verifyAndResolve(
  token: string,
  merchantExternalId: string
): Promise<PipelineResult> {
  // Step 1: Verify the JWT
  const verification = await verifyAttestation(token, merchantExternalId);
  if (!verification.valid || !verification.attestation) {
    return { valid: false, error: verification.error };
  }

  const att = verification.attestation;

  // If no database, return JWT-only result
  if (!sql) {
    return { valid: true, attestation: att };
  }

  // Step 2: Resolve identity
  let resolution: ResolutionResult = { matched: false };
  try {
    resolution = await resolveIdentity(
      merchantExternalId,
      att.human.id,
      att.human.email
    );
  } catch {
    // Resolution failure is non-fatal — we still have a valid attestation
  }

  // Step 3: Evaluate merchant policy
  const merchant = await findMerchantByExternalId(merchantExternalId);
  let policyAction: PolicyAction = "allow";
  let policyId: string | null = null;

  if (merchant) {
    const policyResult = await evaluatePolicy(
      merchant.id,
      att.runtime,
      att.agent,
      att.scope
    );
    policyAction = policyResult.action;
    policyId = policyResult.policy_id;
  }

  // Step 4: Log consent event
  let consentId: string | undefined;
  if (merchant) {
    try {
      const event = await logConsentEvent({
        merchant_id: merchant.id,
        runtime_issuer: att.runtime,
        agent_id: att.agent,
        human_principal_id: att.human.id,
        human_email: att.human.email,
        resolved_customer_id: resolution.customer_id,
        scope: att.scope,
        action: policyAction === "allow" ? "verified" : policyAction === "deny" ? "denied" : `${policyAction}_required`,
        policy_id: policyId ?? undefined,
        attestation_jti: token.split(".")[2]?.slice(0, 32) ?? "unknown",
      });
      consentId = event.id;
    } catch {
      // Consent logging failure is non-fatal
    }
  }

  if (policyAction === "deny") {
    return {
      valid: false,
      error: "policy_denied",
      attestation: att,
      resolution,
      policy_action: policyAction,
    };
  }

  return {
    valid: true,
    attestation: att,
    resolution,
    policy_action: policyAction,
    consent_id: consentId,
  };
}
