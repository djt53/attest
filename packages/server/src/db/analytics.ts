import { requireDb } from "./connection.js";

export interface TrafficSummary {
  total_sessions: number;
  verified_sessions: number;
  denied_sessions: number;
  unique_agents: number;
  unique_humans: number;
  unique_runtimes: number;
}

export interface TrafficByDay {
  date: string;
  total: number;
  verified: number;
  denied: number;
}

export interface TopAgent {
  runtime_issuer: string;
  agent_id: string;
  session_count: number;
  last_seen: string;
}

export async function getTrafficSummary(
  merchantId: string,
  days: number = 30
): Promise<TrafficSummary> {
  const db = requireDb();
  const [row] = await db`
    SELECT
      COUNT(*)::int as total_sessions,
      COUNT(*) FILTER (WHERE action = 'verified')::int as verified_sessions,
      COUNT(*) FILTER (WHERE action = 'denied')::int as denied_sessions,
      COUNT(DISTINCT agent_id)::int as unique_agents,
      COUNT(DISTINCT human_principal_id)::int as unique_humans,
      COUNT(DISTINCT runtime_issuer)::int as unique_runtimes
    FROM consent_events
    WHERE merchant_id = ${merchantId}
      AND created_at > now() - interval '1 day' * ${days}
  `;
  return row as unknown as TrafficSummary;
}

export async function getTrafficByDay(
  merchantId: string,
  days: number = 30
): Promise<TrafficByDay[]> {
  const db = requireDb();
  const rows = await db`
    SELECT
      DATE(created_at) as date,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE action = 'verified')::int as verified,
      COUNT(*) FILTER (WHERE action = 'denied')::int as denied
    FROM consent_events
    WHERE merchant_id = ${merchantId}
      AND created_at > now() - interval '1 day' * ${days}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `;
  return rows as unknown as TrafficByDay[];
}

export async function getTopAgents(
  merchantId: string,
  limit: number = 10
): Promise<TopAgent[]> {
  const db = requireDb();
  const rows = await db`
    SELECT
      runtime_issuer,
      agent_id,
      COUNT(*)::int as session_count,
      MAX(created_at)::text as last_seen
    FROM consent_events
    WHERE merchant_id = ${merchantId}
    GROUP BY runtime_issuer, agent_id
    ORDER BY session_count DESC
    LIMIT ${limit}
  `;
  return rows as unknown as TopAgent[];
}

export interface ScopeBreakdown {
  scope: string;
  count: number;
}

export async function getScopeBreakdown(
  merchantId: string,
  days: number = 30
): Promise<ScopeBreakdown[]> {
  const db = requireDb();
  const rows = await db`
    SELECT
      unnest(scope) as scope,
      COUNT(*)::int as count
    FROM consent_events
    WHERE merchant_id = ${merchantId}
      AND created_at > now() - interval '1 day' * ${days}
    GROUP BY unnest(scope)
    ORDER BY count DESC
  `;
  return rows as unknown as ScopeBreakdown[];
}
