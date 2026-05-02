import * as jose from "jose";

interface CachedJWKS {
  keys: jose.JSONWebKeySet;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CachedJWKS>();

// Well-known runtime JWKS URLs
const RUNTIME_REGISTRY: Record<string, string> = {};

export function registerRuntime(issuer: string, jwksUrl: string) {
  RUNTIME_REGISTRY[issuer] = jwksUrl;
}

export function getJwksUrl(issuer: string): string | undefined {
  // Check registry first, then try well-known URL
  if (RUNTIME_REGISTRY[issuer]) {
    return RUNTIME_REGISTRY[issuer];
  }

  // If issuer looks like a domain, try well-known
  if (issuer.includes(".")) {
    return `https://${issuer}/.well-known/attest-jwks.json`;
  }

  return undefined;
}

export async function fetchJWKS(
  issuer: string
): Promise<jose.JSONWebKeySet | null> {
  const cached = cache.get(issuer);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.keys;
  }

  const url = getJwksUrl(issuer);
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return cached?.keys ?? null;

    const keys = (await response.json()) as jose.JSONWebKeySet;
    cache.set(issuer, { keys, fetchedAt: now });
    return keys;
  } catch {
    // Return stale cache on fetch failure
    return cached?.keys ?? null;
  }
}

export async function getVerificationKey(
  issuer: string,
  kid?: string
): Promise<jose.KeyLike | Uint8Array | null> {
  const jwks = await fetchJWKS(issuer);
  if (!jwks) return null;

  const keyStore = jose.createLocalJWKSet(jwks);
  // createLocalJWKSet returns a function that resolves the key
  // We'll use it directly in jwtVerify via the JWKS resolver
  return keyStore as unknown as jose.KeyLike;
}

// For testing: inject keys directly without fetching
export function injectJWKS(issuer: string, keys: jose.JSONWebKeySet) {
  cache.set(issuer, { keys, fetchedAt: Date.now() });
}

export function clearCache() {
  cache.clear();
}
