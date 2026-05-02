import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { createSession } from "~/lib/session.server";

const ATTEST_API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "login") {
    const apiKey = (formData.get("api_key") as string)?.trim();
    if (!apiKey?.startsWith("att_")) {
      return json({ error: "API key must start with att_" });
    }

    // Validate the key by calling the API
    // For now, just extract merchant info
    // TODO: Add a /v0/auth/key-info endpoint
    return redirect("/", {
      headers: {
        "Set-Cookie": await createSession({
          apiKey,
          merchantId: (formData.get("merchant_id") as string)?.trim() || "unknown",
          merchantName: (formData.get("merchant_name") as string)?.trim() || "My Store",
        }),
      },
    });
  }

  if (intent === "signup") {
    const res = await fetch(`${ATTEST_API_URL}/v0/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_name: formData.get("merchant_name"),
        merchant_domain: formData.get("merchant_domain"),
        contact_email: formData.get("contact_email"),
        platform: "custom",
      }),
    });

    if (!res.ok) {
      return json({ error: "Failed to create account" });
    }

    const data = await res.json();

    return redirect("/", {
      headers: {
        "Set-Cookie": await createSession({
          apiKey: data.api_key.key,
          merchantId: data.merchant.external_id,
          merchantName: data.merchant.name,
        }),
      },
    });
  }

  return json({ error: "Unknown action" });
}

export default function Login() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h1 className="text-2xl font-bold">Attest Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Agent identity resolution for your store
          </p>
        </div>

        {actionData?.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {actionData.error}
          </div>
        )}

        {/* Login with existing key */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">Sign in with API key</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="login" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                name="api_key"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="att_live_..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Merchant ID (domain)
              </label>
              <input
                type="text"
                name="merchant_id"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="cool-store.com"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700"
            >
              Sign In
            </button>
          </Form>
        </div>

        {/* Create new account */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold mb-4">Create a new account</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="signup" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Store Name
              </label>
              <input
                type="text"
                name="merchant_name"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Cool Store"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Domain
              </label>
              <input
                type="text"
                name="merchant_domain"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="cool-store.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="contact_email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="ops@cool-store.com"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg font-medium hover:bg-gray-800"
            >
              Create Account
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
