import { requireDb } from "./connection.js";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export interface ApiKey {
  id: string;
  merchant_id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const key = `att_live_${raw}`;
  const prefix = key.slice(0, 16);
  const hash = hashKey(key);
  return { key, prefix, hash };
}

export async function createApiKey(data: {
  merchant_id: string;
  name?: string;
  scopes?: string[];
}): Promise<{ apiKey: ApiKey; plaintext: string }> {
  const db = requireDb();
  const { key, prefix, hash } = generateApiKey();

  const [row] = await db`
    INSERT INTO api_keys (merchant_id, key_hash, key_prefix, name, scopes)
    VALUES (${data.merchant_id}, ${hash}, ${prefix}, ${data.name ?? "default"}, ${data.scopes ?? ["verify", "resolve"]})
    RETURNING id, merchant_id, key_prefix, name, scopes, last_used_at, expires_at, created_at
  `;

  return { apiKey: row as ApiKey, plaintext: key };
}

export async function validateApiKey(
  key: string
): Promise<{ valid: boolean; merchant_id?: string; scopes?: string[] }> {
  const db = requireDb();
  const prefix = key.slice(0, 16);
  const hash = hashKey(key);

  const rows = await db`
    SELECT id, merchant_id, key_hash, scopes, expires_at
    FROM api_keys
    WHERE key_prefix = ${prefix}
  `;

  for (const row of rows) {
    const storedHash = Buffer.from(row.key_hash as string, "hex");
    const providedHash = Buffer.from(hash, "hex");

    if (
      storedHash.length === providedHash.length &&
      timingSafeEqual(storedHash, providedHash)
    ) {
      // Check expiry
      if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
        return { valid: false };
      }

      // Update last_used_at (fire and forget)
      db`UPDATE api_keys SET last_used_at = now() WHERE id = ${row.id}`.catch(
        () => {}
      );

      return {
        valid: true,
        merchant_id: row.merchant_id as string,
        scopes: row.scopes as string[],
      };
    }
  }

  return { valid: false };
}
