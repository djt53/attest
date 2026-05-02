import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getInstallUrl } from "~/lib/shopify.server";

/**
 * GET /auth?shop=foo.myshopify.com
 * Initiates Shopify OAuth flow.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop || !shop.endsWith(".myshopify.com")) {
    throw new Response("Missing or invalid shop parameter", { status: 400 });
  }

  const installUrl = getInstallUrl(shop);
  return redirect(installUrl);
}
