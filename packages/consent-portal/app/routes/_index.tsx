import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { getActiveGrants, getConsentHistory, revokeGrant } from "~/lib/attest.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const humanId = url.searchParams.get("id");

  if (!humanId) {
    return json({ authenticated: false, grants: [], events: [] });
  }

  // TODO: Replace with magic-link session validation
  const [grants, events] = await Promise.all([
    getActiveGrants(humanId),
    getConsentHistory(humanId),
  ]);

  return json({ authenticated: true, humanId, grants, events });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "revoke") {
    const grantId = formData.get("grant_id") as string;
    await revokeGrant(grantId);
  }

  return json({ ok: true });
}

export default function ConsentPortal() {
  const { authenticated, grants, events } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-4">Review Your Agent Permissions</h1>
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          Check what agents have accessed on your behalf and manage your permissions
          across merchants.
        </p>
        <p className="text-gray-500 text-sm">
          Use the link from your email to access your permissions dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Your Agent Permissions</h1>
        <p className="text-gray-600 mt-1">
          Manage which agents can act on your behalf at each merchant.
        </p>
      </div>

      {/* Active Grants */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Active Permissions</h2>
        {grants.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
            No active agent permissions.
          </div>
        ) : (
          <div className="space-y-3">
            {grants.map((grant: any) => (
              <div
                key={grant.id}
                className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">
                    {grant.merchant_name || grant.merchant_external_id || "Unknown Merchant"}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {grant.runtime_issuer ? (
                      <span>
                        Agent: {grant.agent_id || "Any"} via {grant.runtime_issuer}
                      </span>
                    ) : (
                      <span>All agents</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    Scope: {grant.scope.join(", ")}
                    {grant.expires_at && (
                      <> &middot; Expires {new Date(grant.expires_at).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("intent", "revoke");
                    formData.set("grant_id", grant.id);
                    submit(formData, { method: "post" });
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Activity History */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Activity History</h2>
        {events.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
            No agent activity recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {events.map((event: any) => (
              <div key={event.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm">
                    <span className="font-medium">{event.agent_id}</span>
                    <span className="text-gray-400"> via {event.runtime_issuer}</span>
                    {event.merchant_name && (
                      <span className="text-gray-400"> at {event.merchant_name}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {event.scope.join(", ")} &middot;{" "}
                    {new Date(event.created_at).toLocaleString()}
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
      </section>
    </div>
  );
}
