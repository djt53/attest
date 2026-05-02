import { Hono } from "hono";
import { z } from "zod";
import {
  createCheckoutSession,
  createPortalSession,
  PLANS,
  getPlan,
  isOverLimit,
} from "../services/billing.js";
import { sql } from "../db/connection.js";

export const billingRoute = new Hono();

/**
 * GET /v0/billing/plans — List available plans
 */
billingRoute.get("/plans", async (c) => {
  return c.json({
    plans: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      price_monthly: p.priceMonthly,
      session_limit: p.sessionLimit === Infinity ? "unlimited" : p.sessionLimit,
      features: p.features,
    })),
  });
});

/**
 * POST /v0/billing/checkout — Create a Stripe Checkout session
 */
billingRoute.post("/checkout", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = z
    .object({
      merchant_id: z.string().min(1),
      merchant_email: z.string().email(),
      plan: z.enum(["growth", "scale"]),
    })
    .safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  try {
    const { url, sessionId } = await createCheckoutSession({
      merchantId: parsed.data.merchant_id,
      merchantEmail: parsed.data.merchant_email,
      planId: parsed.data.plan,
    });

    return c.json({ checkout_url: url, session_id: sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "checkout_failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /v0/billing/portal — Create a Stripe Billing Portal session
 */
billingRoute.post("/portal", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.stripe_customer_id) {
    return c.json({ error: "stripe_customer_id required" }, 400);
  }

  try {
    const { url } = await createPortalSession(body.stripe_customer_id);
    return c.json({ portal_url: url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "portal_failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /v0/billing/usage/:merchantId — Get current usage and limit status
 */
billingRoute.get("/usage/:merchantId", async (c) => {
  const merchantId = c.req.param("merchantId");
  const planId = c.req.query("plan") || "free";

  let sessionCount = 0;

  if (sql) {
    try {
      const db = sql;
      const [row] = await db`
        SELECT COUNT(*)::int as count
        FROM consent_events ce
        JOIN merchants m ON m.id = ce.merchant_id
        WHERE m.external_id = ${merchantId}
          AND ce.created_at > date_trunc('month', now())
      `;
      sessionCount = (row as any)?.count || 0;
    } catch {
      // DB unavailable
    }
  }

  const { over, limit, overage } = isOverLimit(sessionCount, planId);
  const plan = getPlan(planId);

  return c.json({
    merchant_id: merchantId,
    plan: planId,
    session_count: sessionCount,
    session_limit: limit,
    over_limit: over,
    overage_sessions: overage,
    overage_cost: over ? overage * 0.005 : 0,
    plan_details: plan
      ? {
          name: plan.name,
          price_monthly: plan.priceMonthly,
          features: plan.features,
        }
      : null,
  });
});

/**
 * POST /v0/billing/webhooks — Handle Stripe billing webhooks
 */
billingRoute.post("/webhooks", async (c) => {
  const rawBody = await c.req.text();
  const event = JSON.parse(rawBody) as {
    type: string;
    data: { object: Record<string, any> };
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const merchantId = session.metadata?.attest_merchant_id;
      const planId = session.metadata?.attest_plan;

      if (merchantId && planId && sql) {
        // Update merchant's plan in the database
        try {
          const db = sql;
          await db`
            UPDATE merchants
            SET settings = settings || ${JSON.stringify({ plan: planId, stripe_customer_id: session.customer })}::jsonb,
                updated_at = now()
            WHERE external_id = ${merchantId}
          `;
        } catch {
          console.error(`Failed to update plan for ${merchantId}`);
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const merchantId = subscription.metadata?.attest_merchant_id;

      if (merchantId && sql) {
        try {
          const db = sql;
          await db`
            UPDATE merchants
            SET settings = settings || '{"plan": "free"}'::jsonb,
                updated_at = now()
            WHERE external_id = ${merchantId}
          `;
        } catch {
          console.error(`Failed to downgrade ${merchantId}`);
        }
      }
      break;
    }
  }

  return c.json({ received: true });
});
