import { Hono } from "hono";
import { detectAgent, getAgentLabel } from "../services/detection.js";

export const detectRoute = new Hono();

/**
 * POST /v0/detect — Detect whether a request is from an agent
 *
 * Accepts request headers and returns detection results.
 * Useful for merchants who want to call detection as a service
 * rather than running it locally.
 */
detectRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.headers) {
    return c.json({ error: "headers object required" }, 400);
  }

  const result = detectAgent(body.headers);

  return c.json({
    is_agent: result.isAgent,
    confidence: result.confidence,
    runtime: result.runtime || null,
    label: getAgentLabel(result),
    signals: result.signals,
  });
});

/**
 * GET /v0/detect — Detect the current request
 *
 * Analyzes the actual request headers. Useful for agents to
 * check whether they'd be detected.
 */
detectRoute.get("/", async (c) => {
  const headers: Record<string, string | undefined> = {};
  for (const key of [
    "user-agent",
    "x-forwarded-for",
    "accept-language",
    "sec-fetch-dest",
    "sec-ch-ua",
    "x-automation",
    "x-agent-id",
    "agent-attestation",
  ]) {
    headers[key] = c.req.header(key);
  }

  const result = detectAgent(headers);

  return c.json({
    is_agent: result.isAgent,
    confidence: result.confidence,
    runtime: result.runtime || null,
    label: getAgentLabel(result),
    signals: result.signals,
  });
});
