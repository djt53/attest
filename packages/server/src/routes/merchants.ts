import { Hono } from "hono";
import { z } from "zod";
import {
  createMerchant,
  findMerchantByExternalId,
  upsertCustomer,
} from "../db/merchants.js";
import { createPolicy, deletePolicy, findPoliciesForMerchant } from "../db/policies.js";
import { findConsentEventsByMerchant } from "../db/consent.js";

export const merchantsRoute = new Hono();

const CreateMerchantRequest = z.object({
  external_id: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(["shopify", "stripe", "custom"]).optional(),
  platform_shop_id: z.string().optional(),
  webhook_url: z.string().url().optional(),
});

merchantsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = CreateMerchantRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const merchant = await createMerchant(parsed.data);
  return c.json(merchant, 201);
});

merchantsRoute.get("/:externalId", async (c) => {
  const merchant = await findMerchantByExternalId(c.req.param("externalId"));
  if (!merchant) return c.json({ error: "not_found" }, 404);
  return c.json(merchant);
});

// Customer management
const UpsertCustomerRequest = z.object({
  email: z.string().email(),
  external_customer_id: z.string().optional(),
  name: z.string().optional(),
  tier: z.string().optional(),
});

merchantsRoute.post("/:externalId/customers", async (c) => {
  const merchant = await findMerchantByExternalId(c.req.param("externalId"));
  if (!merchant) return c.json({ error: "merchant_not_found" }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = UpsertCustomerRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const customer = await upsertCustomer({
    merchant_id: merchant.id,
    ...parsed.data,
  });
  return c.json(customer, 201);
});

// Bulk customer import
const BulkCustomerRequest = z.object({
  customers: z.array(
    z.object({
      email: z.string().email(),
      external_customer_id: z.string().optional(),
      name: z.string().optional(),
      tier: z.string().optional(),
    })
  ).min(1).max(1000),
});

merchantsRoute.post("/:externalId/customers/import", async (c) => {
  const merchant = await findMerchantByExternalId(c.req.param("externalId"));
  if (!merchant) return c.json({ error: "merchant_not_found" }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = BulkCustomerRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const results = await Promise.allSettled(
    parsed.data.customers.map((customer) =>
      upsertCustomer({ merchant_id: merchant.id, ...customer })
    )
  );

  const imported = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return c.json({ imported, failed, total: parsed.data.customers.length }, 201);
});

// Policy management
const CreatePolicyRequest = z.object({
  runtime_issuer: z.string().optional(),
  agent_id: z.string().optional(),
  action: z.enum(["allow", "deny", "step_up", "review"]),
  conditions: z.record(z.unknown()).optional(),
  priority: z.number().int().optional(),
});

merchantsRoute.get("/:externalId/policies", async (c) => {
  const merchant = await findMerchantByExternalId(c.req.param("externalId"));
  if (!merchant) return c.json({ error: "merchant_not_found" }, 404);

  const policies = await findPoliciesForMerchant(merchant.id);
  return c.json({ policies });
});

merchantsRoute.post("/:externalId/policies", async (c) => {
  const merchant = await findMerchantByExternalId(c.req.param("externalId"));
  if (!merchant) return c.json({ error: "merchant_not_found" }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = CreatePolicyRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const policy = await createPolicy({
    merchant_id: merchant.id,
    ...parsed.data,
  });
  return c.json(policy, 201);
});

merchantsRoute.delete("/:externalId/policies/:policyId", async (c) => {
  await deletePolicy(c.req.param("policyId"));
  return c.json({ deleted: true });
});

// Consent event log
merchantsRoute.get("/:externalId/events", async (c) => {
  const merchant = await findMerchantByExternalId(c.req.param("externalId"));
  if (!merchant) return c.json({ error: "merchant_not_found" }, 404);

  const limit = parseInt(c.req.query("limit") ?? "50");
  const events = await findConsentEventsByMerchant(merchant.id, limit);
  return c.json({ events });
});
