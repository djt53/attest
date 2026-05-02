import type { Context, Next } from "hono";
import { validateApiKey } from "../db/api-keys.js";
import { sql } from "../db/connection.js";

/**
 * API key authentication middleware.
 * Extracts the key from the Authorization header (Bearer token).
 * Sets `merchant_id` and `scopes` on the context for downstream use.
 *
 * When no database is configured, authentication is skipped (dev mode).
 */
export async function apiKeyAuth(c: Context, next: Next) {
  // Skip auth when no database is configured (local dev)
  if (!sql) {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer att_")) {
    return c.json({ error: "missing_api_key" }, 401);
  }

  const key = authHeader.slice(7); // Remove "Bearer "
  const result = await validateApiKey(key);

  if (!result.valid) {
    return c.json({ error: "invalid_api_key" }, 401);
  }

  c.set("merchant_id", result.merchant_id);
  c.set("api_key_scopes", result.scopes);

  return next();
}

/**
 * Scope check middleware factory.
 * Ensures the API key has the required scope.
 */
export function requireScope(scope: string) {
  return async (c: Context, next: Next) => {
    if (!sql) return next(); // Skip in dev mode

    const scopes = c.get("api_key_scopes") as string[] | undefined;
    if (!scopes?.includes(scope)) {
      return c.json({ error: "insufficient_scope", required: scope }, 403);
    }
    return next();
  };
}
