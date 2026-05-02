import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { sessionCookie } from "~/lib/session.server";

export async function action({ request }: ActionFunctionArgs) {
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionCookie.serialize("", { maxAge: 0 }),
    },
  });
}
