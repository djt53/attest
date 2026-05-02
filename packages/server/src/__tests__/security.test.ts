import { describe, it, expect } from "vitest";
import * as jose from "jose";
import {
  generateEphemeralKeyPair,
  createProof,
  verifyProof,
  hasHolderBinding,
  getThumbprint,
} from "../services/holder-binding.js";
import {
  getStaticTrustTier,
  meetsMinimumTrust,
  registerVendorIssuer,
} from "../services/trust-tiers.js";

describe("holder-binding", () => {
  it("generates ephemeral key pair with thumbprint", async () => {
    const { privateKey, publicJwk, thumbprint } =
      await generateEphemeralKeyPair();

    expect(privateKey).toBeTruthy();
    expect(publicJwk.kty).toBe("EC");
    expect(publicJwk.crv).toBe("P-256");
    expect(thumbprint).toBeTruthy();
    expect(thumbprint.length).toBeGreaterThan(20);
  });

  it("creates and verifies a DPoP proof", async () => {
    const { privateKey, publicJwk, thumbprint } =
      await generateEphemeralKeyPair();

    const proof = await createProof(
      privateKey,
      publicJwk,
      "GET",
      "https://store.com/products"
    );

    expect(proof).toBeTruthy();
    expect(proof.split(".")).toHaveLength(3);

    const result = await verifyProof(
      proof,
      thumbprint,
      "GET",
      "https://store.com/products"
    );

    expect(result.valid).toBe(true);
  });

  it("rejects proof with wrong thumbprint", async () => {
    const key1 = await generateEphemeralKeyPair();
    const key2 = await generateEphemeralKeyPair();

    const proof = await createProof(
      key1.privateKey,
      key1.publicJwk,
      "GET",
      "https://store.com/products"
    );

    // Verify with wrong thumbprint
    const result = await verifyProof(
      proof,
      key2.thumbprint,
      "GET",
      "https://store.com/products"
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe("thumbprint_mismatch");
  });

  it("rejects proof with wrong HTTP method", async () => {
    const { privateKey, publicJwk, thumbprint } =
      await generateEphemeralKeyPair();

    const proof = await createProof(
      privateKey,
      publicJwk,
      "GET",
      "https://store.com/products"
    );

    const result = await verifyProof(
      proof,
      thumbprint,
      "POST", // Wrong method
      "https://store.com/products"
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe("method_mismatch");
  });

  it("detects holder-binding in claims", () => {
    expect(hasHolderBinding({ cnf: { jkt: "abc123" } })).toBe(true);
    expect(hasHolderBinding({ cnf: {} })).toBe(false);
    expect(hasHolderBinding({})).toBe(false);
  });

  it("extracts thumbprint from claims", () => {
    expect(getThumbprint({ cnf: { jkt: "abc123" } })).toBe("abc123");
    expect(getThumbprint({})).toBeNull();
  });
});

describe("trust tiers", () => {
  it("returns vendor-attested for known vendors", () => {
    expect(getStaticTrustTier("anthropic")).toBe("vendor-attested");
    expect(getStaticTrustTier("openai")).toBe("vendor-attested");
    expect(getStaticTrustTier("google")).toBe("vendor-attested");
    expect(getStaticTrustTier("Anthropic")).toBe("vendor-attested"); // Case-insensitive
  });

  it("returns self-signed for unknown issuers", () => {
    expect(getStaticTrustTier("random-startup")).toBe("self-signed");
    expect(getStaticTrustTier("my-custom-agent")).toBe("self-signed");
  });

  it("checks minimum trust correctly", () => {
    expect(meetsMinimumTrust("vendor-attested", "self-signed")).toBe(true);
    expect(meetsMinimumTrust("vendor-attested", "registered")).toBe(true);
    expect(meetsMinimumTrust("vendor-attested", "vendor-attested")).toBe(true);
    expect(meetsMinimumTrust("registered", "vendor-attested")).toBe(false);
    expect(meetsMinimumTrust("self-signed", "registered")).toBe(false);
    expect(meetsMinimumTrust("self-signed", "self-signed")).toBe(true);
  });

  it("allows registering custom vendor issuers", () => {
    registerVendorIssuer("custom-vendor");
    expect(getStaticTrustTier("custom-vendor")).toBe("vendor-attested");
  });
});
