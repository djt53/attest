import { Hono } from "hono";
import {
  findActiveGrantsForHuman,
  findConsentEventsByHuman,
  revokeConsentGrant,
} from "../db/consent.js";

export const consentRoute = new Hono();

// GET /v0/consent/:humanId/grants — list active consent grants for a human
consentRoute.get("/:humanId/grants", async (c) => {
  const grants = await findActiveGrantsForHuman(c.req.param("humanId"));
  return c.json({ grants });
});

// GET /v0/consent/:humanId/events — list consent events for a human
consentRoute.get("/:humanId/events", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50");
  const events = await findConsentEventsByHuman(c.req.param("humanId"), limit);
  return c.json({ events });
});

// POST /v0/consent/grants/:grantId/revoke — revoke a consent grant
consentRoute.post("/grants/:grantId/revoke", async (c) => {
  await revokeConsentGrant(c.req.param("grantId"));
  return c.json({ revoked: true });
});
