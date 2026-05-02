import { Hono } from "hono";
import { z } from "zod";
import {
  createMagicLinkToken,
  verifyMagicLinkToken,
  validateSession,
  invalidateSession,
  getMagicLinkUrl,
} from "../services/magic-link.js";
import { sendMagicLinkEmail } from "../services/email.js";

export const authRoute = new Hono();

const SendMagicLinkRequest = z.object({
  email: z.string().email(),
  human_principal_id: z.string().min(1),
});

/**
 * POST /v0/auth/magic-link — Send a magic link to a user's email
 */
authRoute.post("/magic-link", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid_request_body" }, 400);

  const parsed = SendMagicLinkRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const token = createMagicLinkToken(
    parsed.data.email,
    parsed.data.human_principal_id
  );

  const magicLink = getMagicLinkUrl(
    token,
    process.env.CONSENT_PORTAL_URL || "http://localhost:3001"
  );

  // Send the magic link email
  await sendMagicLinkEmail(parsed.data.email, magicLink);

  return c.json({
    sent: true,
    // Only include link in dev mode
    ...(process.env.NODE_ENV !== "production" && { magic_link: magicLink }),
  });
});

/**
 * POST /v0/auth/verify — Verify a magic link token and create a session
 */
authRoute.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.token) return c.json({ error: "missing_token" }, 400);

  const result = verifyMagicLinkToken(body.token);
  if (!result) {
    return c.json({ error: "invalid_or_expired_token" }, 401);
  }

  return c.json({
    session_token: result.sessionToken,
    email: result.email,
    human_principal_id: result.humanPrincipalId,
  });
});

/**
 * GET /v0/auth/session — Validate a session token
 */
authRoute.get("/session", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "missing_session_token" }, 401);
  }

  const sessionToken = authHeader.slice(7);
  const session = validateSession(sessionToken);

  if (!session) {
    return c.json({ error: "invalid_session" }, 401);
  }

  return c.json(session);
});

/**
 * POST /v0/auth/logout — Invalidate a session
 */
authRoute.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    invalidateSession(authHeader.slice(7));
  }
  return c.json({ ok: true });
});
