/**
 * Billing service — Stripe-based subscription and usage metering.
 *
 * Plans:
 *   free     — 1,000 sessions/mo, detection + basic dashboard
 *   growth   — $99/mo, 25,000 sessions, challenge-response + resolution
 *   scale    — $499/mo, 250,000 sessions, advanced analytics + SLA
 *   enterprise — custom pricing
 *
 * Overage: $0.005 per session above tier cap.
 *
 * Usage is tracked via the consent_events table (each verification = 1 session).
 * Metered usage is reported to Stripe at the end of each billing period.
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_API = "https://api.stripe.com/v1";
const APP_URL = process.env.APP_URL || "http://localhost:3003";

export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  sessionLimit: number;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    sessionLimit: 1_000,
    features: ["Agent detection", "Basic dashboard", "Traffic analytics"],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 99,
    sessionLimit: 25_000,
    features: [
      "Challenge-response verification",
      "Identity resolution",
      "Policy engine",
      "Customer matching",
      "Stripe integration",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 499,
    sessionLimit: 250_000,
    features: [
      "Everything in Growth",
      "Advanced analytics",
      "Priority support",
      "Custom resolution webhooks",
      "SLA",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: -1, // custom
    sessionLimit: Infinity,
    features: [
      "Everything in Scale",
      "Unlimited sessions",
      "Dedicated support",
      "Custom integrations",
      "On-prem option",
    ],
  },
];

export function getPlan(planId: string): Plan | undefined {
  return PLANS.find((p) => p.id === planId);
}

// --- Stripe API helpers ---

async function stripePost(
  path: string,
  body: Record<string, string>
): Promise<any> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Stripe error ${response.status}: ${err}`);
  }
  return response.json();
}

async function stripeGet(path: string): Promise<any> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Stripe error ${response.status}: ${err}`);
  }
  return response.json();
}

// --- Checkout ---

/**
 * Create a Stripe Checkout session for a merchant to subscribe.
 * Returns the checkout URL to redirect the merchant to.
 */
export async function createCheckoutSession(opts: {
  merchantId: string;
  merchantEmail: string;
  planId: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ url: string; sessionId: string }> {
  const plan = getPlan(opts.planId);
  if (!plan || plan.id === "free" || plan.id === "enterprise") {
    throw new Error(`Cannot create checkout for plan: ${opts.planId}`);
  }

  // Create or get Stripe customer
  const customer = await stripePost("/customers", {
    email: opts.merchantEmail,
    "metadata[attest_merchant_id]": opts.merchantId,
  });

  const session = await stripePost("/checkout/sessions", {
    "customer": customer.id,
    "mode": "subscription",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(plan.priceMonthly * 100),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": `Attest ${plan.name}`,
    "line_items[0][price_data][product_data][description]": `${plan.sessionLimit.toLocaleString()} agent sessions/month`,
    "line_items[0][quantity]": "1",
    "success_url": opts.successUrl || `${APP_URL}/?billing=success`,
    "cancel_url": opts.cancelUrl || `${APP_URL}/?billing=cancelled`,
    "metadata[attest_merchant_id]": opts.merchantId,
    "metadata[attest_plan]": opts.planId,
    "subscription_data[metadata][attest_merchant_id]": opts.merchantId,
    "subscription_data[metadata][attest_plan]": opts.planId,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Create a Stripe Billing Portal session for managing subscription.
 */
export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl?: string
): Promise<{ url: string }> {
  const session = await stripePost("/billing_portal/sessions", {
    customer: stripeCustomerId,
    return_url: returnUrl || APP_URL,
  });
  return { url: session.url };
}

// --- Usage tracking ---

/**
 * Get session count for a merchant in the current billing period.
 * Reads from the consent_events table.
 */
export async function getSessionCount(
  merchantId: string,
  since: Date
): Promise<number> {
  // This would query the DB — imported by the caller
  // Keeping this as a pure function signature for the billing service
  return 0; // Placeholder — wired in the route
}

/**
 * Check if a merchant has exceeded their plan's session limit.
 */
export function isOverLimit(
  sessionCount: number,
  planId: string
): { over: boolean; limit: number; overage: number } {
  const plan = getPlan(planId);
  if (!plan) return { over: false, limit: 0, overage: 0 };

  const over = sessionCount > plan.sessionLimit;
  return {
    over,
    limit: plan.sessionLimit,
    overage: over ? sessionCount - plan.sessionLimit : 0,
  };
}

/**
 * Calculate overage charges.
 * $0.005 per session above the plan cap.
 */
export function calculateOverage(overageSessions: number): number {
  return overageSessions * 0.005;
}
