import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { sessionCookie, verifyMagicLink } from "~/lib/session.server";

/**
 * GET /auth/verify?token=xxx
 * Verifies a magic link token and sets a session cookie.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return redirect("/?error=missing_token");
  }

  const result = await verifyMagicLink(token);
  if (!result) {
    return redirect("/?error=invalid_token");
  }

  // Set session cookie and redirect to dashboard
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionCookie.serialize(result.sessionToken),
    },
  });
}
