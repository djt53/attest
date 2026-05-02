/**
 * Shopify Checkout UI Extension
 *
 * Renders in the checkout flow to display agent verification status
 * to the customer. This is the consumer-facing surface that shows
 * "An agent is acting on your behalf" with verification details.
 */
import {
  reactExtension,
  Banner,
  BlockStack,
  Text,
  InlineStack,
  Icon,
  useExtensionApi,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension("purchase.checkout.block.render", () => (
  <AgentVerificationBanner />
));

function AgentVerificationBanner() {
  const { sessionToken } = useExtensionApi();

  // In production, this would:
  // 1. Check for Agent-Attestation in the session metadata
  // 2. Call the Attest API to verify
  // 3. Display the result to the customer

  // For now, render a placeholder that the app backend populates
  // via metafields when an agent session is detected

  return (
    <Banner status="info" title="Agent-Assisted Checkout">
      <BlockStack spacing="tight">
        <Text>
          This checkout is being assisted by a verified agent.
        </Text>
        <InlineStack spacing="tight">
          <Text appearance="subdued" size="small">
            You authorized this agent to act on your behalf.
          </Text>
        </InlineStack>
        <Text appearance="subdued" size="small">
          Review your agent permissions at consent.attest.dev
        </Text>
      </BlockStack>
    </Banner>
  );
}
