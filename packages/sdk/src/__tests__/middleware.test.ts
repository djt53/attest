import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAttestMiddleware } from "../middleware.js";

describe("createAttestMiddleware", () => {
  let middleware: ReturnType<typeof createAttestMiddleware>;

  beforeEach(() => {
    middleware = createAttestMiddleware({
      apiKey: "att_live_test123",
      merchantId: "test-store.com",
      apiUrl: "http://localhost:3000",
    });
  });

  it("sets attestation to invalid when no header present", async () => {
    const req = { headers: {} } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.attestation).toEqual({
      valid: false,
      error: "no_attestation",
    });
    expect(next).toHaveBeenCalled();
  });

  it("blocks when onFailure is 'block' and no header", async () => {
    const blockMiddleware = createAttestMiddleware({
      apiKey: "att_live_test123",
      merchantId: "test-store.com",
      onFailure: "block",
    });

    const req = { headers: {} } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    await blockMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes through when optional and no header", async () => {
    const optionalMiddleware = createAttestMiddleware({
      apiKey: "att_live_test123",
      merchantId: "test-store.com",
      optional: true,
    });

    const req = { headers: {} } as any;
    const res = {} as any;
    const next = vi.fn();

    await optionalMiddleware(req, res, next);

    expect(req.attestation.valid).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it("handles verification service being unavailable", async () => {
    // Mock fetch to simulate network error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const req = { headers: { "agent-attestation": "fake.jwt.token" } } as any;
    const res = {} as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.attestation).toEqual({
      valid: false,
      error: "verification_unavailable",
    });
    expect(next).toHaveBeenCalled();

    globalThis.fetch = originalFetch;
  });
});
