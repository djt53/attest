/**
 * Payment Detail View
 *
 * Renders in the Stripe Dashboard on individual payment pages.
 * Shows whether the payment was agent-assisted and the verification details.
 */
import {
  Box,
  Badge,
  Banner,
  Divider,
  Inline,
  List,
  ListItem,
  ContextView,
} from "@stripe/ui-extension-sdk/ui";
import type { ExtensionContextValue } from "@stripe/ui-extension-sdk/context";

interface AttestMetadata {
  attest_verified?: string;
  attest_runtime?: string;
  attest_agent?: string;
  attest_human_id?: string;
  attest_human_email?: string;
  attest_customer_matched?: string;
  attest_customer_id?: string;
  attest_policy_action?: string;
  attest_consent_id?: string;
}

const PaymentDetailView = ({
  environment,
  userContext,
}: ExtensionContextValue) => {
  // In a real app, we'd fetch the payment intent metadata
  // via the Stripe API using environment.objectContext
  const metadata: AttestMetadata = {};
  const hasAttestation = metadata.attest_verified !== undefined;

  if (!hasAttestation) {
    return (
      <ContextView title="Agent Identity">
        <Box css={{ padding: "medium" }}>
          <Banner
            type="default"
            title="No agent attestation"
            description="This payment was not initiated by a verified agent."
          />
        </Box>
      </ContextView>
    );
  }

  const isVerified = metadata.attest_verified === "true";
  const isCustomerMatched = metadata.attest_customer_matched === "true";

  return (
    <ContextView title="Agent Identity">
      <Box css={{ padding: "medium", stack: "y", gap: "medium" }}>
        {/* Verification status */}
        <Inline css={{ gap: "small", align: "center" }}>
          <Badge type={isVerified ? "positive" : "negative"}>
            {isVerified ? "Verified" : "Unverified"}
          </Badge>
          {metadata.attest_policy_action && (
            <Badge
              type={
                metadata.attest_policy_action === "allow"
                  ? "positive"
                  : metadata.attest_policy_action === "deny"
                    ? "negative"
                    : "warning"
              }
            >
              {metadata.attest_policy_action}
            </Badge>
          )}
        </Inline>

        <Divider />

        {/* Agent details */}
        <List>
          {metadata.attest_runtime && (
            <ListItem
              title={<Box>Runtime</Box>}
              secondaryTitle={<Box>{metadata.attest_runtime}</Box>}
            />
          )}
          {metadata.attest_agent && (
            <ListItem
              title={<Box>Agent</Box>}
              secondaryTitle={<Box>{metadata.attest_agent}</Box>}
            />
          )}
          {metadata.attest_human_email && (
            <ListItem
              title={<Box>Customer Email</Box>}
              secondaryTitle={<Box>{metadata.attest_human_email}</Box>}
            />
          )}
          {metadata.attest_human_id && (
            <ListItem
              title={<Box>Principal ID</Box>}
              secondaryTitle={<Box>{metadata.attest_human_id}</Box>}
            />
          )}
        </List>

        {/* Customer resolution */}
        {isCustomerMatched && (
          <>
            <Divider />
            <Banner
              type="positive"
              title="Customer matched"
              description={`Resolved to customer ${metadata.attest_customer_id || "unknown"}`}
            />
          </>
        )}

        {/* Consent */}
        {metadata.attest_consent_id && (
          <Box css={{ font: "caption", color: "secondary" }}>
            Consent ID: {metadata.attest_consent_id}
          </Box>
        )}
      </Box>
    </ContextView>
  );
};

export default PaymentDetailView;
