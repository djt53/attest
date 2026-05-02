# Attest — Agent Attestation Spec v0

## Overview

An **agent attestation** is a signed JWT that an agent runtime attaches to outbound HTTP requests. It asserts: "I am agent X, acting on behalf of human Y, with scope Z, for merchant W."

Merchants (or the Attest verification service) validate the JWT against the runtime's published public keys.

## Transport

The attestation is sent as an HTTP header:

```
Agent-Attestation: <jwt>
```

## JWT Claims

| Claim | Type | Required | Description |
|-------|------|----------|-------------|
| `v` | string | yes | Spec version. `"0"` for this version. |
| `iss` | string | yes | Runtime identifier (e.g., `"anthropic"`, `"openai"`, `"custom.example.com"`). Must match a registered runtime. |
| `sub` | string | yes | Agent identifier within the runtime (e.g., `"claude-3-opus"`, `"shopping-agent-abc"`). |
| `act` | object | yes | The human principal. Contains `sub` (identifier — email or pseudonymous ID) and optional `email`. |
| `aud` | string | yes | Merchant identifier (domain or merchant ID). |
| `scope` | string[] | yes | Requested permissions (e.g., `["purchase<=500"]`, `["browse", "add_to_cart"]`). |
| `exp` | number | yes | Expiration time (Unix timestamp). Max TTL: 1 hour. |
| `iat` | number | yes | Issued-at time (Unix timestamp). |
| `jti` | string | yes | Unique token ID for replay prevention. |

### Example payload

```json
{
  "v": "0",
  "iss": "anthropic",
  "sub": "claude-shopping-agent",
  "act": {
    "sub": "user_abc123",
    "email": "alice@example.com"
  },
  "aud": "cool-store.myshopify.com",
  "scope": ["browse", "purchase<=500"],
  "exp": 1735693200,
  "iat": 1735689600,
  "jti": "att_01JDEF..."
}
```

## Signing

- Algorithm: `ES256` (ECDSA with P-256 and SHA-256). Chosen for compact signatures and broad library support.
- The runtime signs with its private key and publishes its public keys via JWKS.

## Key Discovery

Runtimes publish a JWKS document at:

```
https://<iss-domain>/.well-known/attest-jwks.json
```

For well-known runtimes (e.g., `anthropic`, `openai`), Attest maintains a registry mapping `iss` values to JWKS URLs.

The verification service caches JWKS with a 5-minute TTL and supports lazy refresh on key-miss.

## Verification

A valid attestation must satisfy:

1. JWT signature verifies against the runtime's published JWKS
2. `exp` is in the future (with 30s clock skew tolerance)
3. `iat` is not more than 1 hour before current time
4. `aud` matches the merchant performing verification
5. `jti` has not been seen before (replay prevention, 1-hour window)
6. `v` is a supported spec version
7. `iss` is a registered runtime

## Verification Response

```json
{
  "valid": true,
  "attestation": {
    "runtime": "anthropic",
    "agent": "claude-shopping-agent",
    "human": {
      "id": "user_abc123",
      "email": "alice@example.com"
    },
    "scope": ["browse", "purchase<=500"],
    "expires_at": "2025-01-01T01:00:00Z"
  },
  "resolution": {
    "matched": true,
    "customer_id": "cust_789",
    "match_method": "email"
  },
  "consent_id": "con_01JDEF..."
}
```
