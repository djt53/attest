import { requireDb } from "./connection.js";

export interface ConsentEvent {
  id: string;
  merchant_id: string;
  runtime_issuer: string;
  agent_id: string;
  human_principal_id: string;
  human_email: string | null;
  resolved_customer_id: string | null;
  scope: string[];
  action: string;
  policy_id: string | null;
  attestation_jti: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface ConsentGrant {
  id: string;
  human_principal_id: string;
  human_email: string | null;
  merchant_id: string;
  runtime_issuer: string | null;
  agent_id: string | null;
  scope: string[];
  status: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export async function logConsentEvent(data: {
  merchant_id: string;
  runtime_issuer: string;
  agent_id: string;
  human_principal_id: string;
  human_email?: string;
  resolved_customer_id?: string;
  scope: string[];
  action: string;
  policy_id?: string;
  attestation_jti: string;
  metadata?: Record<string, unknown>;
}): Promise<ConsentEvent> {
  const db = requireDb();
  const [row] = await db`
    INSERT INTO consent_events (
      merchant_id, runtime_issuer, agent_id, human_principal_id, human_email,
      resolved_customer_id, scope, action, policy_id, attestation_jti, metadata
    ) VALUES (
      ${data.merchant_id}, ${data.runtime_issuer}, ${data.agent_id},
      ${data.human_principal_id}, ${data.human_email ?? null},
      ${data.resolved_customer_id ?? null}, ${data.scope}, ${data.action},
      ${data.policy_id ?? null}, ${data.attestation_jti},
      ${JSON.stringify(data.metadata ?? {})}
    )
    RETURNING *
  `;
  return row as ConsentEvent;
}

export async function findConsentEventsByHuman(
  humanPrincipalId: string,
  limit = 50
): Promise<ConsentEvent[]> {
  const db = requireDb();
  const rows = await db`
    SELECT ce.*, m.name as merchant_name, m.external_id as merchant_external_id
    FROM consent_events ce
    JOIN merchants m ON m.id = ce.merchant_id
    WHERE ce.human_principal_id = ${humanPrincipalId}
    ORDER BY ce.created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as ConsentEvent[];
}

export async function findConsentEventsByMerchant(
  merchantId: string,
  limit = 50
): Promise<ConsentEvent[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM consent_events
    WHERE merchant_id = ${merchantId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as ConsentEvent[];
}

export async function createConsentGrant(data: {
  human_principal_id: string;
  human_email?: string;
  merchant_id: string;
  runtime_issuer?: string;
  agent_id?: string;
  scope: string[];
  expires_at?: Date;
}): Promise<ConsentGrant> {
  const db = requireDb();
  const [row] = await db`
    INSERT INTO consent_grants (
      human_principal_id, human_email, merchant_id,
      runtime_issuer, agent_id, scope, expires_at
    ) VALUES (
      ${data.human_principal_id}, ${data.human_email ?? null},
      ${data.merchant_id}, ${data.runtime_issuer ?? null},
      ${data.agent_id ?? null}, ${data.scope},
      ${data.expires_at ?? null}
    )
    RETURNING *
  `;
  return row as ConsentGrant;
}

export async function revokeConsentGrant(grantId: string): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE consent_grants
    SET status = 'revoked', revoked_at = now(), updated_at = now()
    WHERE id = ${grantId} AND status = 'active'
  `;
}

export async function findActiveGrantsForHuman(
  humanPrincipalId: string
): Promise<ConsentGrant[]> {
  const db = requireDb();
  const rows = await db`
    SELECT cg.*, m.name as merchant_name, m.external_id as merchant_external_id
    FROM consent_grants cg
    JOIN merchants m ON m.id = cg.merchant_id
    WHERE cg.human_principal_id = ${humanPrincipalId}
      AND cg.status = 'active'
      AND (cg.expires_at IS NULL OR cg.expires_at > now())
    ORDER BY cg.created_at DESC
  `;
  return rows as unknown as ConsentGrant[];
}
