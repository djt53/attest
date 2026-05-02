/**
 * Agent detection service.
 *
 * Identifies whether an HTTP request is likely from an AI agent
 * using user-agent strings, behavioral signals, and known patterns.
 * Works without any agent cooperation.
 */

export interface DetectionResult {
  isAgent: boolean;
  confidence: "high" | "medium" | "low" | "none";
  runtime?: string;
  signals: string[];
}

// Known agent user-agent patterns
const AGENT_UA_PATTERNS: Array<{
  pattern: RegExp;
  runtime: string;
  confidence: "high" | "medium";
}> = [
  // Major AI platforms
  { pattern: /claude/i, runtime: "anthropic", confidence: "high" },
  { pattern: /anthropic/i, runtime: "anthropic", confidence: "high" },
  { pattern: /ChatGPT/i, runtime: "openai", confidence: "high" },
  { pattern: /GPTBot/i, runtime: "openai", confidence: "high" },
  { pattern: /OAI-SearchBot/i, runtime: "openai", confidence: "high" },
  { pattern: /OpenAI/i, runtime: "openai", confidence: "high" },
  { pattern: /Google-Extended/i, runtime: "google", confidence: "high" },
  { pattern: /Gemini/i, runtime: "google", confidence: "medium" },
  { pattern: /PerplexityBot/i, runtime: "perplexity", confidence: "high" },
  { pattern: /Bytespider/i, runtime: "bytedance", confidence: "high" },
  { pattern: /cohere/i, runtime: "cohere", confidence: "high" },

  // Agent frameworks and tools
  { pattern: /AutoGPT/i, runtime: "autogpt", confidence: "high" },
  { pattern: /LangChain/i, runtime: "langchain", confidence: "high" },
  { pattern: /CrewAI/i, runtime: "crewai", confidence: "high" },
  { pattern: /BrowserBase/i, runtime: "browserbase", confidence: "high" },
  { pattern: /Playwright/i, runtime: "automation", confidence: "medium" },
  { pattern: /Puppeteer/i, runtime: "automation", confidence: "medium" },
  { pattern: /Selenium/i, runtime: "automation", confidence: "medium" },

  // Generic bot indicators
  { pattern: /bot\b/i, runtime: "unknown", confidence: "medium" },
  { pattern: /crawler/i, runtime: "unknown", confidence: "medium" },
  { pattern: /spider/i, runtime: "unknown", confidence: "medium" },
  { pattern: /HeadlessChrome/i, runtime: "headless", confidence: "medium" },
];

// Known agent IP ranges (ASNs) — major cloud/AI providers
// These are rough heuristics, not definitive
const AGENT_IP_PREFIXES = [
  "35.154.", // AWS (common for agents)
  "52.0.",   // AWS
  "104.18.", // Cloudflare Workers
];

/**
 * Detect whether a request is from an agent.
 */
export function detectAgent(rawHeaders: {
  [key: string]: string | undefined;
}): DetectionResult {
  // Normalize header keys to lowercase
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    headers[key.toLowerCase()] = value;
  }
  const signals: string[] = [];
  let bestConfidence: DetectionResult["confidence"] = "none";
  let detectedRuntime: string | undefined;

  // Signal 1: Has attestation header (strongest signal)
  if (headers["agent-attestation"]) {
    return {
      isAgent: true,
      confidence: "high",
      signals: ["attestation_header"],
    };
  }

  // Signal 2: User-agent matching
  const ua = headers["user-agent"] || "";

  for (const { pattern, runtime, confidence } of AGENT_UA_PATTERNS) {
    if (pattern.test(ua)) {
      signals.push(`ua_match:${runtime}`);
      // Prefer specific runtimes over "unknown"
      if (!detectedRuntime || detectedRuntime === "unknown") {
        detectedRuntime = runtime;
      } else if (runtime !== "unknown") {
        detectedRuntime = runtime;
      }
      if (
        confidence === "high" ||
        (confidence === "medium" && bestConfidence !== "high")
      ) {
        bestConfidence = confidence;
      }
    }
  }

  // Signal 3: Missing typical browser headers
  if (!headers["accept-language"]) {
    signals.push("missing_accept_language");
    if (bestConfidence === "none") bestConfidence = "low";
  }

  if (!headers["sec-fetch-dest"] && !headers["sec-ch-ua"]) {
    signals.push("missing_sec_headers");
    if (bestConfidence === "none") bestConfidence = "low";
  }

  // Signal 4: Empty or missing referer on navigation requests
  // (agents often make direct requests without referer chains)

  // Signal 5: Known automation headers
  if (headers["x-automation"] || headers["x-agent-id"]) {
    signals.push("automation_header");
    if (bestConfidence !== "high") bestConfidence = "medium";
  }

  // Combine signals
  const isAgent = bestConfidence !== "none";

  // Upgrade confidence if multiple signals agree
  if (signals.length >= 3 && bestConfidence === "low") {
    bestConfidence = "medium";
  }

  return {
    isAgent,
    confidence: bestConfidence,
    runtime: detectedRuntime,
    signals,
  };
}

/**
 * Extract a summary label for the detected agent.
 */
export function getAgentLabel(result: DetectionResult): string {
  if (!result.isAgent) return "human";

  if (result.runtime && result.runtime !== "unknown") {
    return result.runtime;
  }

  if (result.confidence === "high") return "agent (unidentified)";
  if (result.confidence === "medium") return "likely agent";
  return "possible agent";
}
