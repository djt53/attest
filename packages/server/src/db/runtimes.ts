import { requireDb } from "./connection.js";

export interface Runtime {
  id: string;
  issuer: string;
  name: string;
  jwks_url: string;
  contact_email: string;
  status: string;
  created_at: Date;
}

export async function findRuntimeByIssuer(
  issuer: string
): Promise<Runtime | null> {
  const db = requireDb();
  const [row] = await db`
    SELECT id, issuer, name, jwks_url, contact_email, status, created_at
    FROM runtimes
    WHERE issuer = ${issuer} AND status = 'active'
  `;
  return (row as Runtime) ?? null;
}

export async function registerRuntime(data: {
  issuer: string;
  name: string;
  jwks_url: string;
  contact_email: string;
}): Promise<Runtime> {
  const db = requireDb();
  const [row] = await db`
    INSERT INTO runtimes (issuer, name, jwks_url, contact_email)
    VALUES (${data.issuer}, ${data.name}, ${data.jwks_url}, ${data.contact_email})
    ON CONFLICT (issuer) DO UPDATE SET
      name = EXCLUDED.name,
      jwks_url = EXCLUDED.jwks_url,
      contact_email = EXCLUDED.contact_email,
      updated_at = now()
    RETURNING id, issuer, name, jwks_url, contact_email, status, created_at
  `;
  return row as Runtime;
}

export async function listRuntimes(): Promise<Runtime[]> {
  const db = requireDb();
  const rows = await db`
    SELECT id, issuer, name, jwks_url, contact_email, status, created_at
    FROM runtimes
    WHERE status = 'active'
    ORDER BY created_at DESC
  `;
  return rows as unknown as Runtime[];
}
