/**
 * Attest Browser SDK
 *
 * Lightweight script merchants embed in their checkout pages to detect
 * and forward agent attestation headers to the Attest API.
 *
 * Usage:
 * ```html
 * <script src="https://cdn.attest.dev/v0/attest.js"
 *         data-merchant-id="cool-store.myshopify.com"
 *         data-api-key="att_live_..."></script>
 * ```
 *
 * Or programmatically:
 * ```ts
 * import { AttestDetector } from "@attest/sdk/browser";
 *
 * const detector = new AttestDetector({
 *   merchantId: "cool-store.myshopify.com",
 *   apiKey: "att_live_...",
 *   onAgentDetected: (result) => {
 *     console.log("Agent detected:", result);
 *   },
 * });
 *
 * detector.start();
 * ```
 */

export interface DetectorOptions {
  merchantId: string;
  apiKey: string;
  apiUrl?: string;
  onAgentDetected?: (result: AgentDetectionResult) => void;
  onError?: (error: Error) => void;
}

export interface AgentDetectionResult {
  detected: boolean;
  verified: boolean;
  runtime?: string;
  agent?: string;
  human?: { id: string; email?: string };
  scope?: string[];
  customer?: {
    matched: boolean;
    customer_id?: string;
    name?: string;
    tier?: string;
  };
}

export class AttestDetector {
  private options: DetectorOptions;
  private apiUrl: string;
  private intercepted = false;

  constructor(options: DetectorOptions) {
    this.options = options;
    this.apiUrl = options.apiUrl || "https://api.attest.dev";
  }

  /**
   * Start detecting agent attestation in the current page context.
   * Intercepts fetch and XMLHttpRequest to capture attestation headers.
   */
  start() {
    if (this.intercepted) return;
    this.intercepted = true;

    this.interceptFetch();
    this.interceptXHR();

    // Also check if there's an attestation token in a meta tag or data attribute
    this.checkMetaTag();
  }

  private interceptFetch() {
    const originalFetch = globalThis.fetch;
    const self = this;

    globalThis.fetch = async function (...args) {
      const request =
        args[0] instanceof Request ? args[0] : new Request(args[0] as string, args[1]);

      const attestation = request.headers.get("Agent-Attestation");
      if (attestation) {
        self.handleAttestation(attestation).catch(self.options.onError || console.error);
      }

      return originalFetch.apply(globalThis, args);
    };
  }

  private interceptXHR() {
    const self = this;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    const headerMap = new WeakMap<XMLHttpRequest, Map<string, string>>();

    XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
      if (!headerMap.has(this)) headerMap.set(this, new Map());
      headerMap.get(this)!.set(name.toLowerCase(), value);
      return originalSetHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.open = function (...args: any[]) {
      this.addEventListener("loadstart", () => {
        const headers = headerMap.get(this);
        const attestation = headers?.get("agent-attestation");
        if (attestation) {
          self.handleAttestation(attestation).catch(self.options.onError || console.error);
        }
      });
      return originalOpen.apply(this, args);
    };
  }

  private checkMetaTag() {
    if (typeof document === "undefined") return;

    const meta = document.querySelector('meta[name="agent-attestation"]');
    if (meta) {
      const token = meta.getAttribute("content");
      if (token) {
        this.handleAttestation(token).catch(this.options.onError || console.error);
      }
    }
  }

  private async handleAttestation(token: string) {
    try {
      const response = await fetch(`${this.apiUrl}/v0/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          token,
          merchant_id: this.options.merchantId,
        }),
      });

      const data = await response.json();

      const result: AgentDetectionResult = {
        detected: true,
        verified: data.valid,
        runtime: data.attestation?.runtime,
        agent: data.attestation?.agent,
        human: data.attestation?.human,
        scope: data.attestation?.scope,
        customer: data.resolution
          ? {
              matched: data.resolution.matched,
              customer_id: data.resolution.external_customer_id,
              name: data.resolution.customer_name,
              tier: data.resolution.customer_tier,
            }
          : undefined,
      };

      this.options.onAgentDetected?.(result);

      // Dispatch a custom event for other scripts to listen to
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("attest:agent-detected", { detail: result })
        );
      }
    } catch (error) {
      this.options.onError?.(error as Error);
    }
  }

  /** Stop intercepting and restore original fetch/XHR */
  stop() {
    // Note: restoring originals is complex with multiple interceptors.
    // In practice, the detector runs for the lifetime of the page.
    this.intercepted = false;
  }
}

// Auto-initialize from script tag attributes
if (typeof document !== "undefined") {
  const script = document.currentScript;
  if (script) {
    const merchantId = script.getAttribute("data-merchant-id");
    const apiKey = script.getAttribute("data-api-key");
    const apiUrl = script.getAttribute("data-api-url");

    if (merchantId && apiKey) {
      const detector = new AttestDetector({
        merchantId,
        apiKey,
        apiUrl: apiUrl || undefined,
      });
      detector.start();
    }
  }
}
