import { describe, it, expect } from "vitest";
import { detectAgent, getAgentLabel } from "../services/detection.js";

describe("agent detection", () => {
  it("detects Claude user-agent", () => {
    const result = detectAgent({
      "user-agent": "Mozilla/5.0 (compatible; Claude-Web/1.0; +https://anthropic.com)",
    });
    expect(result.isAgent).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.runtime).toBe("anthropic");
  });

  it("detects GPTBot user-agent", () => {
    const result = detectAgent({
      "user-agent": "Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.0)",
    });
    expect(result.isAgent).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.runtime).toBe("openai");
  });

  it("detects PerplexityBot", () => {
    const result = detectAgent({
      "user-agent": "PerplexityBot/1.0",
    });
    expect(result.isAgent).toBe(true);
    expect(result.runtime).toBe("perplexity");
  });

  it("detects headless Chrome", () => {
    const result = detectAgent({
      "user-agent": "Mozilla/5.0 HeadlessChrome/120.0",
    });
    expect(result.isAgent).toBe(true);
    expect(result.runtime).toBe("headless");
  });

  it("does not flag normal browser user-agent", () => {
    const result = detectAgent({
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0",
      "accept-language": "en-US,en;q=0.9",
      "sec-fetch-dest": "document",
      "sec-ch-ua": '"Chrome";v="120"',
    });
    expect(result.isAgent).toBe(false);
    expect(result.confidence).toBe("none");
  });

  it("detects attestation header as highest confidence", () => {
    const result = detectAgent({
      "user-agent": "Mozilla/5.0 Chrome/120.0",
      "agent-attestation": "eyJhbGciOiJFUzI1NiI...",
    });
    expect(result.isAgent).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.signals).toContain("attestation_header");
  });

  it("flags missing browser headers as low confidence", () => {
    const result = detectAgent({
      "user-agent": "Mozilla/5.0 Chrome/120.0",
      // no accept-language, no sec-* headers
    });
    expect(result.isAgent).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.signals).toContain("missing_accept_language");
  });

  it("upgrades confidence with multiple signals", () => {
    const result = detectAgent({
      "user-agent": "Mozilla/5.0 Chrome/120.0",
      "x-automation": "true",
      // missing accept-language, sec-fetch-dest, sec-ch-ua
    });
    expect(result.isAgent).toBe(true);
    expect(result.signals.length).toBeGreaterThanOrEqual(3);
  });

  it("returns correct labels", () => {
    expect(
      getAgentLabel({ isAgent: true, confidence: "high", runtime: "anthropic", signals: [] })
    ).toBe("anthropic");
    expect(
      getAgentLabel({ isAgent: true, confidence: "high", signals: [] })
    ).toBe("agent (unidentified)");
    expect(
      getAgentLabel({ isAgent: true, confidence: "medium", signals: [] })
    ).toBe("likely agent");
    expect(
      getAgentLabel({ isAgent: false, confidence: "none", signals: [] })
    ).toBe("human");
  });
});
