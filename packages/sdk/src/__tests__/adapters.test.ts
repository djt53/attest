import { describe, it, expect } from "vitest";
import { validateAttestationClaims } from "../adapters/generic-jwt.js";
import { getAttestTools, handleAttestToolCall } from "../adapters/openai.js";
import { AttestClient } from "../client.js";

describe("generic-jwt adapter", () => {
  it("validates correct claims", () => {
    const result = validateAttestationClaims({
      v: "0",
      iss: "my-runtime",
      sub: "my-agent",
      act: { sub: "user_123", email: "alice@example.com" },
      aud: "merchant.com",
      scope: ["browse", "purchase<=500"],
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
      jti: "att_abc123",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing required claims", () => {
    const result = validateAttestationClaims({
      v: "0",
      iss: "my-runtime",
      // missing sub, act, aud, scope, exp, iat, jti
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects wrong spec version", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = validateAttestationClaims({
      v: "99",
      iss: "x",
      sub: "x",
      act: { sub: "x" },
      aud: "x",
      scope: [],
      exp: now + 300,
      iat: now,
      jti: "x",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("version");
  });

  it("rejects TTL > 3600", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = validateAttestationClaims({
      v: "0",
      iss: "x",
      sub: "x",
      act: { sub: "x" },
      aud: "x",
      scope: [],
      exp: now + 7200,
      iat: now,
      jti: "x",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("TTL"))).toBe(true);
  });
});

describe("openai adapter", () => {
  it("returns valid tool definitions", () => {
    const tools = getAttestTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe("function");
    expect(tools[0].function.name).toBe("create_attestation");
    expect(tools[0].function.parameters).toBeDefined();
  });

  it("handles attestation tool calls", async () => {
    const { privateKey } = await AttestClient.generateKeyPair();
    const client = new AttestClient({
      issuer: "test-openai-runtime",
      privateKey,
    });

    const result = await handleAttestToolCall(
      {
        id: "call_123",
        type: "function",
        function: {
          name: "create_attestation",
          arguments: JSON.stringify({
            agent_id: "shopping-assistant",
            human_id: "user_456",
            scope: ["browse"],
            merchant: "store.com",
          }),
        },
      },
      client
    );

    expect(result.tool_call_id).toBe("call_123");
    const output = JSON.parse(result.output);
    expect(output.token).toBeTruthy();
    expect(output.jti).toMatch(/^att_/);
    expect(output.expires_at).toBeTruthy();
  });

  it("returns error for unknown tool", async () => {
    const { privateKey } = await AttestClient.generateKeyPair();
    const client = new AttestClient({ issuer: "test", privateKey });

    const result = await handleAttestToolCall(
      {
        id: "call_999",
        type: "function",
        function: { name: "unknown_tool", arguments: "{}" },
      },
      client
    );

    const output = JSON.parse(result.output);
    expect(output.error).toContain("Unknown tool");
  });
});
