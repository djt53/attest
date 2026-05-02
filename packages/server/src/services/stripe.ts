/**
 * Stripe integration service.
 *
 * Handles:
 * - Verifying Stripe webhook signatures
 * - Decorating PaymentIntents/CheckoutSessions with agent identity metadata
 * - Syncing Stripe customers for identity resolution
 *
 * Stripe metadata keys (prefixed with `attest_` to avoid collisions):
 *   attest_verified: "true" | "false"
 *   attest_runtime: runtime issuer
 *   attest_agent: agent identifier
 *   attest_human_id: human principal ID
 *   attest_human_email: human email (if resolved)
 *   attest_customer_matched: "true" | "false"
 *   attest_customer_id: merchant's customer ID (if matched)
 *   attest_consent_id: consent ledger entry ID
 *   attest_policy_action: allow | deny | step_up | review
 */

import crypto from "crypto";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_API_BASE = "https://api.stripe.com/v1";

// --- Webhook signature verification ---

export function verifyStripeWebhookSignature(
  payload: string,
  signature: string,
  secret: string = STRIPE_WEBHOOK_SECRET
): boolean {
  if (!secret) return false;

  const elements = signature.split(",");
  const timestamp = elements.find((e) => e.startsWith("t="))?.slice(2);
  const v1Signatures = elements
    .filter((e) => e.startsWith("v1="))
    .map((e) => e.slice(3));

  if (!timestamp || v1Signatures.length === 0) return false;

  // Check timestamp tolerance (5 minutes)
  const ts = parseInt(timestamp);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return v1Signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch {
      return false;
    }
  });
}

// --- Stripe API helpers ---

async function stripeRequest(
  method: string,
  path: string,
  body?: Record<string, string>
): Promise<unknown> {
  const url = `${STRIPE_API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  if (body) {
    options.body = new URLSearchParams(body).toString();
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stripe API error ${response.status}: ${error}`);
  }

  return response.json();
}

// --- Checkout session decoration ---

export interface AttestMetadata {
  attest_verified: string;
  attest_runtime?: string;
  attest_agent?: string;
  attest_human_id?: string;
  attest_human_email?: string;
  attest_customer_matched?: string;
  attest_customer_id?: string;
  attest_consent_id?: string;
  attest_policy_action?: string;
}

export async function decoratePaymentIntent(
  paymentIntentId: string,
  metadata: AttestMetadata
): Promise<void> {
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      body[`metadata[${key}]`] = value;
    }
  }

  await stripeRequest("POST", `/payment_intents/${paymentIntentId}`, body);
}

export async function decorateCheckoutSession(
  sessionId: string,
  metadata: AttestMetadata
): Promise<void> {
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      body[`metadata[${key}]`] = value;
    }
  }

  await stripeRequest("POST", `/checkout/sessions/${sessionId}`, body);
}

// --- Customer sync ---

interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  metadata: Record<string, string>;
}

interface StripeListResponse {
  data: StripeCustomer[];
  has_more: boolean;
}

export async function listStripeCustomers(
  startingAfter?: string,
  limit: number = 100
): Promise<{ customers: StripeCustomer[]; hasMore: boolean }> {
  let path = `/customers?limit=${limit}`;
  if (startingAfter) {
    path += `&starting_after=${startingAfter}`;
  }

  const response = (await stripeRequest("GET", path)) as StripeListResponse;

  return {
    customers: response.data,
    hasMore: response.has_more,
  };
}

// --- Stripe Connect OAuth ---

export function getStripeConnectUrl(state: string): string {
  const clientId = process.env.STRIPE_CLIENT_ID || "";
  const redirectUri = `${process.env.APP_URL || "http://localhost:3000"}/v0/stripe/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    redirect_uri: redirectUri,
    state,
  });

  return `https://connect.stripe.com/oauth/authorize?${params}`;
}

export async function exchangeStripeCode(
  code: string
): Promise<{ stripe_user_id: string; access_token: string }> {
  const response = (await stripeRequest("POST", "/oauth/token", {
    grant_type: "authorization_code",
    code,
  })) as { stripe_user_id: string; access_token: string };

  return response;
}
