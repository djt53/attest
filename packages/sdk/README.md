# @anthropic-attest/sdk

Agent attestation SDK for the [Attest](https://github.com/djt53/attest) identity resolution layer.

## Install

```bash
npm install @anthropic-attest/sdk
```

## Agent-side: Create attestation tokens

```typescript
import { AttestClient } from "@anthropic-attest/sdk";

// Generate a key pair (once — publish the public key)
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

## Merchant-side: Verify attestations

### Express middleware

```typescript
import { createAttestMiddleware } from "@anthropic-attest/sdk/middleware";

const attest = createAttestMiddleware({
  apiKey: "att_live_...",
  merchantId: "my-store.com",
});

app.post("/checkout", attest, (req, res) => {
  if (req.attestation?.valid) {
    console.log("Verified agent:", req.attestation.agent);
    console.log("Customer:", req.attestation.resolution);
  }
});
```

### Hono middleware

```typescript
import { attestHonoMiddleware } from "@anthropic-attest/sdk/middleware";

app.use("/checkout/*", attestHonoMiddleware({
  apiKey: "att_live_...",
  merchantId: "my-store.com",
}));
```

## Adapters

### OpenAI function calling

```typescript
import { getAttestTools, handleAttestToolCall } from "@anthropic-attest/sdk/adapters/openai";

const tools = getAttestTools();
// Pass to OpenAI chat completion, handle tool calls with handleAttestToolCall
```

### Generic JWT (BYO signing)

```typescript
import { validateAttestationClaims } from "@anthropic-attest/sdk/adapters/generic-jwt";

const validation = validateAttestationClaims(myClaims);
if (!validation.valid) {
  console.error(validation.errors);
}
```

### Stripe Checkout

```typescript
import { createStripeCheckoutParams } from "@anthropic-attest/sdk/adapters/stripe";

// When creating a Stripe Checkout Session with an agent attestation
const params = createStripeCheckoutParams({
  token: attestationToken,
  merchantId: "my-store.com",
});

const session = await stripe.checkout.sessions.create({
  ...params,
  line_items: [...],
  mode: "payment",
  success_url: "...",
});
```

Or use the Express middleware:

```typescript
import { stripeAttestMiddleware } from "@anthropic-attest/sdk/adapters/stripe";

app.post("/create-checkout-session",
  stripeAttestMiddleware({ merchantId: "my-store.com" }),
  async (req, res) => {
    const session = await stripe.checkout.sessions.create({
      ...req.attestStripeParams,
      line_items: [...],
    });
  }
);
```

## Browser detection

```html
<script src="https://cdn.attest.dev/v0/attest.js"
        data-merchant-id="my-store.com"
        data-api-key="att_live_..."></script>
```

Or programmatically:

```typescript
import { AttestDetector } from "@anthropic-attest/sdk/browser";

const detector = new AttestDetector({
  merchantId: "my-store.com",
  apiKey: "att_live_...",
  onAgentDetected: (result) => console.log(result),
});
detector.start();
```

## License

MIT
