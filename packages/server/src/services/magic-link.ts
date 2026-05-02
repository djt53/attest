import crypto from "crypto";
import { requireDb } from "../db/connection.js";

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory stores (replace with Redis in production)
const pendingTokens = new Map<
  string,
  { email: string; humanPrincipalId: string; expiresAt: number }
>();
const activeSessions = new Map<
  string,
  { email: string; humanPrincipalId: string; expiresAt: number }
>();

// Clean up expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingTokens) {
    if (val.expiresAt < now) pendingTokens.delete(key);
  }
  for (const [key, val] of activeSessions) {
    if (val.expiresAt < now) activeSessions.delete(key);
  }
}, 60_000);

/**
 * Generate a magic link token for a given email.
 * Returns the token to be included in the magic link URL.
 */
export function createMagicLinkToken(
  email: string,
  humanPrincipalId: string
): string {
  const token = crypto.randomBytes(32).toString("base64url");

  pendingTokens.set(token, {
    email,
    humanPrincipalId,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  return token;
}

/**
 * Verify a magic link token and create a session.
 * Returns the session token if valid, null if invalid/expired.
 */
export function verifyMagicLinkToken(
  token: string
): { sessionToken: string; email: string; humanPrincipalId: string } | null {
  const pending = pendingTokens.get(token);
  if (!pending) return null;
  if (pending.expiresAt < Date.now()) {
    pendingTokens.delete(token);
    return null;
  }

  // Consume the token (one-time use)
  pendingTokens.delete(token);

  // Create a session
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  activeSessions.set(sessionToken, {
    email: pending.email,
    humanPrincipalId: pending.humanPrincipalId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return {
    sessionToken,
    email: pending.email,
    humanPrincipalId: pending.humanPrincipalId,
  };
}

/**
 * Validate a session token.
 */
export function validateSession(
  sessionToken: string
): { email: string; humanPrincipalId: string } | null {
  const session = activeSessions.get(sessionToken);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    activeSessions.delete(sessionToken);
    return null;
  }

  return {
    email: session.email,
    humanPrincipalId: session.humanPrincipalId,
  };
}

/**
 * Invalidate a session (logout).
 */
export function invalidateSession(sessionToken: string): void {
  activeSessions.delete(sessionToken);
}

/**
 * Generate the magic link URL.
 */
export function getMagicLinkUrl(
  token: string,
  baseUrl: string = "http://localhost:3001"
): string {
  return `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
}
