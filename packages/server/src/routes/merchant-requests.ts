import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/connection.js";

export const merchantRequestsRoute = new Hono();

const RequestSchema = z.object({
  merchant_domain: z.string().min(1),
  requested_by: z.string().min(1),
  reason: z.string().optional(),
  source: z.string().optional(),
});

/**
 * POST /v0/merchant-requests — Agent-driven merchant recruitment
 *
 * When an agent discovers a merchant doesn't support Attest,
 * it can submit a request for the merchant to be contacted.
 * This creates demand signal that we can use for outreach.
 */
merchantRequestsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const { merchant_domain, requested_by, reason, source } = parsed.data;

  // Store in database if available
  if (sql) {
    try {
      const db = sql;
      await db`
        INSERT INTO merchant_requests (merchant_domain, requested_by, reason, source)
        VALUES (${merchant_domain}, ${requested_by}, ${reason || ""}, ${source || ""})
        ON CONFLICT (merchant_domain, requested_by) DO UPDATE SET
          request_count = merchant_requests.request_count + 1,
          last_requested_at = now()
      `;
    } catch {
      // Table might not exist yet — log and continue
      console.log(
        `Merchant request: ${merchant_domain} from ${requested_by} (${source})`
      );
    }
  } else {
    // No DB — just log it
    console.log(
      `Merchant request: ${merchant_domain} from ${requested_by} (${source}): ${reason}`
    );
  }

  return c.json({
    received: true,
    merchant_domain,
    message: "Request recorded. We'll reach out to this merchant.",
  });
});

/**
 * GET /v0/merchant-requests/stats — Get demand signal stats
 * Shows which merchants have the most agent-driven requests.
 */
merchantRequestsRoute.get("/stats", async (c) => {
  if (!sql) {
    return c.json({ error: "database_required" }, 503);
  }

  try {
    const db = sql;
    const rows = await db`
      SELECT
        merchant_domain,
        COUNT(DISTINCT requested_by)::int as unique_requesters,
        SUM(request_count)::int as total_requests,
        MAX(last_requested_at) as last_requested
      FROM merchant_requests
      GROUP BY merchant_domain
      ORDER BY total_requests DESC
      LIMIT 50
    `;

    return c.json({ merchants: rows });
  } catch {
    return c.json({ merchants: [] });
  }
});
