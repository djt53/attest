/**
 * Email service for Attest.
 *
 * Supports multiple providers via a simple interface.
 * Set EMAIL_PROVIDER=console for dev mode (logs to stdout).
 * Set EMAIL_PROVIDER=resend + RESEND_API_KEY for production.
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailProvider {
  send(options: EmailOptions): Promise<void>;
}

class ConsoleProvider implements EmailProvider {
  async send(options: EmailOptions) {
    console.log(`\n📧 Email to: ${options.to}`);
    console.log(`   Subject: ${options.subject}`);
    console.log(`   ${options.text || "(HTML only)"}\n`);
  }
}

class ResendProvider implements EmailProvider {
  private apiKey: string;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  async send(options: EmailOptions) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${response.status} ${error}`);
    }
  }
}

function createProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER || "console";

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || "Attest <noreply@attest.dev>";
    if (!apiKey) throw new Error("RESEND_API_KEY is required for resend provider");
    return new ResendProvider(apiKey, from);
  }

  return new ConsoleProvider();
}

const emailProvider = createProvider();

// --- Email templates ---

export async function sendMagicLinkEmail(
  to: string,
  magicLink: string
): Promise<void> {
  await emailProvider.send({
    to,
    subject: "Sign in to Attest",
    text: `Sign in to review your agent permissions: ${magicLink}\n\nThis link expires in 15 minutes.`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <div style="width: 40px; height: 40px; background: #4F46E5; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: white; font-weight: bold; font-size: 18px;">A</span>
          </div>
        </div>
        <h2 style="margin: 0 0 16px; font-size: 20px;">Sign in to Attest</h2>
        <p style="color: #6B7280; margin: 0 0 24px; line-height: 1.5;">
          Click the button below to review your agent permissions and see which
          agents have acted on your behalf.
        </p>
        <a href="${magicLink}"
           style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Sign In
        </a>
        <p style="color: #9CA3AF; font-size: 13px; margin-top: 32px; line-height: 1.5;">
          This link expires in 15 minutes. If you didn't request this, you can safely ignore it.
        </p>
      </div>
    `,
  });
}

export async function sendAgentActivityEmail(
  to: string,
  merchantName: string,
  agentId: string,
  runtimeIssuer: string,
  scope: string[],
  consentPortalUrl: string
): Promise<void> {
  await emailProvider.send({
    to,
    subject: `An agent acted on your behalf at ${merchantName}`,
    text: `Agent "${agentId}" (via ${runtimeIssuer}) acted on your behalf at ${merchantName}.\nScope: ${scope.join(", ")}\n\nReview your permissions: ${consentPortalUrl}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <div style="width: 40px; height: 40px; background: #4F46E5; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: white; font-weight: bold; font-size: 18px;">A</span>
          </div>
        </div>
        <h2 style="margin: 0 0 16px; font-size: 20px;">Agent Activity at ${merchantName}</h2>
        <p style="color: #6B7280; margin: 0 0 16px; line-height: 1.5;">
          An agent acted on your behalf:
        </p>
        <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="margin-bottom: 8px;">
            <span style="color: #6B7280; font-size: 13px;">Agent</span><br>
            <span style="font-weight: 500;">${agentId}</span>
            <span style="color: #9CA3AF;"> via ${runtimeIssuer}</span>
          </div>
          <div style="margin-bottom: 8px;">
            <span style="color: #6B7280; font-size: 13px;">Merchant</span><br>
            <span style="font-weight: 500;">${merchantName}</span>
          </div>
          <div>
            <span style="color: #6B7280; font-size: 13px;">Scope</span><br>
            <span style="font-weight: 500;">${scope.join(", ")}</span>
          </div>
        </div>
        <a href="${consentPortalUrl}"
           style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Review Permissions
        </a>
        <p style="color: #9CA3AF; font-size: 13px; margin-top: 32px; line-height: 1.5;">
          You're receiving this because an agent used your identity at a merchant in the Attest network.
          You can review and revoke permissions at any time.
        </p>
      </div>
    `,
  });
}
