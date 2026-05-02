import { describe, it, expect } from "vitest";
import {
  createMagicLinkToken,
  verifyMagicLinkToken,
  validateSession,
  invalidateSession,
} from "../services/magic-link.js";

describe("magic-link auth", () => {
  it("creates and verifies a magic link token", () => {
    const token = createMagicLinkToken("alice@example.com", "user_alice");

    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(20);

    const result = verifyMagicLinkToken(token);
    expect(result).not.toBeNull();
    expect(result!.email).toBe("alice@example.com");
    expect(result!.humanPrincipalId).toBe("user_alice");
    expect(result!.sessionToken).toBeTruthy();
  });

  it("rejects token after first use (one-time)", () => {
    const token = createMagicLinkToken("bob@example.com", "user_bob");

    const first = verifyMagicLinkToken(token);
    expect(first).not.toBeNull();

    const second = verifyMagicLinkToken(token);
    expect(second).toBeNull();
  });

  it("creates a valid session after verification", () => {
    const token = createMagicLinkToken("carol@example.com", "user_carol");
    const result = verifyMagicLinkToken(token)!;

    const session = validateSession(result.sessionToken);
    expect(session).not.toBeNull();
    expect(session!.email).toBe("carol@example.com");
    expect(session!.humanPrincipalId).toBe("user_carol");
  });

  it("invalidates sessions on logout", () => {
    const token = createMagicLinkToken("dave@example.com", "user_dave");
    const result = verifyMagicLinkToken(token)!;

    // Session is valid
    expect(validateSession(result.sessionToken)).not.toBeNull();

    // Invalidate
    invalidateSession(result.sessionToken);

    // Session is gone
    expect(validateSession(result.sessionToken)).toBeNull();
  });

  it("rejects unknown session tokens", () => {
    expect(validateSession("totally-fake-token")).toBeNull();
  });

  it("rejects unknown magic link tokens", () => {
    expect(verifyMagicLinkToken("nonexistent-token")).toBeNull();
  });
});
