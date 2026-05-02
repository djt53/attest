# Attest — Challenge-Response Spec v0

## Overview

The challenge-response protocol allows merchants to invite agents to attest their identity in exchange for elevated access. The merchant sends a `WWW-Attest` header on any HTTP response; agents that recognize it respond with a signed attestation on their next request.

This is a **pull** model: the merchant creates the incentive, agents respond when it's worth their while. No coordination required between merchant and agent runtime ahead of time.

## Challenge Header

Merchants include a `WWW-Attest` header on HTTP responses when they detect (or suspect) an agent session:

```
HTTP/1.1 200 OK
WWW-Attest: realm="cool-store.myshopify.com",
  version="0",
  benefits="loyalty_pricing real_time_inventory skip_captcha full_catalog",
  verify_url="https://api.attest.dev/v0/verify",
  discovery_url="https://cool-store.myshopify.com/.well-known/attest.json"
```

### Challenge parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `realm` | yes | Merchant identifier — use as the `aud` claim in the attestation JWT |
| `version` | yes | Attest spec version (`"0"` for this version) |
| `benefits` | yes | Space-separated list of benefits the agent receives by attesting |
| `verify_url` | no | URL where the agent can verify its attestation (default: Attest API) |
| `discovery_url` | no | URL for full challenge details (the `.well-known/attest.json` endpoint) |

### Standard benefits

| Benefit | Description |
|---------|-------------|
| `loyalty_pricing` | Customer's loyalty/tier pricing applied |
| `real_time_inventory` | Live inventory data instead of cached |
| `skip_captcha` | No CAPTCHA or bot challenges |
| `full_catalog` | Access to member-only or restricted products |
| `relaxed_rate_limit` | Higher request rate allowance |
| `personalization` | Recommendations and preferences from customer history |
| `saved_cart` | Pre-loaded cart with saved items/preferences |
| `express_checkout` | Streamlined checkout flow without step-up auth |

## Response

An agent that recognizes the challenge includes a signed attestation JWT on subsequent requests:

```
GET /products/xyz HTTP/1.1
Agent-Attestation: eyJhbGciOiJFUzI1NiI...
```

The JWT follows the [Attestation Spec v0](./attestation-v0.md) — same claims, same signing, same verification.

## Discovery Endpoint

Merchants MAY publish a `.well-known/attest.json` file on their domain with full challenge details:

```json
{
  "version": "0",
  "realm": "cool-store.myshopify.com",
  "verify_url": "https://api.attest.dev/v0/verify",
  "benefits": {
    "loyalty_pricing": {
      "description": "Your customer's loyalty tier pricing applied",
      "scope_required": ["browse"]
    },
    "real_time_inventory": {
      "description": "Live inventory instead of 15-minute cache",
      "scope_required": ["browse"]
    },
    "express_checkout": {
      "description": "Skip CAPTCHA and step-up auth for purchases",
      "scope_required": ["purchase"]
    }
  },
  "supported_runtimes": ["*"],
  "max_ttl": 3600,
  "contact": "integrations@cool-store.com"
}
```

This enables agent runtimes to discover attestation support before browsing, and to understand what scope they need to request.

## Flow

```
Agent                                Merchant
  │                                      │
  │──── GET /products ──────────────────▶│
  │                                      │ (detects agent)
  │◀─── 200 OK ─────────────────────────│
  │     WWW-Attest: realm="...",         │
  │       benefits="loyalty_pricing ..."  │
  │                                      │
  │ (recognizes challenge,               │
  │  signs attestation)                  │
  │                                      │
  │──── GET /products ──────────────────▶│
  │     Agent-Attestation: eyJ...        │
  │                                      │ (verifies, resolves customer)
  │◀─── 200 OK ─────────────────────────│
  │     (loyalty pricing applied,        │
  │      personalized results)           │
  │                                      │
```

## Design principles

1. **Non-blocking:** The challenge is informational. The original request succeeds either way — the agent gets guest-level access without attesting.
2. **Incentive-based:** The merchant advertises what the agent gains, not what it loses. Carrot, not stick.
3. **Stateless:** The challenge is on every response. No session negotiation required. Agent can attest on any request at any time.
4. **Compatible:** Follows HTTP `WWW-Authenticate` conventions. Non-Attest-aware agents ignore the header. No breakage.
5. **Progressive:** Merchants can start with detection-only (no challenge), add challenges when ready, and enforce policies later.
