# Attest

Identity resolution and trust layer for agent commerce. Open attestation spec on the agent side, paid product on the merchant side.

**Problem:** Agent traffic is appearing at merchant checkouts. Merchants can't tell if a session is a human or agent, which agent, or who it acts for.

**Solution:** Attest is the neutral verification layer. Agent runtimes sign attestation tokens (JWTs). Merchants verify them and resolve the human identity against their customer database.

## Architecture

```
Agent Runtime ──attestation header──▶ Merchant (Shopify app / SDK)
                                            │
                                            ▼
                                     Attest API
                                     ├── Verify JWT
                                     ├── Resolve identity
                                     ├── Evaluate policy
                                     └── Log consent
```

## Packages

| Package | Description |
|---------|-------------|
| `@attest/server` | Hono-based verification API |
| `@attest/sdk` | Agent-side SDK, merchant middleware, adapters |
| `@attest/mcp-adapter` | Claude MCP server for attestation |
| `@attest/shopify-app` | Shopify embedded admin app |
| `@attest/stripe-app` | Stripe Apps dashboard integration |
| `@attest/consent-portal` | Consumer permission management UI |
| `spec/` | Attestation specification v0 |
| `docs/` | OpenAPI spec |

## Quick Start

```bash
# Install dependencies
npm install

# Run the verification server
npm run dev

# Run the demo (no database required)
npx tsx packages/server/src/demo.ts
```

## SDK Usage

```typescript
import { AttestClient } from "@attest/sdk";

// Generate a key pair (do this once, publish the public key)
const { privateKey, publicJwk } = await AttestClient.generateKeyPair("key-1");

// Create a client
const client = new AttestClient({
  issuer: "my-agent-runtime",
  privateKey,
  kid: "key-1",
});

// Create an attestation token
const { token } = await client.attest({
  agentId: "shopping-agent",
  humanPrincipal: { id: "user_123", email: "alice@example.com" },
  scope: ["browse", "purchase<=500"],
  audience: "cool-store.myshopify.com",
});

// Attach to outbound request
fetch(merchantUrl, {
  headers: { "Agent-Attestation": token },
});
```

## Verification API

```bash
# Verify an attestation token
curl -X POST https://api.attest.dev/v0/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "<jwt>", "merchant_id": "cool-store.myshopify.com"}'
```

Response:
```json
{
  "valid": true,
  "attestation": {
    "runtime": "anthropic",
    "agent": "claude-shopping-agent",
    "human": { "id": "user_123", "email": "alice@example.com" },
    "scope": ["browse", "purchase<=500"],
    "expires_at": "2026-05-01T21:00:00.000Z"
  },
  "resolution": {
    "matched": true,
    "customer_id": "cust_789",
    "match_method": "email"
  },
  "policy_action": "allow",
  "consent_id": "con_abc123"
}
```

## Stripe Integration

Pass attestation tokens through Stripe Checkout:

```typescript
import Stripe from "stripe";
import { createStripeCheckoutParams } from "@attest/sdk/adapters/stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const attestationToken = req.headers["agent-attestation"];

const session = await stripe.checkout.sessions.create({
  ...createStripeCheckoutParams({
    token: attestationToken,
    merchantId: "my-store.com",
  }),
  line_items: [{ price: "price_xxx", quantity: 1 }],
  mode: "payment",
  success_url: "https://my-store.com/success",
});
```

The Attest webhook handler verifies the token and decorates the Stripe
PaymentIntent with `attest_*` metadata keys, visible in the Stripe Dashboard
via the Attest Stripe App.

## Development

```bash
# Run tests
npm test

# Server only
npm run dev --workspace=packages/server

# End-to-end demo (no DB needed)
npx tsx packages/server/src/demo.ts
```

## Stack

- **Server:** TypeScript, Hono, Postgres, jose (JWT)
- **Shopify app:** Remix, Polaris
- **Stripe app:** Stripe UI Extension SDK, React
- **Consent portal:** Remix, Tailwind
- **Deployment:** Render
