# Attest

**The identity resolution layer for agent commerce.**

Stripe handles how agents pay. Visa and Mastercard handle how agents authenticate to payment networks. Attest handles what nobody else does: **telling the merchant who the agent is, who it acts for, and whether that customer already exists in their system.**

## Why this matters

Agent traffic to e-commerce sites is exploding. AI-driven visits to US retail sites surged 4,700% year-over-year. Shopify saw AI-attributed orders grow 11x between January 2025 and January 2026. AI-referred visitors now convert 42% better and generate 37% more revenue per visit than non-AI traffic.

The payments layer is being solved. Stripe's [Agentic Commerce Protocol](https://stripe.com/blog/developing-an-open-standard-for-agentic-commerce) lets agents discover products and complete checkout. Visa's [Trusted Agent Protocol](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21716.html) distinguishes legitimate agents from bots at the HTTP layer. Mastercard's [Agent Pay](https://www.mastercard.com/us/en/news-and-trends/press/2025/april/mastercard-unveils-agent-pay-pioneering-agentic-payments-technology-to-power-commerce-in-the-age-of-ai.html) gives agents cryptographic payment credentials.

**But identity is not solved.** None of these tell the merchant:

- Is this agent acting for an existing customer, or a new one?
- Is this the same person who bought from me last week via a different agent?
- What is this agent authorized to do, and who authorized it?
- Should I apply their loyalty discount, or treat this as a guest checkout?

Auth providers (Clerk, Auth0, WorkOS) are adding agent authentication — but they work within their own platform boundary. A Clerk-powered app knows its own users. It can't resolve an inbound agent from a different platform to a customer record in Shopify.

**Attest is the neutral resolution layer that sits between agent runtimes and merchants.** Open spec on the agent side so any runtime can participate. Paid product on the merchant side that turns anonymous agent traffic into recognized customer interactions.

## How it works

```
Agent Runtime                          Merchant (Shopify / Stripe / Custom)
┌─────────────────┐                    ┌──────────────────────────────────┐
│ "I am agent X,  │  Agent-Attestation │                                  │
│  acting for     │ ──── header ─────▶ │  Attest SDK / Webhook            │
│  human Y,       │                    │         │                        │
│  scope: Z"      │                    │         ▼                        │
│                 │                    │  ┌─────────────────────────┐     │
│ Signed JWT      │                    │  │ Attest Verification API │     │
│ (ES256)         │                    │  │                         │     │
└─────────────────┘                    │  │ 1. Verify JWT signature │     │
                                       │  │ 2. Resolve to customer  │     │
                                       │  │ 3. Evaluate policy      │     │
                                       │  │ 4. Log consent          │     │
                                       │  └─────────────────────────┘     │
                                       │         │                        │
                                       │         ▼                        │
                                       │  "This is Alice (VIP tier),      │
                                       │   via Claude shopping agent,     │
                                       │   authorized for purchases       │
                                       │   up to $500. Allow."            │
                                       └──────────────────────────────────┘
```

1. **Agent creates an attestation** — a signed JWT asserting "I am agent X, acting for human Y, with scope Z, at merchant W." The runtime signs it with its private key.

2. **Merchant verifies** — via the Attest API, Shopify app, or Stripe webhook. Attest validates the signature against the runtime's published JWKS, checks expiry and replay, then resolves the human principal against the merchant's customer database.

3. **Merchant gets a clear answer** — verified agent identity, matched customer record, loyalty tier, and a policy decision (allow/deny/step-up). The consent event is logged for audit.

4. **Consumer stays in control** — a consent portal lets the human review which agents have acted on their behalf, at which merchants, and revoke permissions.

## What merchants get

- **Recognize agent customers:** Link agent sessions to existing customer records. Apply loyalty pricing, saved preferences, and order history — even when the customer arrives via a new agent.
- **Control agent access:** Set per-agent and per-runtime policies. Allow verified agents by default, require step-up auth for high-value purchases, block untrusted agents.
- **See what's happening:** Dashboard showing agent traffic volume, verification rates, top agents, scope breakdown. Know how much of your revenue is agent-assisted.
- **Stay compliant:** Append-only consent ledger records every resolution event. Consumer consent portal for GDPR right-of-access and right-to-erasure.

## Where Attest fits in the stack

| Layer | Who solves it | What they do |
|-------|--------------|-------------|
| **Agent-to-tool connectivity** | MCP (Anthropic/Linux Foundation) | Standardized protocol for agents to use tools |
| **Agent-to-agent interop** | A2A (Google) | Agents communicating with each other |
| **Product discovery** | Shopify Agentic Storefronts, Stripe ACP | Agents find and browse products |
| **Payment credentials** | Visa TAP, Mastercard Agent Pay | Agents authenticate to payment networks |
| **Payment processing** | Stripe ACP, Link Agent Wallet | Agents complete purchases |
| **Agent auth (within platform)** | Clerk, Auth0, WorkOS, Stytch | Agents authenticated within one app's boundary |
| **Enterprise agent governance** | Google Agent Identity, Microsoft Entra Agent ID, Okta | Agents managed within one enterprise |
| **Merchant identity resolution** | **Attest** | **Merchant answers: who is this agent, who do they represent, are they a returning customer?** |

## Getting started

### For agent runtimes

Publish your public keys and sign attestation tokens:

```typescript
import { AttestClient } from "@attest/sdk";

const { privateKey, publicJwk } = await AttestClient.generateKeyPair("key-1");
// Publish publicJwk at /.well-known/attest-jwks.json

const client = new AttestClient({
  issuer: "my-agent-runtime",
  privateKey,
  kid: "key-1",
});

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

Adapters available for Claude (MCP server), OpenAI (function calling), and generic JWT (BYO signing).

### For Shopify merchants

Install the Attest app. It detects agent sessions at checkout, verifies attestations, and shows agent traffic in your admin dashboard. Set allow/deny policies per agent or per runtime.

### For Stripe merchants

Use the SDK to pass attestation tokens through Stripe Checkout:

```typescript
import { createStripeCheckoutParams } from "@attest/sdk/adapters/stripe";

const session = await stripe.checkout.sessions.create({
  ...createStripeCheckoutParams({
    token: req.headers["agent-attestation"],
    merchantId: "my-store.com",
  }),
  line_items: [{ price: "price_xxx", quantity: 1 }],
  mode: "payment",
  success_url: "https://my-store.com/success",
});
```

The Attest webhook verifies the token and decorates the PaymentIntent with `attest_*` metadata, visible in the Stripe Dashboard via the Attest Stripe App.

### For any merchant (API / middleware)

```typescript
import { createAttestMiddleware } from "@attest/sdk/middleware";

app.post("/checkout", createAttestMiddleware({
  apiKey: "att_live_...",
  merchantId: "my-store.com",
}), (req, res) => {
  if (req.attestation?.valid) {
    console.log("Agent:", req.attestation.agent);
    console.log("Customer:", req.attestation.resolution);
  }
});
```

## Verification API

```bash
curl -X POST https://api.attest.dev/v0/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer att_live_..." \
  -d '{"token": "<jwt>", "merchant_id": "cool-store.myshopify.com"}'
```

```json
{
  "valid": true,
  "attestation": {
    "runtime": "anthropic",
    "agent": "claude-shopping-agent",
    "human": { "id": "user_123", "email": "alice@example.com" },
    "scope": ["browse", "purchase<=500"],
    "expires_at": "2026-05-02T01:00:00.000Z"
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

## Packages

| Package | Description |
|---------|-------------|
| `@attest/server` | Verification API — JWT verify, identity resolution, policy engine, consent ledger, analytics |
| `@attest/sdk` | Agent SDK, merchant middleware (Express/Hono), browser detection, Stripe/OpenAI/JWT adapters |
| `@attest/mcp-adapter` | Claude MCP server for attestation |
| `@attest/shopify-app` | Shopify embedded admin — agent dashboard, policies, settings, checkout extension |
| `@attest/stripe-app` | Stripe Apps — agent details on payments, traffic overview dashboard |
| `@attest/consent-portal` | Consumer permission management — magic-link auth, review, revoke |
| `spec/` | [Attestation specification v0](packages/spec/attestation-v0.md) |
| `docs/` | [OpenAPI 3.1 spec](docs/openapi.yaml) |

## Development

```bash
npm install                              # install all workspace deps
npm run dev                              # start server (port 3000)
npm test                                 # run all tests (51 tests)
npx tsx packages/server/src/demo.ts      # end-to-end demo (no DB needed)
npx tsx packages/server/src/db/migrate.ts # run DB migrations
```

Server runs without `DATABASE_URL` in JWT-only mode (in-memory stores). Set `DATABASE_URL` to a Postgres instance for full features (identity resolution, policies, consent ledger, analytics).

## Stack

- **Server:** TypeScript, Hono, Postgres, jose (JWT), Zod
- **Shopify app:** Remix, Polaris
- **Stripe app:** Stripe UI Extension SDK, React
- **Consent portal:** Remix, Tailwind
- **Deployment:** Render

## License

MIT
