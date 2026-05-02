import { Hono } from "hono";
import { listStripeCustomers } from "../services/stripe.js";
import { findMerchantByExternalId, upsertCustomer } from "../db/merchants.js";

export const stripeCustomersRoute = new Hono();

/**
 * POST /v0/stripe/sync-customers — Import customers from Stripe
 *
 * Paginates through all Stripe customers and upserts them into
 * the merchant's customer database for identity resolution.
 */
stripeCustomersRoute.post("/sync-customers", async (c) => {
  const body = await c.req.json().catch(() => null);
  const merchantExternalId = body?.merchant_id;

  if (!merchantExternalId) {
    return c.json({ error: "merchant_id is required" }, 400);
  }

  const merchant = await findMerchantByExternalId(merchantExternalId);
  if (!merchant) {
    return c.json({ error: "merchant_not_found" }, 404);
  }

  let synced = 0;
  let failed = 0;
  let total = 0;
  let lastId: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const result = await listStripeCustomers(lastId, 100);

    for (const customer of result.customers) {
      total++;
      if (!customer.email) continue;

      try {
        await upsertCustomer({
          merchant_id: merchant.id,
          email: customer.email,
          external_customer_id: customer.id,
          name: customer.name || undefined,
        });
        synced++;
      } catch {
        failed++;
      }
    }

    hasMore = result.hasMore;
    if (result.customers.length > 0) {
      lastId = result.customers[result.customers.length - 1].id;
    }
  }

  return c.json({ synced, failed, total });
});
