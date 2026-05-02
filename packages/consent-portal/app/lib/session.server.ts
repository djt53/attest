import { createCookie } from "@remix-run/node";

const ATTEST_API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

export const sessionCookie = createCookie("attest_session", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60, // 7 days
  path: "/",
});

export async function getSessionFromRequest(
  request: Request
): Promise<{ email: string; humanPrincipalId: string } | null> {
  const cookieHeader = request.headers.get("Cookie");
  const token = await sessionCookie.parse(cookieHeader);

  if (!token) return null;

  try {
    const response = await fetch(`${ATTEST_API_URL}/v0/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      email: string;
      human_principal_id: string;
    };

    return {
      email: data.email,
      humanPrincipalId: data.human_principal_id,
    };
  } catch {
    return null;
  }
}

export async function verifyMagicLink(
  token: string
): Promise<{ sessionToken: string; email: string; humanPrincipalId: string } | null> {
  try {
    const response = await fetch(`${ATTEST_API_URL}/v0/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      session_token: string;
      email: string;
      human_principal_id: string;
    };

    return {
      sessionToken: data.session_token,
      email: data.email,
      humanPrincipalId: data.human_principal_id,
    };
  } catch {
    return null;
  }
}

export async function requestMagicLink(
  email: string,
  humanPrincipalId: string
): Promise<boolean> {
  try {
    const response = await fetch(`${ATTEST_API_URL}/v0/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, human_principal_id: humanPrincipalId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
