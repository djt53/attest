import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  DataTable,
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { getAgentEvents } from "~/lib/attest.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // TODO: Get merchant ID from Shopify session
  const merchantId = process.env.SHOPIFY_SHOP_DOMAIN || "demo-store.myshopify.com";

  const events = await getAgentEvents(merchantId);

  // Compute summary stats
  const totalSessions = events.length;
  const verifiedSessions = events.filter((e) => e.action === "verified").length;
  const deniedSessions = events.filter((e) => e.action === "denied").length;
  const uniqueAgents = new Set(events.map((e) => `${e.runtime_issuer}/${e.agent_id}`)).size;
  const uniqueHumans = new Set(events.map((e) => e.human_principal_id)).size;

  return json({
    events,
    stats: {
      totalSessions,
      verifiedSessions,
      deniedSessions,
      uniqueAgents,
      uniqueHumans,
    },
  });
}

export default function Index() {
  const { events, stats } = useLoaderData<typeof loader>();

  return (
    <Page title="Attest — Agent Traffic">
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <p>
              Attest detects and verifies agent sessions at your checkout.
              Verified agents are matched to your existing customers.
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Agent Sessions
              </Text>
              <Text as="p" variant="headingXl">
                {stats.totalSessions}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Unique Agents
              </Text>
              <Text as="p" variant="headingXl">
                {stats.uniqueAgents}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Unique Customers
              </Text>
              <Text as="p" variant="headingXl">
                {stats.uniqueHumans}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Recent Agent Activity
              </Text>
              {events.length === 0 ? (
                <EmptyState
                  heading="No agent traffic yet"
                  image=""
                >
                  <p>
                    When agents interact with your store, their verified sessions
                    will appear here.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Agent", "Runtime", "Customer", "Scope", "Status"]}
                  rows={events.slice(0, 20).map((event) => [
                    event.agent_id,
                    event.runtime_issuer,
                    event.human_email || event.human_principal_id,
                    event.scope.join(", "),
                    event.action,
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
