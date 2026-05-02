import { Hono } from "hono";
import { z } from "zod";
import { verifyAttestation } from "../services/verification.js";
import { sql } from "../db/connection.js";

export const authzCheckRoute = new Hono();

const AuthzCheckRequest = z.object({
  /** The attestation token to check */
  token: z.string().min(1),
  /** The merchant audience */
  merchant_id: z.string().min(1),
  /** Specific scope to check (optional — if provided, checks if this scope is still authorized) */
  scope: z.string().optional(),
});

/**
 * POST /v0/authz/check — Continuous authorization check
 *
 * Merchants call this to verify that a previously-verified attestation
 * is still valid and the delegation hasn't been revoked.
 *
 * Use cases:
 * - Before processing a high-value transaction
 * - Periodic re-validation during long agent sessions
 * - After a consent revocation event
 *
 * Returns:
 * - active: true — delegation is still valid
 * - active: false — delegation has been revoked, token expired, or scope removed
 */
authzCheckRoute.post("/check", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = AuthzCheckRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const { token, merchant_id, scope } = parsed.data;

  // Re-verify the token (checks expiry, signature, etc.)
  const verification = await verifyAttestation(token, merchant_id);

  if (!verification.valid) {
    return c.json({
      active: false,
      reason: verification.error || "token_invalid",
    });
  }

  // Check if the specific scope is still authorized
  if (scope && verification.attestation) {
    const hasScope = verification.attestation.scope.some((s) => {
      if (s === scope) return true;
      // Check amount-bounded scopes: "purchase<=500" covers "purchase<=200"
      const reqMatch = scope.match(/^(\w+)<=(\d+)$/);
      const attMatch = s.match(/^(\w+)<=(\d+)$/);
      if (reqMatch && attMatch && reqMatch[1] === attMatch[1]) {
        return parseInt(reqMatch[2]) <= parseInt(attMatch[2]);
      }
      return false;
    });

    if (!hasScope) {
      return c.json({
        active: false,
        reason: "scope_not_authorized",
        requested_scope: scope,
        available_scopes: verification.attestation.scope,
      });
    }
  }

  // Check for revocation in the consent ledger
  if (sql && verification.attestation) {
    try {
      const db = sql;
      const [revocation] = await db`
        SELECT id FROM consent_grants
        WHERE human_principal_id = ${verification.attestation.human.id}
          AND status = 'revoked'
          AND revoked_at > now() - interval '1 hour'
        ORDER BY revoked_at DESC
        LIMIT 1
      `;

      if (revocation) {
        return c.json({
          active: false,
          reason: "consent_revoked",
        });
      }
    } catch {
      // Database unavailable — continue with token-only check
    }
  }

  return c.json({
    active: true,
    attestation: verification.attestation,
    expires_at: verification.attestation?.expires_at,
  });
});
