import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { handleCallback, verifyHmac } from "~/lib/shopify.server";

const ATTEST_API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

/**
 * GET /auth/callback
 * Handles Shopify OAuth callback after merchant approves installation.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);

  const { shop, code, state } = params;

  if (!shop || !code || !state) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  // Verify HMAC
  if (!verifyHmac(params)) {
    throw new Response("Invalid HMAC", { status: 401 });
  }

  // Exchange code for access token
  const session = await handleCallback(shop, code, state);

  // Register merchant with Attest API
  try {
    await fetch(`${ATTEST_API_URL}/v0/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_name: shop.replace(".myshopify.com", ""),
        merchant_domain: shop,
        platform: "shopify",
        contact_email: `admin@${shop}`,
      }),
    });
  } catch {
    // Non-fatal — merchant can onboard later
    console.error(`Failed to onboard merchant ${shop} with Attest API`);
  }

  // Redirect to app dashboard
  return redirect(`/?shop=${encodeURIComponent(shop)}`);
}
