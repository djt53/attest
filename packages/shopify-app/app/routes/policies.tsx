import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  DataTable,
  EmptyState,
  Modal,
  TextField,
  Select,
  FormLayout,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { getPolicies, createPolicy, deletePolicy } from "~/lib/attest.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const merchantId = process.env.SHOPIFY_SHOP_DOMAIN || "demo-store.myshopify.com";
  const policies = await getPolicies(merchantId);
  return json({ policies, merchantId });
}

export async function action({ request }: ActionFunctionArgs) {
  const merchantId = process.env.SHOPIFY_SHOP_DOMAIN || "demo-store.myshopify.com";
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    await createPolicy(merchantId, {
      runtime_issuer: (formData.get("runtime_issuer") as string) || undefined,
      agent_id: (formData.get("agent_id") as string) || undefined,
      action: (formData.get("action") as string) || "allow",
      priority: parseInt((formData.get("priority") as string) || "0"),
    });
  } else if (intent === "delete") {
    const policyId = formData.get("policy_id") as string;
    await deletePolicy(merchantId, policyId);
  }

  return json({ ok: true });
}

export default function Policies() {
  const { policies } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [modalOpen, setModalOpen] = useState(false);
  const [runtimeIssuer, setRuntimeIssuer] = useState("");
  const [agentId, setAgentId] = useState("");
  const [action, setAction] = useState("allow");
  const [priority, setPriority] = useState("0");

  const handleCreate = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("runtime_issuer", runtimeIssuer);
    formData.set("agent_id", agentId);
    formData.set("action", action);
    formData.set("priority", priority);
    submit(formData, { method: "post" });
    setModalOpen(false);
    setRuntimeIssuer("");
    setAgentId("");
    setAction("allow");
    setPriority("0");
  }, [runtimeIssuer, agentId, action, priority, submit]);

  const handleDelete = useCallback(
    (policyId: string) => {
      const formData = new FormData();
      formData.set("intent", "delete");
      formData.set("policy_id", policyId);
      submit(formData, { method: "post" });
    },
    [submit]
  );

  return (
    <Page
      title="Agent Policies"
      primaryAction={{
        content: "Add policy",
        onAction: () => setModalOpen(true),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Agent Access Rules
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Policies control how verified agents interact with your store.
                Higher priority rules are evaluated first.
                If no policy matches, verified agents are allowed by default.
              </Text>
              {policies.length === 0 ? (
                <EmptyState
                  heading="No policies configured"
                  image=""
                  action={{
                    content: "Add your first policy",
                    onAction: () => setModalOpen(true),
                  }}
                >
                  <p>
                    All verified agents are currently allowed. Add policies to
                    control access per runtime or agent.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric", "text"]}
                  headings={["Runtime", "Agent", "Action", "Priority", ""]}
                  rows={policies.map((p) => [
                    p.runtime_issuer || "All",
                    p.agent_id || "All",
                    p.action,
                    p.priority,
                    <Button
                      key={p.id}
                      tone="critical"
                      variant="plain"
                      onClick={() => handleDelete(p.id)}
                    >
                      Remove
                    </Button>,
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Agent Policy"
        primaryAction={{ content: "Create", onAction: handleCreate }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Runtime (leave blank for all)"
              value={runtimeIssuer}
              onChange={setRuntimeIssuer}
              placeholder="e.g., anthropic"
              autoComplete="off"
            />
            <TextField
              label="Agent ID (leave blank for all)"
              value={agentId}
              onChange={setAgentId}
              placeholder="e.g., claude-shopping-agent"
              autoComplete="off"
            />
            <Select
              label="Action"
              options={[
                { label: "Allow", value: "allow" },
                { label: "Deny", value: "deny" },
                { label: "Require step-up auth", value: "step_up" },
                { label: "Route to review", value: "review" },
              ]}
              value={action}
              onChange={setAction}
            />
            <TextField
              label="Priority"
              type="number"
              value={priority}
              onChange={setPriority}
              helpText="Higher priority rules are evaluated first"
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
