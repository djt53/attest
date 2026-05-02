import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Select,
  Button,
  Banner,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { useState, useCallback } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const merchantId = process.env.SHOPIFY_SHOP_DOMAIN || "demo-store.myshopify.com";

  // TODO: Load from database
  return json({
    merchantId,
    settings: {
      default_action: "allow",
      fail_open: true,
      notification_email: "",
      webhook_url: "",
    },
    api_key_prefix: "att_live_abc...",
    plan: "free",
    sessions_this_month: 0,
    session_limit: 1000,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_settings") {
    // TODO: Persist settings to database
    return json({ saved: true });
  }

  if (intent === "rotate_key") {
    // TODO: Generate new API key, invalidate old one
    return json({ new_key: "att_live_new..." });
  }

  return json({ ok: true });
}

export default function Settings() {
  const { merchantId, settings, api_key_prefix, plan, sessions_this_month, session_limit } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();

  const [defaultAction, setDefaultAction] = useState(settings.default_action);
  const [failOpen, setFailOpen] = useState(settings.fail_open ? "true" : "false");
  const [notificationEmail, setNotificationEmail] = useState(settings.notification_email);
  const [webhookUrl, setWebhookUrl] = useState(settings.webhook_url);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "save_settings");
    formData.set("default_action", defaultAction);
    formData.set("fail_open", failOpen);
    formData.set("notification_email", notificationEmail);
    formData.set("webhook_url", webhookUrl);
    submit(formData, { method: "post" });
  }, [defaultAction, failOpen, notificationEmail, webhookUrl, submit]);

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Plan & Usage
              </Text>
              <InlineStack gap="400" align="start">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Current Plan
                  </Text>
                  <Badge tone={plan === "free" ? "info" : "success"}>
                    {plan.charAt(0).toUpperCase() + plan.slice(1)}
                  </Badge>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Sessions This Month
                  </Text>
                  <Text as="p" variant="headingMd">
                    {sessions_this_month} / {session_limit.toLocaleString()}
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Default Agent Policy
              </Text>
              <Select
                label="Default action for verified agents"
                options={[
                  { label: "Allow (recommended)", value: "allow" },
                  { label: "Route to manual review", value: "review" },
                  { label: "Block all agents", value: "deny" },
                ]}
                value={defaultAction}
                onChange={setDefaultAction}
                helpText="This applies when no specific policy matches. You can add per-agent policies on the Policies page."
              />
              <Select
                label="When Attest is unavailable"
                options={[
                  {
                    label: "Fail open — allow checkout to proceed (recommended)",
                    value: "true",
                  },
                  {
                    label: "Fail closed — block unverified agent sessions",
                    value: "false",
                  },
                ]}
                value={failOpen}
                onChange={setFailOpen}
                helpText="Controls behavior when the Attest verification service is unreachable."
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Notifications
              </Text>
              <TextField
                label="Notification email"
                type="email"
                value={notificationEmail}
                onChange={setNotificationEmail}
                placeholder="ops@your-store.com"
                helpText="Receive alerts when agent traffic spikes or policies block sessions"
                autoComplete="email"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Identity Resolution
              </Text>
              <TextField
                label="Custom resolution webhook"
                type="url"
                value={webhookUrl}
                onChange={setWebhookUrl}
                placeholder="https://your-store.com/api/resolve-customer"
                helpText="Optional: Attest will POST to this URL to resolve agent human principals to your customer records. If not set, email matching is used."
                autoComplete="url"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                API Key
              </Text>
              <Banner tone="warning">
                <p>
                  Your API key prefix: <strong>{api_key_prefix}</strong>
                </p>
                <p>
                  The full key was shown when you installed the app. If you need
                  a new key, rotate it below (the old key will stop working
                  immediately).
                </p>
              </Banner>
              <Button
                tone="critical"
                onClick={() => {
                  const formData = new FormData();
                  formData.set("intent", "rotate_key");
                  submit(formData, { method: "post" });
                }}
              >
                Rotate API Key
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineStack align="end">
            <Button variant="primary" onClick={handleSave}>
              Save Settings
            </Button>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
