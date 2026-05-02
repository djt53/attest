import { Hono } from "hono";
import { findMerchantByExternalId } from "../db/merchants.js";
import {
  getTrafficSummary,
  getTrafficByDay,
  getTopAgents,
  getScopeBreakdown,
} from "../db/analytics.js";

export const analyticsRoute = new Hono();

/**
 * GET /v0/merchants/:externalId/analytics
 * Returns traffic summary, daily breakdown, top agents, and scope usage.
 */
analyticsRoute.get("/:externalId/analytics", async (c) => {
  const merchant = await findMerchantByExternalId(c.req.param("externalId"));
  if (!merchant) return c.json({ error: "merchant_not_found" }, 404);

  const days = parseInt(c.req.query("days") ?? "30");

  const [summary, daily, topAgents, scopes] = await Promise.all([
    getTrafficSummary(merchant.id, days),
    getTrafficByDay(merchant.id, days),
    getTopAgents(merchant.id),
    getScopeBreakdown(merchant.id, days),
  ]);

  return c.json({
    period_days: days,
    summary,
    daily,
    top_agents: topAgents,
    scope_breakdown: scopes,
  });
});

/**
 * GET /v0/merchants/:externalId/analytics/summary
 * Returns just the traffic summary (lighter endpoint for dashboard widgets).
 */
analyticsRoute.get("/:externalId/analytics/summary", async (c) => {
  const merchant = await findMerchantByExternalId(c.req.param("externalId"));
  if (!merchant) return c.json({ error: "merchant_not_found" }, 404);

  const days = parseInt(c.req.query("days") ?? "30");
  const summary = await getTrafficSummary(merchant.id, days);

  return c.json(summary);
});
