import { createCookie, redirect } from "@remix-run/node";

export const sessionCookie = createCookie("attest_dashboard", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 30 * 24 * 60 * 60, // 30 days
  path: "/",
});

export interface DashboardSession {
  apiKey: string;
  merchantId: string;
  merchantName: string;
}

export async function getSession(
  request: Request
): Promise<DashboardSession | null> {
  const cookieHeader = request.headers.get("Cookie");
  const data = await sessionCookie.parse(cookieHeader);
  if (!data?.apiKey || !data?.merchantId) return null;
  return data as DashboardSession;
}

export async function requireSession(
  request: Request
): Promise<DashboardSession> {
  const session = await getSession(request);
  if (!session) throw redirect("/login");
  return session;
}

export async function createSession(data: DashboardSession) {
  return sessionCookie.serialize(data);
}

export async function destroySession() {
  return sessionCookie.serialize("", { maxAge: 0 });
}
