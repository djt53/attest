/**
 * AgentPass compatibility layer.
 *
 * Verifies AgentPass credentials (from Clerk's protocol) and translates
 * them into Attest's internal attestation format for identity resolution.
 *
 * AgentPass flow:
 * 1. Agent presents an AgentPass credential (opaque token)
 * 2. We validate it with the AgentPass Authority (Clerk or enterprise)
 * 3. If valid, we extract identity claims and feed them into our pipeline
 *
 * This makes Attest the resolution layer regardless of whether the agent
 * uses Attest's native attestation or AgentPass credentials.
 */

export interface AgentPassCredential {
  /** The opaque AgentPass token value */
  value: string;
  /** The Authority URL that issued this credential */
  authority_url: string;
}

export interface AgentPassValidationResult {
  valid: boolean;
  error?: string;
  /** Extracted identity if valid */
  identity?: {
    user_email: string;
    user_id?: string;
    harness_id: string;
    harness_name?: string;
    task_description?: string;
    scope: string[];
    trust_tier: "attested" | "registered" | "unverified";
  };
}

/**
 * Validate an AgentPass credential with the issuing Authority.
 *
 * Calls the Authority's validation endpoint to verify the credential
 * is valid, not expired, and not already consumed.
 */
export async function validateAgentPass(
  credential: AgentPassCredential,
  serviceOrigin: string
): Promise<AgentPassValidationResult> {
  try {
    // Fetch Authority configuration
    const configUrl = credential.authority_url.endsWith("/")
      ? `${credential.authority_url}.well-known/agentpass-authority`
      : `${credential.authority_url}/.well-known/agentpass-authority`;

    const configRes = await fetch(configUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (!configRes.ok) {
      return { valid: false, error: "authority_config_unavailable" };
    }

    const config = (await configRes.json()) as {
      validation_endpoint?: string;
      issuer?: string;
    };

    const validationEndpoint = config.validation_endpoint;
    if (!validationEndpoint) {
      return { valid: false, error: "authority_missing_validation_endpoint" };
    }

    // Validate the credential with the Authority
    const validationRes = await fetch(validationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentpass: credential.value,
        service_origin: serviceOrigin,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!validationRes.ok) {
      return { valid: false, error: "agentpass_validation_failed" };
    }

    const result = (await validationRes.json()) as {
      valid: boolean;
      user_email?: string;
      user_id?: string;
      harness_id?: string;
      harness_name?: string;
      task_description?: string;
      scope?: string[];
      harness_trust_tier?: string;
    };

    if (!result.valid) {
      return { valid: false, error: "agentpass_invalid" };
    }

    return {
      valid: true,
      identity: {
        user_email: result.user_email || "",
        user_id: result.user_id,
        harness_id: result.harness_id || "unknown",
        harness_name: result.harness_name,
        task_description: result.task_description,
        scope: result.scope || [],
        trust_tier: (result.harness_trust_tier as any) || "unverified",
      },
    };
  } catch {
    return { valid: false, error: "agentpass_authority_unreachable" };
  }
}

/**
 * Convert an AgentPass validation result into Attest's attestation format.
 * This allows the rest of the pipeline (resolution, policies, consent)
 * to work identically regardless of credential source.
 */
export function agentPassToAttestation(
  result: AgentPassValidationResult
): {
  runtime: string;
  agent: string;
  human: { id: string; email?: string };
  scope: string[];
  expires_at: string;
  credential_type: "agentpass";
  trust_tier: string;
} | null {
  if (!result.valid || !result.identity) return null;

  return {
    runtime: `agentpass:${result.identity.harness_name || result.identity.harness_id}`,
    agent: result.identity.harness_id,
    human: {
      id: result.identity.user_id || result.identity.user_email,
      email: result.identity.user_email || undefined,
    },
    scope: result.identity.scope,
    expires_at: new Date(Date.now() + 300_000).toISOString(), // AgentPass tokens are single-use, so we set a short TTL
    credential_type: "agentpass",
    trust_tier: result.identity.trust_tier,
  };
}

/**
 * Extract an AgentPass credential from request headers.
 * AgentPass uses a different header than Attest's Agent-Attestation.
 */
export function extractAgentPassFromHeaders(headers: {
  [key: string]: string | undefined;
}): AgentPassCredential | null {
  const value = headers["x-agentpass"] || headers["agentpass"];
  const authority = headers["x-agentpass-authority"] || headers["agentpass-authority"];

  if (!value || !authority) return null;

  return { value, authority_url: authority };
}
