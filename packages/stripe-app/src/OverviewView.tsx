/**
 * Overview View
 *
 * Renders in the Stripe Dashboard home page.
 * Shows aggregate agent traffic stats for the merchant.
 */
import {
  Box,
  Badge,
  Banner,
  Divider,
  Inline,
  ContextView,
} from "@stripe/ui-extension-sdk/ui";
import type { ExtensionContextValue } from "@stripe/ui-extension-sdk/context";
import { useState, useEffect } from "react";

interface TrafficSummary {
  total_sessions: number;
  verified_sessions: number;
  denied_sessions: number;
  unique_agents: number;
  unique_humans: number;
  unique_runtimes: number;
}

const ATTEST_API_URL = "https://api.attest.dev";

const OverviewView = ({
  environment,
  userContext,
}: ExtensionContextValue) => {
  const [stats, setStats] = useState<TrafficSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        // In production, get merchant ID from the Stripe Connect account
        const merchantId = `stripe:${environment.mode}`;
        const response = await fetch(
          `${ATTEST_API_URL}/v0/merchants/${encodeURIComponent(merchantId)}/analytics/summary?days=30`
        );

        if (response.ok) {
          setStats(await response.json());
        } else {
          setError("Unable to load agent traffic data");
        }
      } catch {
        setError("Connection to Attest API failed");
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [environment.mode]);

  if (loading) {
    return (
      <ContextView title="Agent Traffic — Attest">
        <Box css={{ padding: "medium" }}>
          <Banner type="default" title="Loading agent traffic data..." />
        </Box>
      </ContextView>
    );
  }

  if (error || !stats) {
    return (
      <ContextView title="Agent Traffic — Attest">
        <Box css={{ padding: "medium" }}>
          <Banner
            type="caution"
            title="Setup required"
            description="Connect your Attest account to see agent traffic analytics. Visit attest.dev to get started."
          />
        </Box>
      </ContextView>
    );
  }

  const verifyRate =
    stats.total_sessions > 0
      ? Math.round((stats.verified_sessions / stats.total_sessions) * 100)
      : 0;

  return (
    <ContextView title="Agent Traffic — Attest">
      <Box css={{ padding: "medium", stack: "y", gap: "medium" }}>
        {/* Summary stats */}
        <Inline css={{ gap: "large", distribute: "space-between" }}>
          <Box css={{ stack: "y", gap: "xxsmall" }}>
            <Box css={{ font: "caption", color: "secondary" }}>
              Agent Sessions (30d)
            </Box>
            <Box css={{ font: "heading", fontWeight: "bold" }}>
              {stats.total_sessions.toLocaleString()}
            </Box>
          </Box>
          <Box css={{ stack: "y", gap: "xxsmall" }}>
            <Box css={{ font: "caption", color: "secondary" }}>
              Verification Rate
            </Box>
            <Box css={{ font: "heading", fontWeight: "bold" }}>
              {verifyRate}%
            </Box>
          </Box>
          <Box css={{ stack: "y", gap: "xxsmall" }}>
            <Box css={{ font: "caption", color: "secondary" }}>
              Unique Agents
            </Box>
            <Box css={{ font: "heading", fontWeight: "bold" }}>
              {stats.unique_agents}
            </Box>
          </Box>
        </Inline>

        <Divider />

        {/* Breakdown */}
        <Inline css={{ gap: "small" }}>
          <Badge type="positive">
            {stats.verified_sessions} verified
          </Badge>
          <Badge type="negative">
            {stats.denied_sessions} denied
          </Badge>
          <Badge type="default">
            {stats.unique_humans} customers
          </Badge>
          <Badge type="default">
            {stats.unique_runtimes} runtimes
          </Badge>
        </Inline>

        {stats.total_sessions === 0 && (
          <Banner
            type="default"
            title="No agent traffic yet"
            description="When agents make purchases through your Stripe checkout, their verified sessions will appear here."
          />
        )}
      </Box>
    </ContextView>
  );
};

export default OverviewView;
