import crypto from "crypto";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "";
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";
const APP_URL = process.env.APP_URL || "http://localhost:3002";
const SCOPES = "read_customers,read_orders,read_checkouts,write_script_tags";

// In-memory session store (replace with DB in production)
const sessions = new Map<string, ShopifySession>();

export interface ShopifySession {
  shop: string;
  accessToken: string;
  scope: string;
  installedAt: Date;
}

export function getInstallUrl(shop: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  // Store nonce for CSRF verification
  sessions.set(`nonce:${shop}`, {
    shop,
    accessToken: nonce,
    scope: "",
    installedAt: new Date(),
  });

  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SCOPES,
    redirect_uri: `${APP_URL}/auth/callback`,
    state: nonce,
  });

  return `https://${shop}/admin/oauth/authorize?${params}`;
}

export async function handleCallback(
  shop: string,
  code: string,
  state: string
): Promise<ShopifySession> {
  // Verify nonce
  const stored = sessions.get(`nonce:${shop}`);
  if (!stored || stored.accessToken !== state) {
    throw new Error("Invalid state parameter");
  }
  sessions.delete(`nonce:${shop}`);

  // Exchange code for access token
  const response = await fetch(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    scope: string;
  };

  const session: ShopifySession = {
    shop,
    accessToken: data.access_token,
    scope: data.scope,
    installedAt: new Date(),
  };

  sessions.set(shop, session);
  return session;
}

export function getSession(shop: string): ShopifySession | undefined {
  return sessions.get(shop);
}

export function verifyHmac(
  query: Record<string, string>,
  secret: string = SHOPIFY_API_SECRET
): boolean {
  const { hmac, ...params } = query;
  if (!hmac) return false;

  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const computed = crypto
    .createHmac("sha256", secret)
    .update(sorted)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hmac, "hex"),
    Buffer.from(computed, "hex")
  );
}

export function verifyWebhookHmac(
  body: string,
  hmacHeader: string,
  secret: string = SHOPIFY_API_SECRET
): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(hmacHeader, "base64"),
    Buffer.from(computed, "base64")
  );
}

export async function shopifyAdminApi(
  shop: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const session = getSession(shop);
  if (!session) throw new Error(`No session for ${shop}`);

  const response = await fetch(
    `https://${shop}/admin/api/2024-10/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const data = (await response.json()) as { data: unknown; errors?: unknown[] };
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}
