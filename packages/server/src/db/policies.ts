import { requireDb } from "./connection.js";

export interface MerchantPolicy {
  id: string;
  merchant_id: string;
  runtime_issuer: string | null;
  agent_id: string | null;
  action: string;
  conditions: Record<string, unknown>;
  priority: number;
  created_at: Date;
}

export type PolicyAction = "allow" | "deny" | "step_up" | "review";

export async function findPoliciesForMerchant(
  merchantId: string,
  runtimeIssuer?: string,
  agentId?: string
): Promise<MerchantPolicy[]> {
  const db = requireDb();
  // Fetch all matching policies, ordered by priority (highest first)
  // Matches: exact agent+runtime, runtime-wide, or merchant-wide (null = wildcard)
  const rows = await db`
    SELECT * FROM merchant_policies
    WHERE merchant_id = ${merchantId}
      AND (runtime_issuer IS NULL OR runtime_issuer = ${runtimeIssuer ?? null})
      AND (agent_id IS NULL OR agent_id = ${agentId ?? null})
    ORDER BY priority DESC, created_at ASC
  `;
  return rows as unknown as MerchantPolicy[];
}

export async function evaluatePolicy(
  merchantId: string,
  runtimeIssuer: string,
  agentId: string,
  scope: string[]
): Promise<{ action: PolicyAction; policy_id: string | null }> {
  const policies = await findPoliciesForMerchant(
    merchantId,
    runtimeIssuer,
    agentId
  );

  if (policies.length === 0) {
    // Default policy: allow verified, log everything
    return { action: "allow", policy_id: null };
  }

  // First matching policy wins (highest priority)
  const policy = policies[0];

  // Check conditions
  const conditions = policy.conditions as {
    max_amount?: number;
    require_email?: boolean;
    allowed_scopes?: string[];
  };

  if (conditions.require_email) {
    // This will be checked by the caller with the attestation data
  }

  if (conditions.allowed_scopes) {
    const disallowed = scope.filter(
      (s) => !conditions.allowed_scopes!.some((as) => scopeMatches(s, as))
    );
    if (disallowed.length > 0) {
      return { action: "deny", policy_id: policy.id };
    }
  }

  return { action: policy.action as PolicyAction, policy_id: policy.id };
}

export async function createPolicy(data: {
  merchant_id: string;
  runtime_issuer?: string;
  agent_id?: string;
  action: PolicyAction;
  conditions?: Record<string, unknown>;
  priority?: number;
}): Promise<MerchantPolicy> {
  const db = requireDb();
  const [row] = await db`
    INSERT INTO merchant_policies (merchant_id, runtime_issuer, agent_id, action, conditions, priority)
    VALUES (
      ${data.merchant_id}, ${data.runtime_issuer ?? null}, ${data.agent_id ?? null},
      ${data.action}, ${JSON.stringify(data.conditions ?? {})}, ${data.priority ?? 0}
    )
    RETURNING *
  `;
  return row as MerchantPolicy;
}

export async function deletePolicy(policyId: string): Promise<void> {
  const db = requireDb();
  await db`DELETE FROM merchant_policies WHERE id = ${policyId}`;
}

// Simple scope matching: "purchase<=500" matches "purchase<=*" or "purchase<=500"
function scopeMatches(requested: string, allowed: string): boolean {
  if (allowed === "*") return true;
  if (allowed === requested) return true;

  // Parse amount constraints: "purchase<=500"
  const reqMatch = requested.match(/^(\w+)<=(\d+)$/);
  const allowMatch = allowed.match(/^(\w+)<=(\d+)$/);

  if (reqMatch && allowMatch && reqMatch[1] === allowMatch[1]) {
    return parseInt(reqMatch[2]) <= parseInt(allowMatch[2]);
  }

  // Base scope match: "purchase<=500" matches "purchase"
  const reqBase = requested.replace(/<=\d+$/, "");
  const allowBase = allowed.replace(/<=\d+$/, "");
  return reqBase === allowBase && !allowMatch;
}
