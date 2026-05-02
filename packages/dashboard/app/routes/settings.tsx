import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { requireSession } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireSession(request);
  return json({ session });
}

export default function Settings() {
  const { session } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Account info */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold mb-4">Account</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Merchant ID</dt>
            <dd className="font-mono">{session.merchantId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">API Key</dt>
            <dd className="font-mono">{session.apiKey.slice(0, 16)}...</dd>
          </div>
        </dl>
      </div>

      {/* Challenge configuration */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold mb-4">Challenge Configuration</h2>
        <p className="text-gray-600 text-sm mb-4">
          These benefits are advertised to agents in the <code className="bg-gray-100 px-1.5 py-0.5 rounded">WWW-Attest</code> challenge header.
          Agents that attest receive these benefits.
        </p>
        <div className="space-y-2">
          {[
            { id: "loyalty_pricing", label: "Loyalty pricing", desc: "Apply customer's tier pricing" },
            { id: "real_time_inventory", label: "Real-time inventory", desc: "Live stock levels instead of cached" },
            { id: "skip_captcha", label: "Skip CAPTCHA", desc: "No bot challenges for verified agents" },
            { id: "full_catalog", label: "Full catalog", desc: "Access member-only products" },
            { id: "relaxed_rate_limit", label: "Relaxed rate limits", desc: "600/min vs 60/min" },
            { id: "personalization", label: "Personalization", desc: "Recommendations from purchase history" },
          ].map((benefit) => (
            <label key={benefit.id} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
              <input type="checkbox" defaultChecked className="mt-0.5 rounded border-gray-300" />
              <div>
                <div className="text-sm font-medium">{benefit.label}</div>
                <div className="text-xs text-gray-500">{benefit.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Webhook */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold mb-4">Identity Resolution Webhook</h2>
        <p className="text-gray-600 text-sm mb-4">
          Optional: if set, Attest will POST to this URL to resolve agent
          human principals to your customer records, in addition to email matching.
        </p>
        <input
          type="url"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="https://your-store.com/api/resolve-customer"
        />
      </div>

      {/* Danger zone */}
      <div className="bg-white border border-red-200 rounded-lg p-6">
        <h2 className="font-semibold text-red-700 mb-4">Danger Zone</h2>
        <Form method="post" action="/logout">
          <button
            type="submit"
            className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50"
          >
            Sign Out
          </button>
        </Form>
      </div>
    </div>
  );
}
