/** Core protocol types for ClawRoute relay mesh */

export interface RelayRequest {
  version: 1;
  requestId: string;
  requesterNodeId: string;
  targetUrl: string;
  method: "GET" | "HEAD";
  headers?: Record<string, string>;
  timeout: number;
  timestamp: number;
  nonce: string;
  creditProof: CreditProof;
  signature: string;
}

export interface CreditProof {
  receipts: RelayReceipt[];
  balance: number;
}

export interface RelayResponse {
  requestId: string;
  relayNodeId: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  bodyHash: string;
  bodyTruncated: boolean;
  fetchDurationMs: number;
  timestamp: number;
  signature: string;
}

export interface RelayReceipt {
  version: 1;
  receiptId: string;
  requestId: string;
  requesterNodeId: string;
  relayNodeId: string;
  targetDomainHash: string;
  responseBodyHash: string;
  timestamp: number;
  costUnits: number;
  signature: string;
}

export interface PeerInfo {
  nodeId: string;
  publicKey: string;
  relayUrl: string;
  load: number;
  registeredAt: number;
  lastHeartbeat: number;
}

export interface RegistryRegistration {
  nodeId: string;
  publicKey: string;
  relayUrl: string;
  timestamp: number;
  signature: string;
}

export interface RegistryHeartbeat {
  nodeId: string;
  load: number;
  timestamp: number;
  signature: string;
}

export interface NodeIdentity {
  nodeId: string;
  publicKey: string;
  privateKey: string;
  createdAt: number;
}

export type EnforcementTier =
  | "full"
  | "deprioritized"
  | "throttled"
  | "cutoff";

export interface CreditStatus {
  balance: number;
  tier: EnforcementTier;
  relayedForOthers: number;
  sentThroughOthers: number;
}
