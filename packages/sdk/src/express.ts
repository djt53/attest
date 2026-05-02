/**
 * Unified Attest middleware for Express/Connect applications.
 *
 * Single import that handles the entire flow:
 * 1. Detects whether the request is from an agent
 * 2. If agent detected: sends WWW-Attest challenge header with benefits
 * 3. If attestation present: verifies it and resolves identity
 * 4. Applies tiered benefits based on verification status
 *
 * Usage:
 * ```ts
 * import { attest } from "@attest/sdk/express";
 *
 * app.use(attest({
 *   apiKey: "att_live_...",
 *   merchantId: "cool-store.com",
 *   benefits: ["loyalty_pricing", "real_time_inventory", "skip_captcha"],
 * }));
 *
 * app.get("/products", (req, res) => {
 *   if (req.attest.isAgent) {
 *     console.log("Agent detected:", req.attest.runtime);
 *   }
 *   if (req.attest.verified) {
 *     console.log("Verified customer:", req.attest.customer);
 *     // Apply loyalty pricing from req.attest.benefits.loyaltyPricing
 *   }
 * });
 * ```
 */

// Re-export detection types
export type { DetectorOptions, AgentDetectionResult } from "./browser.js";

export interface AttestOptions {
  /** Attest API key */
  apiKey: string;
  /** Merchant identifier (domain) — used as the realm in challenges */
  merchantId: string;
  /** Attest API URL (default: https://api.attest.dev) */
  apiUrl?: string;
  /** Benefits to advertise in challenges */
  benefits?: string[];
  /** Whether to send WWW-Attest challenge headers (default: true) */
  challenge?: boolean;
  /** URL for the .well-known/attest.json discovery endpoint */
  discoveryUrl?: string;
  /** Benefit tier configuration */
  tiers?: {
    verified?: Partial<BenefitTier>;
    detected?: Partial<BenefitTier>;
    unknown?: Partial<BenefitTier>;
  };
}

export interface BenefitTier {
  rateLimit: number;
  loyaltyPricing: boolean;
  realTimeInventory: boolean;
  skipCaptcha: boolean;
  fullCatalog: boolean;
  personalization: boolean;
  cacheTtl: number;
}

export interface AttestRequestContext {
  /** Whether an agent was detected */
  isAgent: boolean;
  /** Detection confidence */
  confidence: "high" | "medium" | "low" | "none";
  /** Detected runtime (e.g., "anthropic", "openai") */
  runtime: string | null;
  /** Detection signals */
  signals: string[];
  /** Whether the agent provided a valid attestation */
  verified: boolean;
  /** The access tier applied */
  tier: "verified" | "detected" | "unknown";
  /** Benefit configuration for this tier */
  benefits: BenefitTier;
  /** Attestation details (if verified) */
  attestation: {
    runtime: string;
    agent: string;
    human: { id: string; email?: string };
    scope: string[];
    expiresAt: string;
  } | null;
  /** Resolved customer (if matched) */
  customer: {
    matched: boolean;
    customerId?: string;
    customerName?: string;
    customerTier?: string;
    matchMethod?: string;
  } | null;
  /** Policy action applied */
  policyAction: string | null;
  /** Consent ledger entry ID */
  consentId: string | null;
}

// Default benefits per tier
const DEFAULT_TIERS = {
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
    cacheTtl: 900,
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

const DEFAULT_BENEFITS = [
  "loyalty_pricing",
  "real_time_inventory",
  "skip_captcha",
  "full_catalog",
  "relaxed_rate_limit",
  "personalization",
];

// Known agent user-agent patterns (inline to avoid cross-package dependency)
const AGENT_PATTERNS: Array<{ pattern: RegExp; runtime: string }> = [
  { pattern: /claude/i, runtime: "anthropic" },
  { pattern: /anthropic/i, runtime: "anthropic" },
  { pattern: /ChatGPT/i, runtime: "openai" },
  { pattern: /GPTBot/i, runtime: "openai" },
  { pattern: /OAI-SearchBot/i, runtime: "openai" },
  { pattern: /OpenAI/i, runtime: "openai" },
  { pattern: /Google-Extended/i, runtime: "google" },
  { pattern: /PerplexityBot/i, runtime: "perplexity" },
  { pattern: /Bytespider/i, runtime: "bytedance" },
  { pattern: /cohere/i, runtime: "cohere" },
  { pattern: /AutoGPT/i, runtime: "autogpt" },
  { pattern: /LangChain/i, runtime: "langchain" },
  { pattern: /CrewAI/i, runtime: "crewai" },
  { pattern: /HeadlessChrome/i, runtime: "headless" },
  { pattern: /Playwright/i, runtime: "automation" },
  { pattern: /Puppeteer/i, runtime: "automation" },
];

function detectFromHeaders(headers: Record<string, string | undefined>): {
  isAgent: boolean;
  confidence: "high" | "medium" | "low" | "none";
  runtime: string | null;
  signals: string[];
} {
  const signals: string[] = [];
  let confidence: "high" | "medium" | "low" | "none" = "none";
  let runtime: string | null = null;

  if (headers["agent-attestation"]) {
    return { isAgent: true, confidence: "high", runtime: null, signals: ["attestation_header"] };
  }

  const ua = headers["user-agent"] || "";
  for (const { pattern, runtime: rt } of AGENT_PATTERNS) {
    if (pattern.test(ua)) {
      signals.push(`ua:${rt}`);
      if (!runtime || runtime === "unknown") runtime = rt;
      confidence = "high";
    }
  }

  if (!headers["accept-language"]) {
    signals.push("missing_accept_language");
    if (confidence === "none") confidence = "low";
  }

  if (!headers["sec-fetch-dest"] && !headers["sec-ch-ua"]) {
    signals.push("missing_sec_headers");
    if (confidence === "none") confidence = "low";
  }

  if (signals.length >= 3 && confidence === "low") confidence = "medium";

  return { isAgent: confidence !== "none", confidence, runtime, signals };
}

/**
 * Create the unified Attest middleware for Express/Connect.
 *
 * Handles detection, challenges, verification, and benefits in one middleware.
 * Sets `req.attest` with the full context for downstream handlers.
 */
export function attest(options: AttestOptions) {
  const apiUrl = options.apiUrl || "https://api.attest.dev";
  const benefits = options.benefits || DEFAULT_BENEFITS;
  const shouldChallenge = options.challenge !== false;

  const tiers = {
    verified: { ...DEFAULT_TIERS.verified, ...options.tiers?.verified },
    detected: { ...DEFAULT_TIERS.detected, ...options.tiers?.detected },
    unknown: { ...DEFAULT_TIERS.unknown, ...options.tiers?.unknown },
  };

  // Pre-build challenge header
  const challengeHeader = [
    `realm="${options.merchantId}"`,
    `version="0"`,
    `benefits="${benefits.join(" ")}"`,
    `verify_url="${apiUrl}/v0/verify"`,
    options.discoveryUrl && `discovery_url="${options.discoveryUrl}"`,
  ]
    .filter(Boolean)
    .join(", ");

  return async function attestMiddleware(
    req: any,
    res: any,
    next: () => void
  ) {
    // Step 1: Detect
    const headers: Record<string, string | undefined> = {
      "user-agent": req.headers?.["user-agent"],
      "accept-language": req.headers?.["accept-language"],
      "sec-fetch-dest": req.headers?.["sec-fetch-dest"],
      "sec-ch-ua": req.headers?.["sec-ch-ua"],
      "agent-attestation": req.headers?.["agent-attestation"],
    };

    const detection = detectFromHeaders(headers);
    const attestationToken = req.headers?.["agent-attestation"];

    // Initialize context
    const ctx: AttestRequestContext = {
      isAgent: detection.isAgent,
      confidence: detection.confidence,
      runtime: detection.runtime,
      signals: detection.signals,
      verified: false,
      tier: detection.isAgent ? "detected" : "unknown",
      benefits: detection.isAgent ? tiers.detected : tiers.unknown,
      attestation: null,
      customer: null,
      policyAction: null,
      consentId: null,
    };

    // Step 2: Verify attestation if present
    if (attestationToken) {
      try {
        const response = await fetch(`${apiUrl}/v0/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            token: attestationToken,
            merchant_id: options.merchantId,
          }),
          signal: AbortSignal.timeout(5000),
        });

        const result = await response.json();

        if (result.valid) {
          ctx.verified = true;
          ctx.tier = "verified";
          ctx.benefits = tiers.verified;
          ctx.policyAction = result.policy_action || null;
          ctx.consentId = result.consent_id || null;

          if (result.attestation) {
            ctx.attestation = {
              runtime: result.attestation.runtime,
              agent: result.attestation.agent,
              human: result.attestation.human,
              scope: result.attestation.scope,
              expiresAt: result.attestation.expires_at,
            };
            ctx.runtime = result.attestation.runtime;
          }

          if (result.resolution) {
            ctx.customer = {
              matched: result.resolution.matched,
              customerId: result.resolution.external_customer_id,
              customerName: result.resolution.customer_name,
              customerTier: result.resolution.customer_tier,
              matchMethod: result.resolution.match_method,
            };
          }
        }
      } catch {
        // Verification unavailable — continue with detection-only
      }
    }

    // Step 3: Set challenge header if agent detected and not verified
    if (ctx.isAgent && !ctx.verified && shouldChallenge) {
      res.setHeader("WWW-Attest", challengeHeader);
    }

    // Step 4: Set tier header
    res.setHeader("X-Attest-Tier", ctx.tier);
    if (ctx.customer?.matched) {
      res.setHeader("X-Attest-Customer", "matched");
    }

    // Attach to request
    req.attest = ctx;

    next();
  };
}

/**
 * Helper to generate the .well-known/attest.json content for a merchant.
 */
export function generateDiscoveryDocument(options: {
  merchantId: string;
  apiUrl?: string;
  benefits?: string[];
  contact?: string;
}): object {
  const apiUrl = options.apiUrl || "https://api.attest.dev";
  const benefitList = options.benefits || DEFAULT_BENEFITS;

  const benefitDetails: Record<string, { description: string; scope_required: string[] }> = {};
  const descriptions: Record<string, string> = {
    loyalty_pricing: "Customer's loyalty tier pricing applied",
    real_time_inventory: "Live inventory data instead of cached",
    skip_captcha: "No CAPTCHA or bot challenges",
    full_catalog: "Access to member-only and restricted products",
    relaxed_rate_limit: "Higher request rate allowance",
    personalization: "Recommendations based on purchase history",
    express_checkout: "Streamlined checkout without step-up auth",
    saved_cart: "Pre-loaded cart with saved items",
  };

  for (const benefit of benefitList) {
    benefitDetails[benefit] = {
      description: descriptions[benefit] || benefit,
      scope_required: benefit.includes("checkout") || benefit.includes("purchase")
        ? ["purchase"]
        : ["browse"],
    };
  }

  return {
    version: "0",
    realm: options.merchantId,
    verify_url: `${apiUrl}/v0/verify`,
    benefits: benefitDetails,
    supported_runtimes: ["*"],
    max_ttl: 3600,
    spec_url: "https://github.com/djt53/attest/blob/main/packages/spec/challenge-v0.md",
    ...(options.contact && { contact: options.contact }),
  };
}
