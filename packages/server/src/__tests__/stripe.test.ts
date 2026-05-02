import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyStripeWebhookSignature } from "../services/stripe.js";

describe("Stripe webhook signature verification", () => {
  const secret = "whsec_test_secret_key_12345";

  function signPayload(payload: string, timestamp?: number): string {
    const ts = timestamp || Math.floor(Date.now() / 1000);
    const signedPayload = `${ts}.${payload}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");
    return `t=${ts},v1=${signature}`;
  }

  it("verifies a valid signature", () => {
    const payload = '{"type":"checkout.session.completed"}';
    const sig = signPayload(payload);

    expect(verifyStripeWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const payload = '{"type":"checkout.session.completed"}';
    const sig = "t=123456,v1=invalid_signature_hex";

    expect(verifyStripeWebhookSignature(payload, sig, secret)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const payload = '{"type":"checkout.session.completed"}';
    const sig = signPayload(payload);

    // Tamper with the payload
    const tampered = '{"type":"checkout.session.completed","evil":true}';
    expect(verifyStripeWebhookSignature(tampered, sig, secret)).toBe(false);
  });

  it("rejects an expired timestamp (>5 min old)", () => {
    const payload = '{"type":"test"}';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = signPayload(payload, oldTimestamp);

    expect(verifyStripeWebhookSignature(payload, sig, secret)).toBe(false);
  });

  it("rejects missing signature header", () => {
    expect(verifyStripeWebhookSignature("{}", "", secret)).toBe(false);
  });

  it("rejects when no secret configured", () => {
    const payload = "{}";
    const sig = signPayload(payload);
    expect(verifyStripeWebhookSignature(payload, sig, "")).toBe(false);
  });
});
