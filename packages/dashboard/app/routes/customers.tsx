import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { requireSession } from "~/lib/session.server";
import { importCustomers } from "~/lib/api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireSession(request);
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await requireSession(request);
  const formData = await request.formData();
  const csvText = formData.get("csv") as string;

  if (!csvText?.trim()) {
    return json({ error: "No data provided" });
  }

  // Parse CSV (simple: email,name,customer_id,tier)
  const lines = csvText.trim().split("\n");
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const emailIdx = header.indexOf("email");
  const nameIdx = header.indexOf("name");
  const idIdx = header.findIndex((h) => h.includes("id") || h.includes("customer"));
  const tierIdx = header.indexOf("tier");

  if (emailIdx === -1) {
    return json({ error: "CSV must have an 'email' column" });
  }

  const customers = lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      email: cols[emailIdx],
      name: nameIdx >= 0 ? cols[nameIdx] : undefined,
      external_customer_id: idIdx >= 0 ? cols[idIdx] : undefined,
      tier: tierIdx >= 0 ? cols[tierIdx] : undefined,
    };
  }).filter((c) => c.email);

  if (customers.length === 0) {
    return json({ error: "No valid customers found in CSV" });
  }

  // Import in batches of 1000
  let totalSynced = 0;
  let totalFailed = 0;
  for (let i = 0; i < customers.length; i += 1000) {
    const batch = customers.slice(i, i + 1000);
    const result = await importCustomers(session.merchantId, session.apiKey, batch);
    totalSynced += result.imported || 0;
    totalFailed += result.failed || 0;
  }

  return json({ success: true, imported: totalSynced, failed: totalFailed, total: customers.length });
}

export default function Customers() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Customer Import</h1>
        <p className="text-gray-500 mt-1">
          Import your customer database so Attest can resolve agent sessions
          to existing customers
        </p>
      </div>

      {actionData?.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
          Imported {actionData.imported} of {actionData.total} customers.
          {actionData.failed > 0 && ` ${actionData.failed} failed.`}
        </div>
      )}

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {actionData.error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold mb-4">Upload CSV</h2>
        <p className="text-gray-600 text-sm mb-4">
          Upload a CSV with columns: <code className="bg-gray-100 px-1.5 py-0.5 rounded">email</code> (required),{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded">name</code>,{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded">customer_id</code>,{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded">tier</code>
        </p>
        <Form method="post">
          <textarea
            name="csv"
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
            placeholder={`email,name,customer_id,tier\nalice@example.com,Alice Smith,cust_123,vip\nbob@example.com,Bob Jones,cust_456,`}
          />
          <button
            type="submit"
            className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Import Customers
          </button>
        </Form>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="font-semibold mb-2">How identity resolution works</h3>
        <ul className="text-sm text-gray-600 space-y-2">
          <li>
            When a verified agent presents an attestation with an email,
            Attest matches it against your imported customer database.
          </li>
          <li>
            Matched customers get their loyalty tier, name, and ID returned
            to your application so you can apply personalized pricing and
            preferences.
          </li>
          <li>
            You can also set up a custom webhook for resolution — configure
            this in <a href="/settings" className="text-indigo-600 underline">Settings</a>.
          </li>
        </ul>
      </div>
    </div>
  );
}
