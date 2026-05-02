const ATTEST_API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

async function apiRequest(
  path: string,
  apiKey: string,
  options?: RequestInit
): Promise<Response> {
  return fetch(`${ATTEST_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options?.headers,
    },
  });
}

// --- Analytics ---

export async function getAnalytics(
  merchantId: string,
  apiKey: string,
  days = 30
) {
  const res = await apiRequest(
    `/v0/merchants/${encodeURIComponent(merchantId)}/analytics?days=${days}`,
    apiKey
  );
  if (!res.ok) return null;
  return res.json();
}

export async function getAnalyticsSummary(
  merchantId: string,
  apiKey: string,
  days = 30
) {
  const res = await apiRequest(
    `/v0/merchants/${encodeURIComponent(merchantId)}/analytics/summary?days=${days}`,
    apiKey
  );
  if (!res.ok) return null;
  return res.json();
}

// --- Events ---

export async function getEvents(
  merchantId: string,
  apiKey: string,
  limit = 50
) {
  const res = await apiRequest(
    `/v0/merchants/${encodeURIComponent(merchantId)}/events?limit=${limit}`,
    apiKey
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.events || [];
}

// --- Policies ---

export async function getPolicies(merchantId: string, apiKey: string) {
  const res = await apiRequest(
    `/v0/merchants/${encodeURIComponent(merchantId)}/policies`,
    apiKey
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.policies || [];
}

export async function createPolicy(
  merchantId: string,
  apiKey: string,
  policy: {
    runtime_issuer?: string;
    agent_id?: string;
    action: string;
    conditions?: Record<string, unknown>;
    priority?: number;
  }
) {
  const res = await apiRequest(
    `/v0/merchants/${encodeURIComponent(merchantId)}/policies`,
    apiKey,
    { method: "POST", body: JSON.stringify(policy) }
  );
  return res.json();
}

export async function deletePolicy(
  merchantId: string,
  apiKey: string,
  policyId: string
) {
  await apiRequest(
    `/v0/merchants/${encodeURIComponent(merchantId)}/policies/${policyId}`,
    apiKey,
    { method: "DELETE" }
  );
}

// --- Customers ---

export async function importCustomers(
  merchantId: string,
  apiKey: string,
  customers: Array<{
    email: string;
    external_customer_id?: string;
    name?: string;
    tier?: string;
  }>
) {
  const res = await apiRequest(
    `/v0/merchants/${encodeURIComponent(merchantId)}/customers/import`,
    apiKey,
    { method: "POST", body: JSON.stringify({ customers }) }
  );
  return res.json();
}

// --- Discovery ---

export function generateDiscoveryJson(merchantId: string) {
  return {
    version: "0",
    realm: merchantId,
    verify_url: `${ATTEST_API_URL}/v0/verify`,
    benefits: {
      loyalty_pricing: {
        description: "Customer's loyalty tier pricing applied",
        scope_required: ["browse"],
      },
      real_time_inventory: {
        description: "Live inventory data instead of cached",
        scope_required: ["browse"],
      },
      skip_captcha: {
        description: "No CAPTCHA or bot challenges",
        scope_required: ["browse"],
      },
      full_catalog: {
        description: "Access to member-only and restricted products",
        scope_required: ["browse"],
      },
      relaxed_rate_limit: {
        description: "Higher request rate allowance",
        scope_required: ["browse"],
      },
      personalization: {
        description: "Recommendations based on purchase history",
        scope_required: ["browse"],
      },
    },
    supported_runtimes: ["*"],
    max_ttl: 3600,
  };
}
