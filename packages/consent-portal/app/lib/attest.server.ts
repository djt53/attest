const ATTEST_API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

interface ConsentGrant {
  id: string;
  human_principal_id: string;
  merchant_id: string;
  merchant_name?: string;
  merchant_external_id?: string;
  runtime_issuer: string | null;
  agent_id: string | null;
  scope: string[];
  status: string;
  expires_at: string | null;
  created_at: string;
}

interface ConsentEvent {
  id: string;
  merchant_id: string;
  merchant_name?: string;
  merchant_external_id?: string;
  runtime_issuer: string;
  agent_id: string;
  human_email?: string;
  scope: string[];
  action: string;
  created_at: string;
}

export async function getActiveGrants(
  humanPrincipalId: string
): Promise<ConsentGrant[]> {
  const response = await fetch(
    `${ATTEST_API_URL}/v0/consent/${encodeURIComponent(humanPrincipalId)}/grants`
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { grants: ConsentGrant[] };
  return data.grants;
}

export async function getConsentHistory(
  humanPrincipalId: string,
  limit = 50
): Promise<ConsentEvent[]> {
  const response = await fetch(
    `${ATTEST_API_URL}/v0/consent/${encodeURIComponent(humanPrincipalId)}/events?limit=${limit}`
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { events: ConsentEvent[] };
  return data.events;
}

export async function revokeGrant(grantId: string): Promise<void> {
  await fetch(`${ATTEST_API_URL}/v0/consent/grants/${grantId}/revoke`, {
    method: "POST",
  });
}
