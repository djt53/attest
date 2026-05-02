/**
 * OpenAI Function Calling Adapter for Attest
 *
 * Provides tool definitions and handlers for OpenAI agents to create
 * attestation tokens using the function calling API.
 *
 * Usage:
 * ```ts
 * import { getAttestTools, handleAttestToolCall } from "@attest/sdk/adapters/openai";
 * import OpenAI from "openai";
 *
 * const client = new OpenAI();
 * const attestTools = getAttestTools();
 *
 * const response = await client.chat.completions.create({
 *   model: "gpt-4",
 *   messages: [...],
 *   tools: attestTools,
 * });
 *
 * // Handle tool calls
 * for (const toolCall of response.choices[0].message.tool_calls) {
 *   const result = await handleAttestToolCall(toolCall, attestClient);
 * }
 * ```
 */

import type { AttestClient } from "../client.js";

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Returns OpenAI tool definitions for attestation.
 */
export function getAttestTools(): OpenAITool[] {
  return [
    {
      type: "function",
      function: {
        name: "create_attestation",
        description:
          "Create a signed agent attestation token for acting on behalf of a human at a merchant. Returns the JWT to include as an Agent-Attestation header in outbound requests.",
        parameters: {
          type: "object",
          properties: {
            agent_id: {
              type: "string",
              description: "Agent identifier (e.g., 'shopping-assistant')",
            },
            human_id: {
              type: "string",
              description: "Human principal identifier",
            },
            human_email: {
              type: "string",
              description: "Human's email for identity resolution (optional)",
            },
            scope: {
              type: "array",
              items: { type: "string" },
              description:
                "Requested permissions (e.g., ['browse', 'purchase<=500'])",
            },
            merchant: {
              type: "string",
              description: "Target merchant domain or identifier",
            },
            ttl: {
              type: "number",
              description:
                "Token TTL in seconds (default: 300, max: 3600)",
            },
          },
          required: ["agent_id", "human_id", "scope", "merchant"],
        },
      },
    },
  ];
}

/**
 * Handle an attestation tool call from OpenAI.
 */
export async function handleAttestToolCall(
  toolCall: OpenAIToolCall,
  client: AttestClient
): Promise<{ tool_call_id: string; output: string }> {
  if (toolCall.function.name !== "create_attestation") {
    return {
      tool_call_id: toolCall.id,
      output: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }),
    };
  }

  const args = JSON.parse(toolCall.function.arguments) as {
    agent_id: string;
    human_id: string;
    human_email?: string;
    scope: string[];
    merchant: string;
    ttl?: number;
  };

  const result = await client.attest({
    agentId: args.agent_id,
    humanPrincipal: {
      id: args.human_id,
      email: args.human_email,
    },
    scope: args.scope,
    audience: args.merchant,
    ttl: args.ttl,
  });

  return {
    tool_call_id: toolCall.id,
    output: JSON.stringify({
      token: result.token,
      jti: result.jti,
      expires_at: result.expiresAt.toISOString(),
      usage: `Include this header: Agent-Attestation: ${result.token}`,
    }),
  };
}
