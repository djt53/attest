import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useSubmit } from "@remix-run/react";
import { useState, useCallback } from "react";
import { requireSession } from "~/lib/session.server";
import { getPolicies, createPolicy, deletePolicy } from "~/lib/api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireSession(request);
  const policies = await getPolicies(session.merchantId, session.apiKey);
  return json({ policies });
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await requireSession(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    await createPolicy(session.merchantId, session.apiKey, {
      runtime_issuer: (formData.get("runtime_issuer") as string) || undefined,
      agent_id: (formData.get("agent_id") as string) || undefined,
      action: (formData.get("action") as string) || "allow",
      priority: parseInt((formData.get("priority") as string) || "0"),
    });
  } else if (intent === "delete") {
    await deletePolicy(
      session.merchantId,
      session.apiKey,
      formData.get("policy_id") as string
    );
  }

  return json({ ok: true });
}

export default function Policies() {
  const { policies } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Policies</h1>
          <p className="text-gray-500 mt-1">
            Control how agents interact with your store
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          Add Policy
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        Policies control access for verified agents. Higher priority rules are evaluated first.
        If no policy matches, verified agents are <strong>allowed</strong> by default.
        Unverified (detected-only) agents always receive guest-level access regardless of policies.
      </div>

      {/* Add policy form */}
      {showForm && (
        <Form
          method="post"
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
          onSubmit={() => setShowForm(false)}
        >
          <input type="hidden" name="intent" value="create" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Runtime (blank = all)
              </label>
              <input
                type="text"
                name="runtime_issuer"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., anthropic"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Agent ID (blank = all)
              </label>
              <input
                type="text"
                name="agent_id"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., shopping-agent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Action
              </label>
              <select
                name="action"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="step_up">Require step-up auth</option>
                <option value="review">Route to review</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <input
                type="number"
                name="priority"
                defaultValue="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Create Policy
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-gray-600 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </Form>
      )}

      {/* Policy list */}
      {policies.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          <p className="mb-2">No policies configured</p>
          <p className="text-sm">All verified agents are allowed by default.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Runtime</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {policies.map((p: any) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{p.runtime_issuer || "All"}</td>
                  <td className="px-4 py-3">{p.agent_id || "All"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        p.action === "allow"
                          ? "bg-green-100 text-green-700"
                          : p.action === "deny"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {p.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.priority}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("intent", "delete");
                        fd.set("policy_id", p.id);
                        submit(fd, { method: "post" });
                      }}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
