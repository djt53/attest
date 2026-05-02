import type { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 60_000);

interface RateLimitOptions {
  /** Maximum requests per window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Function to extract the rate limit key from the request */
  keyFn?: (c: Context) => string;
}

export function rateLimit(options: RateLimitOptions) {
  const { max, windowMs, keyFn } = options;

  return async (c: Context, next: Next) => {
    const key = keyFn
      ? keyFn(c)
      : c.get("merchant_id") || c.req.header("x-forwarded-for") || "global";

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    c.header("X-RateLimit-Limit", max.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, max - entry.count).toString());
    c.header("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000).toString());

    if (entry.count > max) {
      c.header("Retry-After", Math.ceil((entry.resetAt - now) / 1000).toString());
      return c.json({ error: "rate_limit_exceeded" }, 429);
    }

    return next();
  };
}
