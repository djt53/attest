import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "@remix-run/react";
import { getSessionFromRequest, requestMagicLink } from "~/lib/session.server";
import { getActiveGrants, getConsentHistory, revokeGrant } from "~/lib/attest.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    return json({ authenticated: false, error, grants: [], events: [] });
  }

  const [grants, events] = await Promise.all([
    getActiveGrants(session.humanPrincipalId),
    getConsentHistory(session.humanPrincipalId),
  ]);

  return json({
    authenticated: true,
    email: session.email,
    humanPrincipalId: session.humanPrincipalId,
    grants,
    events,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "request_link") {
    const email = formData.get("email") as string;
    if (email) {
      // Use email as human principal ID for now
      await requestMagicLink(email, email);
      return json({ link_sent: true });
    }
  }

  if (intent === "revoke") {
    const grantId = formData.get("grant_id") as string;
    await revokeGrant(grantId);
  }

  return json({ ok: true });
}

export default function ConsentPortal() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();

  if (!data.authenticated) {
    return (
      <div className="max-w-md mx-auto py-20">
        <h1 className="text-2xl font-bold mb-2">Review Your Agent Permissions</h1>
        <p className="text-gray-600 mb-8">
          Enter your email to receive a magic link and view which agents have
          acted on your behalf.
        </p>

        {data.error === "invalid_token" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-sm text-red-700">
            That link has expired or already been used. Please request a new one.
          </div>
        )}

        <Form method="post">
          <input type="hidden" name="intent" value="request_link" />
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email address
              </label>
              <input
                type="email"
                name="email"
                id="email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="alice@example.com"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              Send Magic Link
            </button>
          </div>
        </Form>

        <p className="text-xs text-gray-400 mt-6 text-center">
          We'll send a secure link to your email. No password needed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Agent Permissions</h1>
          <p className="text-gray-600 mt-1">
            Signed in as <span className="font-medium">{data.email}</span>
          </p>
        </div>
        <Form method="post" action="/auth/logout">
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </Form>
      </div>

      {/* Active Grants */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Active Permissions</h2>
        {data.grants.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
            No active agent permissions.
          </div>
        ) : (
          <div className="space-y-3">
            {data.grants.map((grant: any) => (
              <div
                key={grant.id}
                className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">
                    {grant.merchant_name ||
                      grant.merchant_external_id ||
                      "Unknown Merchant"}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {grant.runtime_issuer ? (
                      <span>
                        Agent: {grant.agent_id || "Any"} via{" "}
                        {grant.runtime_issuer}
                      </span>
                    ) : (
                      <span>All agents</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    Scope: {grant.scope.join(", ")}
                    {grant.expires_at && (
                      <>
                        {" "}
                        &middot; Expires{" "}
                        {new Date(grant.expires_at).toLocaleDateString()}
                      </>
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
        {data.events.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
            No agent activity recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {data.events.map((event: any) => (
              <div
                key={event.id}
                className="p-4 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm">
                    <span className="font-medium">{event.agent_id}</span>
                    <span className="text-gray-400">
                      {" "}
                      via {event.runtime_issuer}
                    </span>
                    {event.merchant_name && (
                      <span className="text-gray-400">
                        {" "}
                        at {event.merchant_name}
                      </span>
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
