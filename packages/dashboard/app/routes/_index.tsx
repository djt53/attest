import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireSession } from "~/lib/session.server";
import { getAnalyticsSummary, getEvents } from "~/lib/api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireSession(request);

  const [summary, events] = await Promise.all([
    getAnalyticsSummary(session.merchantId, session.apiKey),
    getEvents(session.merchantId, session.apiKey, 10),
  ]);

  return json({ session, summary, events });
}

export default function Overview() {
  const { session, summary, events } = useLoaderData<typeof loader>();

  const stats = summary || {
    total_sessions: 0,
    verified_sessions: 0,
    denied_sessions: 0,
    unique_agents: 0,
    unique_humans: 0,
    unique_runtimes: 0,
  };

  const verifyRate =
    stats.total_sessions > 0
      ? Math.round((stats.verified_sessions / stats.total_sessions) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Agent Traffic Overview</h1>
        <p className="text-gray-500 mt-1">{session.merchantName} — Last 30 days</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Agent Sessions" value={stats.total_sessions} />
        <StatCard label="Verification Rate" value={`${verifyRate}%`} />
        <StatCard label="Unique Agents" value={stats.unique_agents} />
        <StatCard label="Customers Identified" value={stats.unique_humans} />
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{stats.verified_sessions}</div>
          <div className="text-sm text-green-600">Verified</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{stats.denied_sessions}</div>
          <div className="text-sm text-red-600">Denied</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">{stats.unique_runtimes}</div>
          <div className="text-sm text-blue-600">Runtimes</div>
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        {events.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            <p className="text-lg font-medium mb-2">No agent traffic yet</p>
            <p className="text-sm">
              Go to the <a href="/integrate" className="text-indigo-600 underline">Integrate</a> tab
              to set up agent detection on your site.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {events.map((event: any) => (
              <div key={event.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm">
                    <span className="font-medium">{event.agent_id}</span>
                    <span className="text-gray-400"> via {event.runtime_issuer}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {event.human_email || event.human_principal_id} &middot;{" "}
                    {event.scope?.join(", ")}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    event.action === "verified"
                      ? "bg-green-100 text-green-700"
                      : event.action === "denied"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {event.action}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
