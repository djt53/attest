import { Hono } from "hono";
import { z } from "zod";
import {
  verifyStripeWebhookSignature,
  decoratePaymentIntent,
  decorateCheckoutSession,
  getStripeConnectUrl,
  exchangeStripeCode,
  type AttestMetadata,
} from "../services/stripe.js";
import { verifyAndResolve } from "../services/pipeline.js";
import { createMerchant } from "../db/merchants.js";
import { createApiKey } from "../db/api-keys.js";
import { sql } from "../db/connection.js";
import crypto from "crypto";

export const stripeRoute = new Hono();

// --- Stripe Connect OAuth ---

/**
 * GET /v0/stripe/connect — Initiate Stripe Connect OAuth
 */
stripeRoute.get("/connect", async (c) => {
  const state = crypto.randomBytes(16).toString("hex");
  // TODO: Store state for CSRF verification
  const url = getStripeConnectUrl(state);
  return c.redirect(url);
});

/**
 * GET /v0/stripe/callback — Handle Stripe Connect OAuth callback
 */
stripeRoute.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code) {
    return c.json({ error: "missing_code" }, 400);
  }

  // TODO: Verify state parameter

  try {
    const { stripe_user_id, access_token } = await exchangeStripeCode(code);

    // Register merchant with Attest
    if (process.env.DATABASE_URL) {
      const merchant = await createMerchant({
        external_id: `stripe:${stripe_user_id}`,
        name: stripe_user_id,
        platform: "stripe",
        platform_shop_id: stripe_user_id,
      });

      const { apiKey, plaintext } = await createApiKey({
        merchant_id: merchant.id,
        name: "stripe-connect",
        scopes: ["verify", "resolve", "merchants:read", "merchants:write"],
      });

      return c.json({
        connected: true,
        stripe_user_id,
        merchant_id: merchant.id,
        api_key: {
          key: plaintext,
          prefix: apiKey.key_prefix,
          warning: "Save this key — it cannot be retrieved again.",
        },
      });
    }

    return c.json({ connected: true, stripe_user_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "connect_failed", detail: message }, 500);
  }
});

// --- Webhook handler ---

/**
 * POST /v0/stripe/webhooks — Handle Stripe webhook events
 *
 * Supported events:
 * - checkout.session.completed — Check for attestation, verify, decorate
 * - payment_intent.created — Check for attestation in metadata
 * - customer.created — Sync to merchant customers for identity resolution
 */
stripeRoute.post("/webhooks", async (c) => {
  const signature = c.req.header("Stripe-Signature");
  if (!signature) {
    return c.json({ error: "missing_signature" }, 400);
  }

  const rawBody = await c.req.text();

  // Verify webhook signature
  if (
    process.env.STRIPE_WEBHOOK_SECRET &&
    !verifyStripeWebhookSignature(rawBody, signature)
  ) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  const event = JSON.parse(rawBody) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(c, event.data.object);

    case "payment_intent.created":
      return handlePaymentIntentCreated(c, event.data.object);

    default:
      return c.json({ received: true });
  }
});

async function handleCheckoutCompleted(
  c: any,
  session: Record<string, unknown>
) {
  const metadata = session.metadata as Record<string, string> | undefined;
  const attestationToken = metadata?.agent_attestation;

  if (!attestationToken) {
    return c.json({ agent_detected: false });
  }

  // Determine merchant ID from the Stripe account
  const merchantId =
    metadata?.attest_merchant_id ||
    `stripe:${(session.livemode ? "live" : "test")}`;

  // Verify the attestation
  const result = await verifyAndResolve(attestationToken, merchantId);

  // Build metadata to attach back to the session
  const attestMetadata: AttestMetadata = {
    attest_verified: String(result.valid),
    attest_policy_action: result.policy_action || "unknown",
  };

  if (result.valid && result.attestation) {
    attestMetadata.attest_runtime = result.attestation.runtime;
    attestMetadata.attest_agent = result.attestation.agent;
    attestMetadata.attest_human_id = result.attestation.human.id;
    attestMetadata.attest_human_email = result.attestation.human.email;
  }

  if (result.resolution) {
    attestMetadata.attest_customer_matched = String(result.resolution.matched);
    if (result.resolution.external_customer_id) {
      attestMetadata.attest_customer_id =
        result.resolution.external_customer_id;
    }
  }

  if (result.consent_id) {
    attestMetadata.attest_consent_id = result.consent_id;
  }

  // Decorate the checkout session with attestation results
  try {
    await decorateCheckoutSession(session.id as string, attestMetadata);

    // Also decorate the payment intent if present
    if (session.payment_intent) {
      await decoratePaymentIntent(
        session.payment_intent as string,
        attestMetadata
      );
    }
  } catch (err) {
    console.error("Failed to decorate Stripe objects:", err);
  }

  return c.json({
    agent_detected: true,
    verified: result.valid,
    policy_action: result.policy_action,
  });
}

async function handlePaymentIntentCreated(
  c: any,
  paymentIntent: Record<string, unknown>
) {
  const metadata = paymentIntent.metadata as
    | Record<string, string>
    | undefined;
  const attestationToken = metadata?.agent_attestation;

  if (!attestationToken) {
    return c.json({ agent_detected: false });
  }

  const merchantId =
    metadata?.attest_merchant_id || "stripe:unknown";

  const result = await verifyAndResolve(attestationToken, merchantId);

  const attestMetadata: AttestMetadata = {
    attest_verified: String(result.valid),
  };

  if (result.valid && result.attestation) {
    attestMetadata.attest_runtime = result.attestation.runtime;
    attestMetadata.attest_agent = result.attestation.agent;
    attestMetadata.attest_human_id = result.attestation.human.id;
  }

  try {
    await decoratePaymentIntent(
      paymentIntent.id as string,
      attestMetadata
    );
  } catch (err) {
    console.error("Failed to decorate PaymentIntent:", err);
  }

  return c.json({
    agent_detected: true,
    verified: result.valid,
  });
}

// --- Direct verification for Stripe Checkout ---

const StripeVerifyRequest = z.object({
  token: z.string().min(1),
  merchant_id: z.string().min(1),
  checkout_session_id: z.string().optional(),
  payment_intent_id: z.string().optional(),
});

/**
 * POST /v0/stripe/verify — Verify and decorate in one call
 *
 * Merchants call this from their server when creating a Stripe Checkout
 * session with an agent attestation. It verifies the token and optionally
 * decorates the Stripe objects with the results.
 */
stripeRoute.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = StripeVerifyRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const { token, merchant_id, checkout_session_id, payment_intent_id } =
    parsed.data;

  // Verify the attestation
  const result = await verifyAndResolve(token, merchant_id);

  // Build metadata
  const attestMetadata: AttestMetadata = {
    attest_verified: String(result.valid),
    attest_policy_action: result.policy_action || "unknown",
  };

  if (result.valid && result.attestation) {
    attestMetadata.attest_runtime = result.attestation.runtime;
    attestMetadata.attest_agent = result.attestation.agent;
    attestMetadata.attest_human_id = result.attestation.human.id;
    attestMetadata.attest_human_email = result.attestation.human.email;
  }

  if (result.resolution?.matched) {
    attestMetadata.attest_customer_matched = "true";
    attestMetadata.attest_customer_id =
      result.resolution.external_customer_id;
  }

  if (result.consent_id) {
    attestMetadata.attest_consent_id = result.consent_id;
  }

  // Decorate Stripe objects if IDs provided
  const decorated: string[] = [];
  try {
    if (checkout_session_id) {
      await decorateCheckoutSession(checkout_session_id, attestMetadata);
      decorated.push("checkout_session");
    }
    if (payment_intent_id) {
      await decoratePaymentIntent(payment_intent_id, attestMetadata);
      decorated.push("payment_intent");
    }
  } catch (err) {
    console.error("Failed to decorate Stripe objects:", err);
  }

  return c.json({
    ...result,
    stripe: {
      decorated,
      metadata: attestMetadata,
    },
  });
});
