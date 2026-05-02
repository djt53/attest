import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { destroySession } from "~/lib/session.server";

export async function action({ request }: ActionFunctionArgs) {
  return redirect("/login", {
    headers: { "Set-Cookie": await destroySession() },
  });
}
