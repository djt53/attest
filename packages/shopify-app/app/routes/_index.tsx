import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  DataTable,
  EmptyState,
  Banner,
  Tabs,
} from "@shopify/polaris";
import { getAgentEvents } from "~/lib/attest.server";

const ATTEST_API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

export async function loader({ request }: LoaderFunctionArgs) {
  const merchantId =
    process.env.SHOPIFY_SHOP_DOMAIN || "demo-store.myshopify.com";

  // Fetch events and analytics in parallel
  const [events, analyticsRes] = await Promise.all([
    getAgentEvents(merchantId),
    fetch(
      `${ATTEST_API_URL}/v0/merchants/${encodeURIComponent(merchantId)}/analytics/summary?days=30`
    ).catch(() => null),
  ]);

  let analytics = null;
  if (analyticsRes?.ok) {
    analytics = await analyticsRes.json();
  }

  // Fallback stats from events if analytics API unavailable
  const stats = analytics || {
    total_sessions: events.length,
    verified_sessions: events.filter((e) => e.action === "verified").length,
    denied_sessions: events.filter((e) => e.action === "denied").length,
    unique_agents: new Set(
      events.map((e) => `${e.runtime_issuer}/${e.agent_id}`)
    ).size,
    unique_humans: new Set(events.map((e) => e.human_principal_id)).size,
    unique_runtimes: new Set(events.map((e) => e.runtime_issuer)).size,
  };

  return json({ events, stats, merchantId });
}

export default function Index() {
  const { events, stats } = useLoaderData<typeof loader>();

  const verifyRate =
    stats.total_sessions > 0
      ? Math.round((stats.verified_sessions / stats.total_sessions) * 100)
      : 0;

  return (
    <Page
      title="Agent Traffic"
      secondaryActions={[
        { content: "Policies", url: "/policies" },
        { content: "Settings", url: "/settings" },
      ]}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <p>
              Attest detects and verifies agent sessions at your checkout.
              Verified agents are matched to your existing customers.
            </p>
          </Banner>
        </Layout.Section>

        {/* Stats cards */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" tone="subdued">
                Agent Sessions (30d)
              </Text>
              <Text as="p" variant="headingXl">
                {stats.total_sessions.toLocaleString()}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {stats.verified_sessions} verified, {stats.denied_sessions}{" "}
                denied
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" tone="subdued">
                Verification Rate
              </Text>
              <Text as="p" variant="headingXl">
                {verifyRate}%
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {stats.unique_agents} unique agents from{" "}
                {stats.unique_runtimes} runtimes
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm" tone="subdued">
                Unique Customers
              </Text>
              <Text as="p" variant="headingXl">
                {stats.unique_humans.toLocaleString()}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Identified via agent attestation
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Recent activity table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Recent Agent Activity
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Last 20 sessions
                </Text>
              </InlineStack>
              {events.length === 0 ? (
                <EmptyState heading="No agent traffic yet" image="">
                  <p>
                    When agents interact with your store, their verified sessions
                    will appear here. Install the attestation spec in your
                    checkout to start detecting agents.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "Agent",
                    "Runtime",
                    "Customer",
                    "Scope",
                    "Status",
                    "Time",
                  ]}
                  rows={events.slice(0, 20).map((event) => [
                    event.agent_id,
                    event.runtime_issuer,
                    event.human_email || event.human_principal_id,
                    event.scope.join(", "),
                    event.action,
                    new Date(event.created_at).toLocaleString(),
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
