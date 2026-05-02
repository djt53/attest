import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireSession } from "~/lib/session.server";
import { getEvents } from "~/lib/api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireSession(request);
  const events = await getEvents(session.merchantId, session.apiKey, 100);
  return json({ events });
}

export default function Activity() {
  const { events } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Activity</h1>
        <p className="text-gray-500 mt-1">All agent sessions at your store</p>
      </div>

      {events.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No agent activity recorded yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Runtime</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scope</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((event: any) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{event.agent_id}</td>
                  <td className="px-4 py-3 text-gray-500">{event.runtime_issuer}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {event.human_email || event.human_principal_id}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{event.scope?.join(", ")}</td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(event.created_at).toLocaleString()}
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
