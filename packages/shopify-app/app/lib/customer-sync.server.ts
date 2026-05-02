import { shopifyAdminApi } from "./shopify.server";

const ATTEST_API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

interface ShopifyCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tags: string[];
}

const CUSTOMERS_QUERY = `
  query CustomersQuery($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges {
        node {
          id
          email
          firstName
          lastName
          tags
        }
        cursor
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

/**
 * Sync customers from Shopify to Attest for identity resolution.
 * Runs on app install and can be triggered manually from settings.
 * Paginates through all customers in batches of 50.
 */
export async function syncCustomers(shop: string): Promise<{
  synced: number;
  failed: number;
  total: number;
}> {
  let synced = 0;
  let failed = 0;
  let total = 0;
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const data = (await shopifyAdminApi(shop, CUSTOMERS_QUERY, {
      first: 50,
      after: cursor,
    })) as {
      customers: {
        edges: Array<{ node: ShopifyCustomer; cursor: string }>;
        pageInfo: { hasNextPage: boolean };
      };
    };

    const customers = data.customers.edges.map((edge) => ({
      email: edge.node.email,
      external_customer_id: edge.node.id.replace("gid://shopify/Customer/", ""),
      name: [edge.node.firstName, edge.node.lastName].filter(Boolean).join(" "),
      tier: inferTier(edge.node.tags),
    })).filter((c) => c.email); // Skip customers without email

    if (customers.length > 0) {
      try {
        const response = await fetch(
          `${ATTEST_API_URL}/v0/merchants/${encodeURIComponent(shop)}/customers/import`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customers }),
          }
        );

        if (response.ok) {
          const result = (await response.json()) as {
            imported: number;
            failed: number;
          };
          synced += result.imported;
          failed += result.failed;
        } else {
          failed += customers.length;
        }
      } catch {
        failed += customers.length;
      }
    }

    total += customers.length;
    hasNextPage = data.customers.pageInfo.hasNextPage;
    cursor =
      data.customers.edges.length > 0
        ? data.customers.edges[data.customers.edges.length - 1].cursor
        : null;
  }

  return { synced, failed, total };
}

function inferTier(tags: string[]): string | undefined {
  const lowerTags = tags.map((t) => t.toLowerCase());
  if (lowerTags.includes("vip") || lowerTags.includes("loyalty-gold")) return "vip";
  if (lowerTags.includes("loyalty-silver")) return "silver";
  if (lowerTags.includes("loyalty-bronze")) return "bronze";
  return undefined;
}
