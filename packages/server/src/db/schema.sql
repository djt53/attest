-- Attest database schema v0
-- Run against a fresh Postgres database

-- Registered agent runtimes (issuers)
CREATE TABLE runtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer TEXT UNIQUE NOT NULL,          -- e.g., "anthropic", "openai", "custom.example.com"
  name TEXT NOT NULL,                    -- human-readable name
  jwks_url TEXT NOT NULL,                -- JWKS endpoint URL
  contact_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | suspended
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_runtimes_issuer ON runtimes(issuer);

-- Merchants
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,      -- domain or merchant identifier used in aud claim
  name TEXT NOT NULL,
  platform TEXT,                         -- shopify | stripe | custom
  platform_shop_id TEXT,                 -- e.g., Shopify shop ID
  webhook_url TEXT,                      -- for custom identity resolution
  settings JSONB NOT NULL DEFAULT '{}',  -- merchant-specific config
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchants_external_id ON merchants(external_id);
CREATE INDEX idx_merchants_platform ON merchants(platform);

-- Merchant customers (for identity resolution)
CREATE TABLE merchant_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  external_customer_id TEXT,             -- merchant's own customer ID
  email TEXT,
  name TEXT,
  tier TEXT,                             -- loyalty tier, if applicable
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, email)
);

CREATE INDEX idx_merchant_customers_merchant ON merchant_customers(merchant_id);
CREATE INDEX idx_merchant_customers_email ON merchant_customers(merchant_id, email);

-- Merchant agent policies
CREATE TABLE merchant_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  runtime_issuer TEXT,                   -- NULL = applies to all runtimes
  agent_id TEXT,                         -- NULL = applies to all agents from this runtime
  action TEXT NOT NULL DEFAULT 'allow',  -- allow | deny | step_up | review
  conditions JSONB NOT NULL DEFAULT '{}', -- e.g., {"max_amount": 500, "require_email": true}
  priority INT NOT NULL DEFAULT 0,       -- higher = evaluated first
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_policies_merchant ON merchant_policies(merchant_id);
CREATE INDEX idx_merchant_policies_lookup ON merchant_policies(merchant_id, runtime_issuer, agent_id);

-- Consent ledger (append-only)
CREATE TABLE consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  runtime_issuer TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  human_principal_id TEXT NOT NULL,      -- act.sub from attestation
  human_email TEXT,                      -- act.email, if present
  resolved_customer_id UUID REFERENCES merchant_customers(id),
  scope TEXT[] NOT NULL,
  action TEXT NOT NULL,                  -- verified | denied | revoked | step_up_required
  policy_id UUID REFERENCES merchant_policies(id),
  attestation_jti TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No UPDATE or DELETE — append-only by convention
CREATE INDEX idx_consent_events_merchant ON consent_events(merchant_id);
CREATE INDEX idx_consent_events_human ON consent_events(human_principal_id);
CREATE INDEX idx_consent_events_jti ON consent_events(attestation_jti);
CREATE INDEX idx_consent_events_created ON consent_events(created_at);

-- Consumer consent grants (revocable)
CREATE TABLE consent_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_principal_id TEXT NOT NULL,
  human_email TEXT,
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  runtime_issuer TEXT,                   -- NULL = all runtimes
  agent_id TEXT,                         -- NULL = all agents
  scope TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | revoked | expired
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_grants_human ON consent_grants(human_principal_id);
CREATE INDEX idx_consent_grants_merchant ON consent_grants(merchant_id);
CREATE INDEX idx_consent_grants_status ON consent_grants(status) WHERE status = 'active';

-- Replay prevention (JTI tracking)
CREATE TABLE seen_jtis (
  jti TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seen_jtis_expires ON seen_jtis(expires_at);

-- API keys for merchants
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,                -- bcrypt hash of the API key
  key_prefix TEXT NOT NULL,              -- first 8 chars for identification (e.g., "att_live_")
  name TEXT NOT NULL DEFAULT 'default',
  scopes TEXT[] NOT NULL DEFAULT '{verify,resolve}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_merchant ON api_keys(merchant_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
