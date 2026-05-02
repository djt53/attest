import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireSession } from "~/lib/session.server";
import { generateDiscoveryJson } from "~/lib/api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireSession(request);
  const discoveryJson = generateDiscoveryJson(session.merchantId);
  return json({ session, discoveryJson });
}

export default function Integrate() {
  const { session, discoveryJson } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Integration Guide</h1>
        <p className="text-gray-500 mt-1">
          Get agent detection and identity resolution running on your site
        </p>
      </div>

      {/* Step 1 */}
      <Section number={1} title="Install the SDK">
        <CodeBlock language="bash" code="npm install @attest/sdk" />
      </Section>

      {/* Step 2 */}
      <Section number={2} title="Add the middleware">
        <p className="text-gray-600 mb-3">
          Add 3 lines to your Express/Connect app. This handles agent detection,
          challenges, and attestation verification automatically.
        </p>
        <CodeBlock
          language="typescript"
          code={`import { attest } from "@attest/sdk/express";

app.use(attest({
  apiKey: "${session.apiKey.slice(0, 16)}...",
  merchantId: "${session.merchantId}",
}));`}
        />
      </Section>

      {/* Step 3 */}
      <Section number={3} title="Use the context in your routes">
        <p className="text-gray-600 mb-3">
          Every request now has <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">req.attest</code> with
          detection results, verification status, customer match, and benefit tier.
        </p>
        <CodeBlock
          language="typescript"
          code={`app.get("/products", (req, res) => {
  if (req.attest.isAgent) {
    console.log("Agent detected:", req.attest.runtime);
    console.log("Tier:", req.attest.tier);
    // "detected" = unattested, "verified" = attested
  }

  if (req.attest.verified) {
    console.log("Customer:", req.attest.customer);
    // Apply loyalty pricing, personalization, etc.
    if (req.attest.benefits.loyaltyPricing) {
      // Use customer's tier pricing
    }
  }

  // Respond normally — detected agents get guest access,
  // verified agents get elevated access, humans get full access
});`}
        />
      </Section>

      {/* Step 4 */}
      <Section number={4} title="Publish the discovery endpoint (optional)">
        <p className="text-gray-600 mb-3">
          Let agent runtimes discover your attestation support before browsing.
          Serve this JSON at <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">
          https://{session.merchantId}/.well-known/attest.json</code>
        </p>
        <CodeBlock
          language="json"
          code={JSON.stringify(discoveryJson, null, 2)}
        />
        <p className="text-gray-500 text-sm mt-2">
          Or serve it from your Express app:
        </p>
        <CodeBlock
          language="typescript"
          code={`import { generateDiscoveryDocument } from "@attest/sdk/express";

app.get("/.well-known/attest.json", (req, res) => {
  res.json(generateDiscoveryDocument({
    merchantId: "${session.merchantId}",
  }));
});`}
        />
      </Section>

      {/* Step 5 */}
      <Section number={5} title="Import your customers (optional)">
        <p className="text-gray-600 mb-3">
          Import your customer database so Attest can resolve agent sessions
          to existing customers. Go to the{" "}
          <a href="/customers" className="text-indigo-600 underline">Customers</a> tab
          to upload a CSV, or use the API:
        </p>
        <CodeBlock
          language="bash"
          code={`curl -X POST https://api.attest.dev/v0/merchants/${session.merchantId}/customers/import \\
  -H "Authorization: Bearer ${session.apiKey.slice(0, 16)}..." \\
  -H "Content-Type: application/json" \\
  -d '{"customers": [
    {"email": "alice@example.com", "external_customer_id": "cust_123", "name": "Alice", "tier": "vip"},
    {"email": "bob@example.com", "external_customer_id": "cust_456"}
  ]}'`}
        />
      </Section>

      {/* What happens next */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
        <h3 className="font-semibold text-indigo-900 mb-2">What happens now</h3>
        <ul className="text-sm text-indigo-800 space-y-2">
          <li>
            Agent traffic to your site is automatically detected and shows up
            in your <a href="/" className="underline">dashboard</a>.
          </li>
          <li>
            Detected agents receive a <code className="bg-indigo-100 px-1 rounded">WWW-Attest</code> challenge
            header listing the benefits of attesting (loyalty pricing, real-time inventory, etc.).
          </li>
          <li>
            Agent runtimes that support Attest will respond with a signed attestation.
            You'll see these as "verified" sessions with matched customer data.
          </li>
          <li>
            Unattested agents still work — they get guest-level access with tighter
            rate limits and no personalization.
          </li>
          <li>
            Set up <a href="/policies" className="underline">policies</a> to control
            access per agent or per runtime.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
          {number}
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm">
      <code>{code}</code>
    </pre>
  );
}
