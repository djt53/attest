import type { Context, Next } from "hono";
import type { PipelineResult } from "../services/pipeline.js";

export interface BenefitTiers {
  /** Benefits for verified (attested) agents */
  verified: BenefitConfig;
  /** Benefits for detected but unattested agents */
  detected: BenefitConfig;
  /** Benefits for unknown/human traffic */
  unknown: BenefitConfig;
}

export interface BenefitConfig {
  /** Rate limit (requests per minute) */
  rateLimit: number;
  /** Whether to apply loyalty/tier pricing */
  loyaltyPricing: boolean;
  /** Whether to serve real-time inventory */
  realTimeInventory: boolean;
  /** Whether to skip CAPTCHA challenges */
  skipCaptcha: boolean;
  /** Whether to show full catalog including member-only items */
  fullCatalog: boolean;
  /** Whether to personalize results from customer history */
  personalization: boolean;
  /** Cache TTL in seconds for product data */
  cacheTtl: number;
}

const DEFAULT_TIERS: BenefitTiers = {
  verified: {
    rateLimit: 600,
    loyaltyPricing: true,
    realTimeInventory: true,
    skipCaptcha: true,
    fullCatalog: true,
    personalization: true,
    cacheTtl: 0,
  },
  detected: {
    rateLimit: 60,
    loyaltyPricing: false,
    realTimeInventory: false,
    skipCaptcha: false,
    fullCatalog: false,
    personalization: false,
    cacheTtl: 900, // 15 min cache
  },
  unknown: {
    rateLimit: 120,
    loyaltyPricing: true,
    realTimeInventory: true,
    skipCaptcha: true,
    fullCatalog: true,
    personalization: true,
    cacheTtl: 0,
  },
};

/**
 * Benefit enforcement middleware.
 *
 * Reads the `attest_tier` set by the challenge middleware and applies
 * the corresponding benefit configuration. Downstream handlers read
 * `attest_benefits` to adjust their behavior.
 *
 * Also sets `X-Attest-Tier` response header so agents can see their status.
 */
export function benefitMiddleware(tiers?: Partial<BenefitTiers>) {
  const config: BenefitTiers = {
    verified: { ...DEFAULT_TIERS.verified, ...tiers?.verified },
    detected: { ...DEFAULT_TIERS.detected, ...tiers?.detected },
    unknown: { ...DEFAULT_TIERS.unknown, ...tiers?.unknown },
  };

  return async (c: Context, next: Next) => {
    const tier = (c.get("attest_tier") as string) || "unknown";
    const benefits =
      tier === "verified"
        ? config.verified
        : tier === "detected"
          ? config.detected
          : config.unknown;

    c.set("attest_benefits", benefits);

    // Tell the agent what tier they're on
    c.header("X-Attest-Tier", tier);

    // If verified and customer was resolved, include customer info in header
    if (tier === "verified") {
      const verification = c.get("attest_verification") as
        | PipelineResult
        | undefined;
      if (verification?.resolution?.matched) {
        c.header("X-Attest-Customer", "matched");
      }
    }

    return next();
  };
}

/**
 * Helper to read benefit config in route handlers.
 */
export function getBenefits(c: Context): BenefitConfig {
  return (
    (c.get("attest_benefits") as BenefitConfig) || DEFAULT_TIERS.unknown
  );
}
