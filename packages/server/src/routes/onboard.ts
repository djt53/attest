import { Hono } from "hono";
import { z } from "zod";
import { createMerchant } from "../db/merchants.js";
import { createApiKey } from "../db/api-keys.js";
import { sql } from "../db/connection.js";

export const onboardRoute = new Hono();

const OnboardRequest = z.object({
  merchant_name: z.string().min(1),
  merchant_domain: z.string().min(1),
  platform: z.enum(["shopify", "stripe", "custom"]).optional(),
  platform_shop_id: z.string().optional(),
  contact_email: z.string().email(),
  webhook_url: z.string().url().optional(),
});

/**
 * POST /v0/onboard — Self-serve merchant registration
 *
 * Creates a merchant record and returns an API key.
 * This is the entry point for new merchants.
 */
onboardRoute.post("/", async (c) => {
  if (!sql) {
    return c.json(
      {
        error: "database_required",
        message: "Merchant onboarding requires a database connection",
      },
      503
    );
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = OnboardRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const data = parsed.data;

  // Create merchant
  const merchant = await createMerchant({
    external_id: data.merchant_domain,
    name: data.merchant_name,
    platform: data.platform,
    platform_shop_id: data.platform_shop_id,
    webhook_url: data.webhook_url,
  });

  // Generate API key
  const { apiKey, plaintext } = await createApiKey({
    merchant_id: merchant.id,
    name: "default",
    scopes: ["verify", "resolve", "merchants:read", "merchants:write"],
  });

  return c.json(
    {
      merchant: {
        id: merchant.id,
        external_id: merchant.external_id,
        name: merchant.name,
      },
      api_key: {
        key: plaintext,
        prefix: apiKey.key_prefix,
        scopes: apiKey.scopes,
        warning:
          "Save this key — it cannot be retrieved again. Include it as a Bearer token in the Authorization header.",
      },
      next_steps: {
        verify_endpoint: "POST /v0/verify",
        docs: "https://github.com/djt53/attest",
        sdk: "npm install @attest/sdk",
      },
    },
    201
  );
});
