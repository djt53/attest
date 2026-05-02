import type { Context, Next } from "hono";
import { detectAgent, type DetectionResult } from "../services/detection.js";
import { verifyAndResolve, type PipelineResult } from "../services/pipeline.js";

export interface ChallengeConfig {
  /** Merchant identifier (used as the realm in the challenge) */
  realm: string;
  /** Benefits to advertise in the challenge header */
  benefits: string[];
  /** Attest verification API URL */
  verifyUrl?: string;
  /** Discovery endpoint URL (merchant's .well-known/attest.json) */
  discoveryUrl?: string;
  /** Whether to run detection heuristics (default: true) */
  detect?: boolean;
  /** Whether to send challenge headers (default: true) */
  challenge?: boolean;
  /** Whether to verify attestation tokens if present (default: true) */
  verify?: boolean;
}

const DEFAULT_BENEFITS = [
  "loyalty_pricing",
  "real_time_inventory",
  "skip_captcha",
  "full_catalog",
  "relaxed_rate_limit",
  "personalization",
];

/**
 * Challenge middleware for merchant applications.
 *
 * 1. Detects whether the request is from an agent
 * 2. If agent detected and attestation header present: verifies it
 * 3. If agent detected and no attestation: sends WWW-Attest challenge
 * 4. Sets context variables for downstream handlers
 *
 * Context variables set:
 * - `attest_detection`: DetectionResult
 * - `attest_verification`: PipelineResult (if attestation was verified)
 * - `attest_tier`: "verified" | "detected" | "unknown"
 */
export function challengeMiddleware(config: ChallengeConfig) {
  const benefits = config.benefits || DEFAULT_BENEFITS;
  const verifyUrl = config.verifyUrl || "https://api.attest.dev/v0/verify";
  const shouldDetect = config.detect !== false;
  const shouldChallenge = config.challenge !== false;
  const shouldVerify = config.verify !== false;

  // Pre-build the challenge header value
  const challengeHeader = buildChallengeHeader(
    config.realm,
    benefits,
    verifyUrl,
    config.discoveryUrl
  );

  return async (c: Context, next: Next) => {
    // Step 1: Check for attestation header first
    const attestationToken = c.req.header("Agent-Attestation");

    if (attestationToken && shouldVerify) {
      // Has attestation — verify it
      const result = await verifyAndResolve(attestationToken, config.realm);

      c.set("attest_detection", {
        isAgent: true,
        confidence: "high",
        signals: ["attestation_header"],
      } as DetectionResult);
      c.set("attest_verification", result);
      c.set("attest_tier", result.valid ? "verified" : "detected");

      // Still send challenge on failed verification (agent can retry)
      if (!result.valid && shouldChallenge) {
        c.header("WWW-Attest", challengeHeader);
      }

      return next();
    }

    // Step 2: Detect agent
    if (shouldDetect) {
      const headers: Record<string, string | undefined> = {};
      for (const key of [
        "user-agent",
        "x-forwarded-for",
        "accept-language",
        "sec-fetch-dest",
        "sec-ch-ua",
        "x-automation",
        "x-agent-id",
      ]) {
        headers[key] = c.req.header(key);
      }

      const detection = detectAgent(headers);
      c.set("attest_detection", detection);
      c.set("attest_tier", detection.isAgent ? "detected" : "unknown");

      // Step 3: Send challenge if agent detected
      if (detection.isAgent && shouldChallenge) {
        c.header("WWW-Attest", challengeHeader);
      }
    } else {
      c.set("attest_detection", {
        isAgent: false,
        confidence: "none",
        signals: [],
      } as DetectionResult);
      c.set("attest_tier", "unknown");
    }

    return next();
  };
}

function buildChallengeHeader(
  realm: string,
  benefits: string[],
  verifyUrl: string,
  discoveryUrl?: string
): string {
  const parts = [
    `realm="${realm}"`,
    `version="0"`,
    `benefits="${benefits.join(" ")}"`,
    `verify_url="${verifyUrl}"`,
  ];

  if (discoveryUrl) {
    parts.push(`discovery_url="${discoveryUrl}"`);
  }

  return parts.join(", ");
}
