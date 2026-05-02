import { json, type ActionFunctionArgs } from "@remix-run/node";
import { verifyAttestation } from "~/lib/attest.server";

/**
 * Webhook handlers for Shopify events.
 *
 * Shopify sends webhooks for various checkout and order events.
 * We intercept these to check for agent attestation and log
 * verification results.
 */

interface ShopifyWebhookPayload {
  id: number;
  email?: string;
  note_attributes?: Array<{ name: string; value: string }>;
  checkout_token?: string;
  [key: string]: unknown;
}

export async function action({ request }: ActionFunctionArgs) {
  const topic = request.headers.get("X-Shopify-Topic");
  const shop = request.headers.get("X-Shopify-Shop-Domain");
  const hmac = request.headers.get("X-Shopify-Hmac-SHA256");

  // TODO: Verify HMAC signature
  if (!topic || !shop) {
    return json({ error: "missing_headers" }, 400);
  }

  const payload = (await request.json()) as ShopifyWebhookPayload;

  switch (topic) {
    case "checkouts/create":
    case "checkouts/update":
      return handleCheckoutEvent(shop, payload);

    case "orders/create":
      return handleOrderCreated(shop, payload);

    case "app/uninstalled":
      return handleAppUninstalled(shop);

    default:
      return json({ ok: true });
  }
}

async function handleCheckoutEvent(
  shop: string,
  payload: ShopifyWebhookPayload
) {
  // Check if checkout has an agent attestation token
  const attestationAttr = payload.note_attributes?.find(
    (attr) => attr.name === "agent_attestation"
  );

  if (!attestationAttr) {
    return json({ agent_detected: false });
  }

  // Verify the attestation
  const result = await verifyAttestation(attestationAttr.value, shop);

  // TODO: Store verification result as checkout metafield
  // so the checkout UI extension can display it

  return json({
    agent_detected: true,
    verification: result,
  });
}

async function handleOrderCreated(
  shop: string,
  payload: ShopifyWebhookPayload
) {
  // Log agent-assisted orders for the merchant dashboard
  const attestationAttr = payload.note_attributes?.find(
    (attr) => attr.name === "agent_attestation"
  );

  if (attestationAttr) {
    // Verify and log
    await verifyAttestation(attestationAttr.value, shop);
  }

  return json({ ok: true });
}

async function handleAppUninstalled(shop: string) {
  // Clean up merchant data
  // TODO: Remove merchant config, but retain consent ledger entries
  // (consent records must persist for audit compliance)
  console.log(`App uninstalled from ${shop} — cleanup pending`);
  return json({ ok: true });
}
