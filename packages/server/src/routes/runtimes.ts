import { Hono } from "hono";
import { z } from "zod";
import { registerRuntime } from "../services/jwks.js";

export const runtimesRoute = new Hono();

const RegisterRequest = z.object({
  issuer: z.string().min(1),
  jwks_url: z.string().url(),
  name: z.string().min(1),
  contact_email: z.string().email(),
});

// POST /v0/runtimes — register a new agent runtime
runtimesRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: "invalid_request_body" }, 400);
  }

  const parsed = RegisterRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  // TODO: Persist to database, validate JWKS URL is reachable
  registerRuntime(parsed.data.issuer, parsed.data.jwks_url);

  return c.json({
    registered: true,
    issuer: parsed.data.issuer,
  }, 201);
});
