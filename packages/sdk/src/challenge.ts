/**
 * Challenge Handler for Agent Runtimes
 *
 * Automatically detects and responds to WWW-Attest challenges from merchants.
 * Agent runtimes integrate this to give their agents elevated access at
 * Attest-enabled merchants.
 *
 * Usage:
 * ```ts
 * import { AttestClient } from "@attest/sdk";
 * import { ChallengeHandler } from "@attest/sdk/challenge";
 *
 * const client = new AttestClient({ issuer: "my-runtime", privateKey });
 *
 * const handler = new ChallengeHandler({
 *   client,
 *   agentId: "shopping-agent",
 *   humanPrincipal: { id: "user_123", email: "alice@example.com" },
 *   defaultScope: ["browse", "purchase<=500"],
 * });
 *
 * // Wrap fetch — automatically handles challenges
 * const response = await handler.fetch("https://cool-store.com/products");
 *
 * // Or manually check and respond
 * const challenge = ChallengeHandler.parseChallenge(response.headers);
 * if (challenge) {
 *   const token = await handler.respondToChallenge(challenge);
 *   // Retry with attestation
 * }
 * ```
 */

import { AttestClient } from "./client.js";

export interface ChallengeHandlerOptions {
  /** AttestClient for signing attestations */
  client: AttestClient;
  /** Agent identifier */
  agentId: string;
  /** The human this agent acts for */
  humanPrincipal: {
    id: string;
    email?: string;
  };
  /** Default scope to request (can be overridden per-challenge) */
  defaultScope: string[];
  /** Maximum token TTL in seconds (default: 300) */
  defaultTtl?: number;
  /** Whether to auto-retry with attestation when a challenge is received (default: true) */
  autoRetry?: boolean;
  /** Cache attestation tokens per realm to avoid re-signing (default: true) */
  cacheTokens?: boolean;
}

export interface ParsedChallenge {
  realm: string;
  version: string;
  benefits: string[];
  verifyUrl?: string;
  discoveryUrl?: string;
}

// Cache of attestation tokens by realm
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export class ChallengeHandler {
  private options: ChallengeHandlerOptions;

  constructor(options: ChallengeHandlerOptions) {
    this.options = options;
  }

  /**
   * Parse a WWW-Attest challenge header.
   * Returns null if no valid challenge is present.
   */
  static parseChallenge(
    headers: Headers | Record<string, string>
  ): ParsedChallenge | null {
    const headerValue =
      headers instanceof Headers
        ? headers.get("WWW-Attest") || headers.get("www-attest")
        : headers["WWW-Attest"] || headers["www-attest"];

    if (!headerValue) return null;

    // Parse key="value" pairs
    const params: Record<string, string> = {};
    const regex = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = regex.exec(headerValue)) !== null) {
      params[match[1]] = match[2];
    }

    if (!params.realm || !params.version) return null;

    return {
      realm: params.realm,
      version: params.version,
      benefits: (params.benefits || "").split(/\s+/).filter(Boolean),
      verifyUrl: params.verify_url,
      discoveryUrl: params.discovery_url,
    };
  }

  /**
   * Create an attestation token in response to a challenge.
   */
  async respondToChallenge(
    challenge: ParsedChallenge,
    scope?: string[]
  ): Promise<string> {
    // Check cache
    if (this.options.cacheTokens !== false) {
      const cached = tokenCache.get(challenge.realm);
      if (cached && cached.expiresAt > Date.now() + 30_000) {
        return cached.token;
      }
    }

    const result = await this.options.client.attest({
      agentId: this.options.agentId,
      humanPrincipal: this.options.humanPrincipal,
      scope: scope || this.options.defaultScope,
      audience: challenge.realm,
      ttl: this.options.defaultTtl || 300,
    });

    // Cache the token
    if (this.options.cacheTokens !== false) {
      tokenCache.set(challenge.realm, {
        token: result.token,
        expiresAt: result.expiresAt.getTime(),
      });
    }

    return result.token;
  }

  /**
   * Enhanced fetch that auto-handles WWW-Attest challenges.
   *
   * 1. Makes the initial request
   * 2. If response contains WWW-Attest header, creates attestation
   * 3. Retries the request with the Agent-Attestation header
   * 4. Returns the (possibly upgraded) response
   */
  async fetch(
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    // Check if we already have a cached token for this domain
    const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    const cached = tokenCache.get(url.hostname);

    if (cached && cached.expiresAt > Date.now() + 30_000) {
      // Use cached token on first request
      const headers = new Headers(init?.headers);
      headers.set("Agent-Attestation", cached.token);
      return globalThis.fetch(input, { ...init, headers });
    }

    // Make initial request
    const response = await globalThis.fetch(input, init);

    // Check for challenge
    const challenge = ChallengeHandler.parseChallenge(response.headers);
    if (!challenge || this.options.autoRetry === false) {
      return response;
    }

    // Respond to challenge
    const token = await this.respondToChallenge(challenge);

    // Retry with attestation
    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set("Agent-Attestation", token);

    return globalThis.fetch(input, { ...init, headers: retryHeaders });
  }

  /**
   * Discover attestation support at a merchant domain.
   * Fetches the .well-known/attest.json endpoint.
   */
  static async discover(
    domain: string
  ): Promise<{
    supported: boolean;
    realm?: string;
    benefits?: Record<string, { description: string; scope_required?: string[] }>;
    verifyUrl?: string;
  }> {
    try {
      const response = await globalThis.fetch(
        `https://${domain}/.well-known/attest.json`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) return { supported: false };

      const data = await response.json();
      return {
        supported: true,
        realm: data.realm,
        benefits: data.benefits,
        verifyUrl: data.verify_url,
      };
    } catch {
      return { supported: false };
    }
  }

  /** Clear the token cache (useful for testing) */
  static clearCache() {
    tokenCache.clear();
  }
}
