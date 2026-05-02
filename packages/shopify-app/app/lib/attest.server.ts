const ATTEST_API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

interface VerifyResult {
  valid: boolean;
  error?: string;
  attestation?: {
    runtime: string;
    agent: string;
    human: { id: string; email?: string };
    scope: string[];
    expires_at: string;
  };
  resolution?: {
    matched: boolean;
    customer_id?: string;
    external_customer_id?: string;
    customer_name?: string;
    customer_tier?: string;
    match_method?: string;
  };
  policy_action?: string;
  consent_id?: string;
}

export async function verifyAttestation(
  token: string,
  merchantId: string
): Promise<VerifyResult> {
  const response = await fetch(`${ATTEST_API_URL}/v0/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, merchant_id: merchantId }),
  });

  return response.json() as Promise<VerifyResult>;
}

interface AgentEvent {
  id: string;
  runtime_issuer: string;
  agent_id: string;
  human_principal_id: string;
  human_email?: string;
  scope: string[];
  action: string;
  created_at: string;
}

export async function getAgentEvents(
  merchantExternalId: string,
  limit = 50
): Promise<AgentEvent[]> {
  const response = await fetch(
    `${ATTEST_API_URL}/v0/merchants/${encodeURIComponent(merchantExternalId)}/events?limit=${limit}`
  );

  if (!response.ok) return [];
  const data = (await response.json()) as { events: AgentEvent[] };
  return data.events;
}

interface Policy {
  id: string;
  runtime_issuer?: string;
  agent_id?: string;
  action: string;
  conditions: Record<string, unknown>;
  priority: number;
}

export async function getPolicies(
  merchantExternalId: string
): Promise<Policy[]> {
  const response = await fetch(
    `${ATTEST_API_URL}/v0/merchants/${encodeURIComponent(merchantExternalId)}/policies`
  );

  if (!response.ok) return [];
  const data = (await response.json()) as { policies: Policy[] };
  return data.policies;
}

export async function createPolicy(
  merchantExternalId: string,
  policy: {
    runtime_issuer?: string;
    agent_id?: string;
    action: string;
    conditions?: Record<string, unknown>;
    priority?: number;
  }
): Promise<Policy> {
  const response = await fetch(
    `${ATTEST_API_URL}/v0/merchants/${encodeURIComponent(merchantExternalId)}/policies`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    }
  );

  return response.json() as Promise<Policy>;
}

export async function deletePolicy(
  merchantExternalId: string,
  policyId: string
): Promise<void> {
  await fetch(
    `${ATTEST_API_URL}/v0/merchants/${encodeURIComponent(merchantExternalId)}/policies/${policyId}`,
    { method: "DELETE" }
  );
}
