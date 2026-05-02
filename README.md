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

Auth providers (Clerk, Auth0, WorkOS) are adding agent authentication — but they work within their own platform boundary. A Clerk-powered app knows its own users. It can't resolve an inbound agent from a different platform to a customer record in Shopify. Clerk's [AgentPass](https://github.com/clerk/agentpass) protocol handles delegation ("can this agent act for this user?") but not merchant-side resolution ("is this a returning customer?").

**Attest is the neutral resolution layer that sits between agent runtimes and merchants.** Open spec on the agent side so any runtime can participate. Compatible with AgentPass credentials for agents that use them. Paid product on the merchant side that turns anonymous agent traffic into recognized customer interactions.

## How it works — challenge and response

Attest uses a **merchant-driven challenge model**. The merchant creates the incentive for agents to identify themselves. No upfront coordination with agent runtimes required.

```
Agent                                     Merchant
  │                                          │
  │──── GET /products ──────────────────────▶│
  │                                          │ (detects agent via user-agent,
  │                                          │  behavioral signals)
  │◀─── 200 OK ─────────────────────────────│
  │     WWW-Attest: realm="cool-store.com",  │
  │       benefits="loyalty_pricing          │
  │                 real_time_inventory       │
  │                 skip_captcha"             │
  │                                          │
  │ (agent sees the challenge —              │
  │  "I get loyalty pricing if I attest")    │
  │                                          │
  │──── GET /products ──────────────────────▶│
  │     Agent-Attestation: eyJhbGci...       │
  │                                          │ (verifies JWT, resolves to
  │                                          │  customer Alice, VIP tier)
  │◀─── 200 OK ─────────────────────────────│
  │     X-Attest-Tier: verified              │
  │     (VIP pricing, real-time inventory,   │
  │      personalized results)               │
```

**Three layers, each valuable on its own:**

| Layer | Requires agent cooperation | What the merchant learns |
|-------|---------------------------|-------------------------|
| **Detect** | No | "34% of your traffic is agents — here's the breakdown by runtime" |
| **Challenge** | No (merchant sends, agent can ignore) | "We're offering loyalty pricing to agents that identify themselves" |
| **Verify** | Yes (agent responds with signed JWT) | "This is Alice's Claude agent, she's your VIP customer, authorized for purchases up to $500" |

The merchant installs Attest and gets value immediately from detection and analytics. Challenges start flowing to agents. Agent runtimes adopt the response protocol when their agents encounter challenges at enough merchants and miss out on better pricing, real-time inventory, and streamlined checkout.

**Session stitching across visits:** Attestation tokens contain stable identifiers (`act.sub` for the human, `sub` for the agent). The merchant recognizes the same customer across visits, across agents, and across sessions — linking Monday's browsing to Friday's purchase, even if a different agent was used each time.

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
| **Agent delegation** | Clerk AgentPass | Agent authorized to act for a user at a service |
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

Or use the challenge handler for automatic response to merchant challenges:

```typescript
import { AttestClient, ChallengeHandler } from "@attest/sdk";

const handler = new ChallengeHandler({
  client,
  agentId: "shopping-agent",
  humanPrincipal: { id: "user_123", email: "alice@example.com" },
  defaultScope: ["browse", "purchase<=500"],
});

// Automatically handles WWW-Attest challenges — retries with attestation
const response = await handler.fetch("https://cool-store.com/products");
// Response includes VIP pricing, real-time inventory, etc.
```

Adapters available for Claude (MCP server), OpenAI (function calling), Stripe Checkout, and generic JWT (BYO signing). Also accepts [AgentPass](https://github.com/clerk/agentpass) credentials.

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

### For any merchant (3 lines)

```typescript
import { attest } from "@attest/sdk/express";

app.use(attest({
  apiKey: "att_live_...",
  merchantId: "my-store.com",
}));

// Every route now has req.attest with full context
app.get("/products", (req, res) => {
  if (req.attest.isAgent) {
    console.log("Agent:", req.attest.runtime, "Tier:", req.attest.tier);
  }
  if (req.attest.verified) {
    console.log("Customer:", req.attest.customer);
    // req.attest.benefits.loyaltyPricing, .realTimeInventory, etc.
  }
});
```

Full [integration guide](packages/dashboard/app/routes/integrate.tsx) available in the merchant dashboard.

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
| `@attest/server` | Verification API — JWT verify, identity resolution, policy engine, consent ledger, analytics, AgentPass compat, holder-binding, trust tiers |
| `@attest/sdk` | Agent SDK, unified Express middleware, challenge handler, browser detection, Stripe/OpenAI/JWT/AgentPass adapters |
| `@attest/mcp-adapter` | Claude MCP server for attestation |
| `@attest/dashboard` | Standalone merchant dashboard — traffic, policies, customers, integration guide |
| `@attest/shopify-app` | Shopify embedded admin — agent dashboard, policies, settings, checkout extension |
| `@attest/stripe-app` | Stripe Apps — agent details on payments, traffic overview dashboard |
| `@attest/consent-portal` | Consumer permission management — magic-link auth, review, revoke |
| `spec/` | [Attestation spec v0](packages/spec/attestation-v0.md), [Challenge spec v0](packages/spec/challenge-v0.md) |
| `docs/` | [OpenAPI 3.1 spec](docs/openapi.yaml) |
| `decks/` | [Merchant sales deck](decks/merchant-deck.html), [VC pitch deck](decks/vc-deck.html) |

## Development

```bash
npm install                              # install all workspace deps
npm run dev                              # start server (port 3000)
npm test                                 # run all tests (88 tests)
npx tsx packages/server/src/demo.ts      # end-to-end demo (no DB needed)
npx tsx packages/server/src/db/migrate.ts # run DB migrations
```

Server runs without `DATABASE_URL` in JWT-only mode (in-memory stores). Set `DATABASE_URL` to a Postgres instance for full features (identity resolution, policies, consent ledger, analytics).

## Stack

- **Server:** TypeScript, Hono, Postgres, jose (JWT), Zod
- **Shopify app:** Remix, Polaris
- **Stripe app:** Stripe UI Extension SDK, React
- **Dashboard:** Remix, Tailwind
- **Consent portal:** Remix, Tailwind
- **Deployment:** Render

## Security

- **ES256 (ECDSA P-256)** signed attestation JWTs with JWKS-based key discovery
- **Holder-binding** (DPoP-style) — ephemeral key pairs prevent token theft
- **Runtime trust tiers** — vendor-attested (Anthropic, OpenAI, Google), registered, self-signed
- **Continuous authorization** — `POST /v0/authz/check` for mid-session revalidation with consent revocation checking
- **Replay prevention** — unique `jti` per token, 1-hour window
- **AgentPass compatibility** — accepts Clerk AgentPass credentials alongside native attestations

## License

MIT
