/**
 * Merchant-side middleware for verifying agent attestations.
 *
 * Usage with Express:
 * ```ts
 * import { createAttestMiddleware } from "@attest/sdk/middleware";
 *
 * const attest = createAttestMiddleware({
 *   apiKey: "att_live_...",
 *   merchantId: "my-store.myshopify.com",
 * });
 *
 * app.post("/checkout", attest, (req, res) => {
 *   if (req.attestation?.valid) {
 *     console.log("Agent:", req.attestation.agent);
 *     console.log("Customer:", req.attestation.resolution);
 *   }
 *   // proceed with checkout
 * });
 * ```
 */

export interface AttestMiddlewareOptions {
  /** Attest API key */
  apiKey: string;
  /** Merchant identifier (domain or ID) */
  merchantId: string;
  /** Attest API URL (default: https://api.attest.dev) */
  apiUrl?: string;
  /** If true, requests without attestation headers pass through (default: false) */
  optional?: boolean;
  /** Called when verification fails (default: continues with req.attestation.valid = false) */
  onFailure?: "block" | "continue";
}

export interface AttestationResult {
  valid: boolean;
  error?: string;
  runtime?: string;
  agent?: string;
  human?: { id: string; email?: string };
  scope?: string[];
  resolution?: {
    matched: boolean;
    customer_id?: string;
    external_customer_id?: string;
    customer_name?: string;
    customer_tier?: string;
  };
  policy_action?: string;
  consent_id?: string;
}

export function createAttestMiddleware(options: AttestMiddlewareOptions) {
  const apiUrl = options.apiUrl || "https://api.attest.dev";
  const onFailure = options.onFailure || "continue";

  return async function attestMiddleware(
    req: any,
    res: any,
    next: () => void
  ) {
    const token = req.headers?.["agent-attestation"];

    if (!token) {
      req.attestation = { valid: false, error: "no_attestation" };
      if (options.optional) return next();
      if (onFailure === "block") {
        return res.status(400).json({ error: "missing_attestation" });
      }
      return next();
    }

    try {
      const response = await fetch(`${apiUrl}/v0/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          token,
          merchant_id: options.merchantId,
        }),
        signal: AbortSignal.timeout(5000),
      });

      const result = await response.json();
      req.attestation = {
        valid: result.valid,
        error: result.error,
        runtime: result.attestation?.runtime,
        agent: result.attestation?.agent,
        human: result.attestation?.human,
        scope: result.attestation?.scope,
        resolution: result.resolution,
        policy_action: result.policy_action,
        consent_id: result.consent_id,
      } as AttestationResult;
    } catch {
      req.attestation = { valid: false, error: "verification_unavailable" };
    }

    if (!req.attestation.valid && onFailure === "block") {
      return res.status(401).json({
        error: "attestation_failed",
        detail: req.attestation.error,
      });
    }

    next();
  };
}

/**
 * Hono middleware variant.
 */
export function attestHonoMiddleware(options: AttestMiddlewareOptions) {
  const apiUrl = options.apiUrl || "https://api.attest.dev";

  return async function (c: any, next: () => Promise<void>) {
    const token = c.req.header("Agent-Attestation");

    if (!token) {
      c.set("attestation", { valid: false, error: "no_attestation" });
      if (options.optional) return next();
      if (options.onFailure === "block") {
        return c.json({ error: "missing_attestation" }, 400);
      }
      return next();
    }

    try {
      const response = await fetch(`${apiUrl}/v0/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          token,
          merchant_id: options.merchantId,
        }),
        signal: AbortSignal.timeout(5000),
      });

      const result = await response.json();
      c.set("attestation", result);
    } catch {
      c.set("attestation", { valid: false, error: "verification_unavailable" });
    }

    const att = c.get("attestation");
    if (!att.valid && options.onFailure === "block") {
      return c.json({ error: "attestation_failed", detail: att.error }, 401);
    }

    return next();
  };
}
