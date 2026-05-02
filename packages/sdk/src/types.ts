export interface AttestationOptions {
  /** Agent identifier within the runtime */
  agentId: string;
  /** The human principal this agent is acting for */
  humanPrincipal: {
    id: string;
    email?: string;
  };
  /** Requested permission scopes */
  scope: string[];
  /** Target merchant identifier (domain or ID) */
  audience: string;
  /** Token TTL in seconds (default: 300, max: 3600) */
  ttl?: number;
}

export interface AttestationToken {
  /** The signed JWT string */
  token: string;
  /** Token expiration time */
  expiresAt: Date;
  /** Unique token ID */
  jti: string;
}
