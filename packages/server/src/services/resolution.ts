import { findMerchantByExternalId, findCustomerByEmail } from "../db/merchants.js";

export interface ResolutionResult {
  matched: boolean;
  customer_id?: string;
  external_customer_id?: string;
  customer_name?: string;
  customer_tier?: string;
  match_method?: string;
}

export async function resolveIdentity(
  merchantExternalId: string,
  humanPrincipalId: string,
  humanEmail?: string
): Promise<ResolutionResult> {
  const merchant = await findMerchantByExternalId(merchantExternalId);
  if (!merchant) {
    return { matched: false };
  }

  // Strategy 1: Email match (v0 — simple, conservative, exact match only)
  if (humanEmail) {
    const customer = await findCustomerByEmail(merchant.id, humanEmail);
    if (customer) {
      return {
        matched: true,
        customer_id: customer.id,
        external_customer_id: customer.external_customer_id ?? undefined,
        customer_name: customer.name ?? undefined,
        customer_tier: customer.tier ?? undefined,
        match_method: "email",
      };
    }
  }

  // Strategy 2: Webhook (if merchant has a custom resolution endpoint)
  if (merchant.webhook_url) {
    try {
      const result = await resolveViaWebhook(
        merchant.webhook_url,
        humanPrincipalId,
        humanEmail
      );
      if (result.matched) return result;
    } catch {
      // Webhook failed — fall through to no match
    }
  }

  return { matched: false };
}

async function resolveViaWebhook(
  webhookUrl: string,
  humanPrincipalId: string,
  humanEmail?: string
): Promise<ResolutionResult> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      human_principal_id: humanPrincipalId,
      human_email: humanEmail,
    }),
    signal: AbortSignal.timeout(3000), // 3s timeout
  });

  if (!response.ok) {
    return { matched: false };
  }

  const data = (await response.json()) as {
    matched?: boolean;
    customer_id?: string;
    customer_name?: string;
    customer_tier?: string;
  };

  if (!data.matched) {
    return { matched: false };
  }

  return {
    matched: true,
    external_customer_id: data.customer_id,
    customer_name: data.customer_name,
    customer_tier: data.customer_tier,
    match_method: "webhook",
  };
}
