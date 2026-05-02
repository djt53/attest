import { describe, it, expect, vi } from "vitest";
import {
  createStripeCheckoutParams,
  createPaymentIntentParams,
  stripeAttestMiddleware,
} from "../adapters/stripe.js";

describe("stripe adapter", () => {
  describe("createStripeCheckoutParams", () => {
    it("creates checkout session params with attestation metadata", () => {
      const params = createStripeCheckoutParams({
        token: "eyJ...",
        merchantId: "my-store.com",
      });

      expect(params.metadata.agent_attestation).toBe("eyJ...");
      expect(params.metadata.attest_merchant_id).toBe("my-store.com");
      expect(params.payment_intent_data.metadata.agent_attestation).toBe("eyJ...");
    });
  });

  describe("createPaymentIntentParams", () => {
    it("creates payment intent params with attestation metadata", () => {
      const params = createPaymentIntentParams({
        token: "eyJ...",
        merchantId: "my-store.com",
      });

      expect(params.metadata.agent_attestation).toBe("eyJ...");
      expect(params.metadata.attest_merchant_id).toBe("my-store.com");
    });
  });

  describe("stripeAttestMiddleware", () => {
    it("injects stripe params when attestation header present", () => {
      const middleware = stripeAttestMiddleware({ merchantId: "store.com" });
      const req = { headers: { "agent-attestation": "token123" } } as any;
      const next = vi.fn();

      middleware(req, {}, next);

      expect(req.attestStripeParams).toBeDefined();
      expect(req.attestStripeParams.metadata.agent_attestation).toBe("token123");
      expect(req.attestStripeParams.metadata.attest_merchant_id).toBe("store.com");
      expect(next).toHaveBeenCalled();
    });

    it("sets empty params when no attestation header", () => {
      const middleware = stripeAttestMiddleware({ merchantId: "store.com" });
      const req = { headers: {} } as any;
      const next = vi.fn();

      middleware(req, {}, next);

      expect(req.attestStripeParams).toEqual({});
      expect(next).toHaveBeenCalled();
    });
  });
});
