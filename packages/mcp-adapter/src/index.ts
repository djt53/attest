#!/usr/bin/env node

/**
 * Attest MCP Server
 *
 * Provides tools for Claude (or any MCP-compatible agent) to create
 * signed attestation tokens when acting on behalf of a human.
 *
 * Configuration via environment variables:
 *   ATTEST_ISSUER       — Runtime issuer identifier (default: "anthropic")
 *   ATTEST_PRIVATE_KEY  — ES256 private key in JWK JSON format
 *   ATTEST_KID          — Key ID for the signing key
 *
 * Or provide a key pair file:
 *   ATTEST_KEY_FILE     — Path to JSON file with { privateKey, publicJwk }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as jose from "jose";
import { z } from "zod";

const server = new McpServer({
  name: "attest",
  version: "0.1.0",
});

let privateKey: CryptoKey | null = null;
let kid: string | undefined;
const issuer = process.env.ATTEST_ISSUER || "anthropic";

async function ensureKey(): Promise<CryptoKey> {
  if (privateKey) return privateKey;

  // Try loading from env
  if (process.env.ATTEST_PRIVATE_KEY) {
    const jwk = JSON.parse(process.env.ATTEST_PRIVATE_KEY);
    privateKey = (await jose.importJWK(jwk, "ES256")) as CryptoKey;
    kid = process.env.ATTEST_KID || jwk.kid;
    return privateKey;
  }

  // Try loading from file
  if (process.env.ATTEST_KEY_FILE) {
    const fs = await import("fs/promises");
    const data = JSON.parse(
      await fs.readFile(process.env.ATTEST_KEY_FILE, "utf-8")
    );
    privateKey = (await jose.importJWK(data.privateKey, "ES256")) as CryptoKey;
    kid = data.privateKey.kid || process.env.ATTEST_KID;
    return privateKey;
  }

  // Generate an ephemeral key pair (dev mode)
  const keyPair = await jose.generateKeyPair("ES256");
  privateKey = keyPair.privateKey;
  kid = "ephemeral";
  console.error(
    "[attest-mcp] No key configured — using ephemeral key pair (dev mode)"
  );
  return privateKey;
}

// Tool: attest — create a signed attestation token
server.tool(
  "attest",
  "Create a signed agent attestation token for acting on behalf of a human at a merchant. Returns the JWT to include as an Agent-Attestation header.",
  {
    agent_id: z
      .string()
      .describe("Agent identifier (e.g., 'claude-shopping-agent')"),
    human_id: z
      .string()
      .describe("Human principal identifier"),
    human_email: z
      .string()
      .email()
      .optional()
      .describe("Human's email address for identity resolution"),
    scope: z
      .array(z.string())
      .describe("Requested permissions (e.g., ['browse', 'purchase<=500'])"),
    merchant: z
      .string()
      .describe("Target merchant identifier (domain or ID)"),
    ttl: z
      .number()
      .int()
      .min(60)
      .max(3600)
      .optional()
      .describe("Token TTL in seconds (default: 300, max: 3600)"),
  },
  async ({ agent_id, human_id, human_email, scope, merchant, ttl }) => {
    const key = await ensureKey();
    const now = Math.floor(Date.now() / 1000);
    const actualTtl = Math.min(ttl || 300, 3600);
    const jti = `att_${crypto.randomUUID().replace(/-/g, "")}`;

    const token = await new jose.SignJWT({
      v: "0",
      act: {
        sub: human_id,
        ...(human_email && { email: human_email }),
      },
      scope,
    })
      .setProtectedHeader({
        alg: "ES256",
        typ: "JWT",
        ...(kid && { kid }),
      })
      .setIssuer(issuer)
      .setSubject(agent_id)
      .setAudience(merchant)
      .setIssuedAt(now)
      .setExpirationTime(now + actualTtl)
      .setJti(jti)
      .sign(key);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              token,
              jti,
              expires_at: new Date((now + actualTtl) * 1000).toISOString(),
              header_name: "Agent-Attestation",
              usage: `Include this header in your request: Agent-Attestation: ${token}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool: generate_keypair — generate an ES256 key pair
server.tool(
  "generate_keypair",
  "Generate an ES256 key pair for agent attestation signing. Returns the private key (keep secret) and public JWK (publish at your JWKS endpoint).",
  {
    kid: z
      .string()
      .optional()
      .describe("Key ID for the generated key pair"),
  },
  async ({ kid: keyId }) => {
    const { privateKey: privKey, publicKey } = await jose.generateKeyPair("ES256");
    const privateJwk = await jose.exportJWK(privKey);
    const publicJwk = await jose.exportJWK(publicKey);

    if (keyId) {
      privateJwk.kid = keyId;
      publicJwk.kid = keyId;
    }
    publicJwk.use = "sig";
    publicJwk.alg = "ES256";
    privateJwk.use = "sig";
    privateJwk.alg = "ES256";

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              private_key: privateJwk,
              public_jwk: publicJwk,
              jwks_document: { keys: [publicJwk] },
              instructions:
                "Keep the private_key secret. Publish the public_jwk in your JWKS document at /.well-known/attest-jwks.json",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool: verify — verify an attestation token (calls the Attest API)
server.tool(
  "verify_attestation",
  "Verify an agent attestation token against the Attest API. Returns the verification result including identity resolution.",
  {
    token: z.string().describe("The Agent-Attestation JWT to verify"),
    merchant_id: z.string().describe("The merchant identifier"),
    api_url: z
      .string()
      .optional()
      .describe("Attest API URL (default: http://localhost:3000)"),
  },
  async ({ token, merchant_id, api_url }) => {
    const url = api_url || process.env.ATTEST_API_URL || "http://localhost:3000";

    const response = await fetch(`${url}/v0/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, merchant_id }),
    });

    const result = await response.json();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Tool: check_merchant — check if a merchant supports Attest
server.tool(
  "check_merchant_attest",
  "Check whether a merchant website supports Attest agent verification. Returns the merchant's attestation support status, available benefits for verified agents, and installation instructions if not supported.",
  {
    domain: z
      .string()
      .describe("The merchant's domain (e.g., 'cool-store.com')"),
  },
  async ({ domain }) => {
    // Check for .well-known/attest.json
    let discoveryResult: any = null;
    try {
      const res = await fetch(
        `https://${domain}/.well-known/attest.json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        discoveryResult = await res.json();
      }
    } catch {}

    // Check for WWW-Attest header by making a request
    let challengeHeader: string | null = null;
    try {
      const res = await fetch(`https://${domain}`, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": `Attest-Check/1.0 (${issuer})` },
      });
      challengeHeader = res.headers.get("WWW-Attest");
    } catch {}

    const supported = !!(discoveryResult || challengeHeader);

    const result: any = {
      domain,
      attest_supported: supported,
    };

    if (supported) {
      result.discovery = discoveryResult;
      result.challenge = challengeHeader;
      result.message = `${domain} supports Attest! You can attest your identity to get benefits like ${
        discoveryResult?.benefits
          ? Object.keys(discoveryResult.benefits).join(", ")
          : "loyalty pricing, real-time inventory"
      }.`;
    } else {
      result.message = `${domain} does not yet support Attest agent verification. You'll be treated as an unidentified agent — you may encounter CAPTCHAs, rate limits, and won't get loyalty pricing.`;
      result.suggestion =
        "You can let the user know that this merchant doesn't support agent verification. If the user is a regular customer there, they might want to suggest the merchant install Attest.";
      result.merchant_install_url = `https://dashboard.attest.dev/login`;
      result.shopify_app_url = "https://apps.shopify.com/attest";
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Tool: request_attest — send an agent-driven request for a merchant to install Attest
server.tool(
  "request_merchant_attest",
  "Send a request to a merchant to install Attest, so your agent can get verified access (loyalty pricing, no CAPTCHAs, etc). This notifies the Attest team to reach out to the merchant. Use this when a merchant doesn't support Attest and your user would benefit from verified agent access there.",
  {
    merchant_domain: z.string().describe("The merchant's domain"),
    user_email: z
      .string()
      .email()
      .optional()
      .describe("The user's email (for the merchant to see demand)"),
    reason: z
      .string()
      .optional()
      .describe("Why the user wants this merchant to support Attest"),
  },
  async ({ merchant_domain, user_email, reason }) => {
    const apiUrl = process.env.ATTEST_API_URL || "https://api.attest.dev";

    try {
      const response = await fetch(`${apiUrl}/v0/merchant-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_domain,
          requested_by: user_email || "anonymous",
          reason: reason || "Agent user wants verified access",
          source: `mcp:${issuer}`,
        }),
      });

      if (response.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  submitted: true,
                  merchant_domain,
                  message: `Request submitted! The Attest team will reach out to ${merchant_domain} about enabling agent verification. In the meantime, you can still shop there — you'll just get the unverified experience.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    } catch {}

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              submitted: false,
              merchant_domain,
              message: `Couldn't submit the request right now. The merchant can install Attest directly at dashboard.attest.dev or from the Shopify App Store.`,
              install_url: "https://dashboard.attest.dev/login",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
