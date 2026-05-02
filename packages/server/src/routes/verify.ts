import { Hono } from "hono";
import { z } from "zod";
import { verifyAndResolve } from "../services/pipeline.js";

export const verifyRoute = new Hono();

const VerifyRequest = z.object({
  token: z.string().min(1),
  merchant_id: z.string().min(1),
});

// POST /v0/verify — full verification pipeline (JWT + resolution + policy + consent)
verifyRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ valid: false, error: "invalid_request_body" }, 400);
  }

  const parsed = VerifyRequest.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { valid: false, error: parsed.error.issues[0]?.message },
      400
    );
  }

  const result = await verifyAndResolve(parsed.data.token, parsed.data.merchant_id);
  return c.json(result, result.valid ? 200 : 401);
});

// GET /v0/verify — verify from attestation header (for SDK/middleware use)
verifyRoute.get("/", async (c) => {
  const attestationHeader = c.req.header("Agent-Attestation");
  const merchantId = c.req.query("merchant_id");

  if (!attestationHeader) {
    return c.json({ valid: false, error: "missing_attestation_header" }, 400);
  }
  if (!merchantId) {
    return c.json({ valid: false, error: "missing_merchant_id" }, 400);
  }

  const result = await verifyAndResolve(attestationHeader, merchantId);
  return c.json(result, result.valid ? 200 : 401);
});
