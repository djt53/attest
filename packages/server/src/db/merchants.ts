import { requireDb } from "./connection.js";

export interface Merchant {
  id: string;
  external_id: string;
  name: string;
  platform: string | null;
  platform_shop_id: string | null;
  webhook_url: string | null;
  settings: Record<string, unknown>;
  created_at: Date;
}

export interface MerchantCustomer {
  id: string;
  merchant_id: string;
  external_customer_id: string | null;
  email: string | null;
  name: string | null;
  tier: string | null;
  metadata: Record<string, unknown>;
}

export async function findMerchantByExternalId(
  externalId: string
): Promise<Merchant | null> {
  const db = requireDb();
  const [row] = await db`
    SELECT id, external_id, name, platform, platform_shop_id, webhook_url, settings, created_at
    FROM merchants
    WHERE external_id = ${externalId}
  `;
  return (row as Merchant) ?? null;
}

export async function createMerchant(data: {
  external_id: string;
  name: string;
  platform?: string;
  platform_shop_id?: string;
  webhook_url?: string;
}): Promise<Merchant> {
  const db = requireDb();
  const [row] = await db`
    INSERT INTO merchants (external_id, name, platform, platform_shop_id, webhook_url)
    VALUES (${data.external_id}, ${data.name}, ${data.platform ?? null}, ${data.platform_shop_id ?? null}, ${data.webhook_url ?? null})
    RETURNING id, external_id, name, platform, platform_shop_id, webhook_url, settings, created_at
  `;
  return row as Merchant;
}

export async function findCustomerByEmail(
  merchantId: string,
  email: string
): Promise<MerchantCustomer | null> {
  const db = requireDb();
  const [row] = await db`
    SELECT id, merchant_id, external_customer_id, email, name, tier, metadata
    FROM merchant_customers
    WHERE merchant_id = ${merchantId} AND email = ${email}
  `;
  return (row as MerchantCustomer) ?? null;
}

export async function upsertCustomer(data: {
  merchant_id: string;
  email: string;
  external_customer_id?: string;
  name?: string;
  tier?: string;
}): Promise<MerchantCustomer> {
  const db = requireDb();
  const [row] = await db`
    INSERT INTO merchant_customers (merchant_id, email, external_customer_id, name, tier)
    VALUES (${data.merchant_id}, ${data.email}, ${data.external_customer_id ?? null}, ${data.name ?? null}, ${data.tier ?? null})
    ON CONFLICT (merchant_id, email) DO UPDATE SET
      external_customer_id = COALESCE(EXCLUDED.external_customer_id, merchant_customers.external_customer_id),
      name = COALESCE(EXCLUDED.name, merchant_customers.name),
      tier = COALESCE(EXCLUDED.tier, merchant_customers.tier),
      updated_at = now()
    RETURNING id, merchant_id, external_customer_id, email, name, tier, metadata
  `;
  return row as MerchantCustomer;
}
