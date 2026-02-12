export interface ClawRouteConfig {
  registryUrl: string;
  relayPort: number;
  identityDir: string;
  maxResponseBodyBytes: number;
  fetchTimeoutMs: number;
  newNodeCreditGrant: number;

  // Rate limiting
  perNodeRateLimit: number;
  globalRateLimit: number;
  rateLimitWindowMs: number;

  // Peer management
  peerCacheTtlMs: number;
  peerFailureDeweightMs: number;
  maxPeersPerRequest: number;

  // Receipt / credit
  receiptMaxAgeDays: number;
  receiptMaxStored: number;
  creditHalfLifeDays: number;
  creditDiminishingThreshold: number;

  // Enforcement tiers
  tierThrottledBalance: number;
  tierCutoffBalance: number;
  tierThrottleIntervalMs: number;

  // Nonce replay window
  nonceWindowMs: number;

  // Registry heartbeat
  heartbeatIntervalMs: number;

  // URL policy
  urlAllowGlobs: string[];
  urlDenyGlobs: string[];
  urlAllowPrivateIps: boolean;
}

export const DEFAULT_CONFIG: ClawRouteConfig = {
  registryUrl: "http://localhost:19900",
  relayPort: 19800,
  identityDir: "~/.openclaw/clawroute",
  maxResponseBodyBytes: 5 * 1024 * 1024,
  fetchTimeoutMs: 15_000,
  newNodeCreditGrant: 50,

  perNodeRateLimit: 10,
  globalRateLimit: 30,
  rateLimitWindowMs: 60_000,

  peerCacheTtlMs: 5 * 60_000,
  peerFailureDeweightMs: 5 * 60_000,
  maxPeersPerRequest: 10,

  receiptMaxAgeDays: 7,
  receiptMaxStored: 1000,
  creditHalfLifeDays: 14,
  creditDiminishingThreshold: 100,

  tierThrottledBalance: -50,
  tierCutoffBalance: -200,
  tierThrottleIntervalMs: 10_000,

  nonceWindowMs: 10 * 60_000,

  heartbeatIntervalMs: 2 * 60_000,

  urlAllowGlobs: ["**"],
  urlDenyGlobs: [],
  urlAllowPrivateIps: false,
};

export function resolveConfig(
  partial: Partial<ClawRouteConfig> = {}
): ClawRouteConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}
