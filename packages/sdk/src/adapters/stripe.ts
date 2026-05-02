/**
 * Stripe Checkout Adapter for Attest
 *
 * Helpers for merchants to integrate agent attestation with Stripe Checkout.
 *
 * Server-side usage (creating a Checkout Session):
 * ```ts
 * import Stripe from "stripe";
 * import { createStripeCheckoutParams } from "@attest/sdk/adapters/stripe";
 *
 * const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
 * const attestationToken = req.headers["agent-attestation"];
 *
 * const attestParams = createStripeCheckoutParams({
 *   token: attestationToken,
 *   merchantId: "my-store.com",
 * });
 *
 * const session = await stripe.checkout.sessions.create({
 *   ...attestParams,
 *   line_items: [...],
 *   mode: "payment",
 *   success_url: "...",
 * });
 * ```
 *
 * Client-side usage (with Stripe.js):
 * ```ts
 * import { attachAttestationToCheckout } from "@attest/sdk/adapters/stripe";
 *
 * // Before redirecting to Stripe Checkout
 * const options = attachAttestationToCheckout(attestationToken);
 * // Pass options.metadata when creating the session server-side
 * ```
 */

export interface StripeCheckoutAttestOptions {
  /** The Agent-Attestation JWT */
  token: string;
  /** Merchant identifier for verification */
  merchantId: string;
  /** Attest API URL (for server-side verification) */
  apiUrl?: string;
  /** Attest API key (for server-side verification) */
  apiKey?: string;
}

/**
 * Creates Stripe Checkout Session parameters with attestation metadata.
 * Pass the returned object into stripe.checkout.sessions.create().
 */
export function createStripeCheckoutParams(options: StripeCheckoutAttestOptions) {
  return {
    metadata: {
      agent_attestation: options.token,
      attest_merchant_id: options.merchantId,
    },
    payment_intent_data: {
      metadata: {
        agent_attestation: options.token,
        attest_merchant_id: options.merchantId,
      },
    },
  };
}

/**
 * Creates PaymentIntent parameters with attestation metadata.
 * For merchants using PaymentIntents directly instead of Checkout Sessions.
 */
export function createPaymentIntentParams(options: StripeCheckoutAttestOptions) {
  return {
    metadata: {
      agent_attestation: options.token,
      attest_merchant_id: options.merchantId,
    },
  };
}

/**
 * Server-side: verify attestation and decorate a Stripe Checkout Session
 * in one API call via the Attest API.
 */
export async function verifyAndDecorateCheckout(options: {
  token: string;
  merchantId: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  apiUrl?: string;
  apiKey?: string;
}): Promise<{
  valid: boolean;
  error?: string;
  attestation?: {
    runtime: string;
    agent: string;
    human: { id: string; email?: string };
    scope: string[];
  };
  stripe?: {
    decorated: string[];
    metadata: Record<string, string>;
  };
}> {
  const apiUrl = options.apiUrl || "https://api.attest.dev";

  const response = await fetch(`${apiUrl}/v0/stripe/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
    },
    body: JSON.stringify({
      token: options.token,
      merchant_id: options.merchantId,
      checkout_session_id: options.checkoutSessionId,
      payment_intent_id: options.paymentIntentId,
    }),
  });

  return response.json();
}

/**
 * Express/Connect middleware that detects attestation headers on checkout
 * requests and injects Stripe metadata params.
 *
 * Usage:
 * ```ts
 * app.post("/create-checkout-session",
 *   stripeAttestMiddleware({ merchantId: "my-store.com" }),
 *   async (req, res) => {
 *     const session = await stripe.checkout.sessions.create({
 *       ...req.attestStripeParams,
 *       line_items: [...],
 *     });
 *   }
 * );
 * ```
 */
export function stripeAttestMiddleware(options: {
  merchantId: string;
}) {
  return (req: any, _res: any, next: () => void) => {
    const token = req.headers?.["agent-attestation"];

    if (token) {
      req.attestStripeParams = createStripeCheckoutParams({
        token,
        merchantId: options.merchantId,
      });
    } else {
      req.attestStripeParams = {};
    }

    next();
  };
}
