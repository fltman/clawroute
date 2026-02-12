import type { RelayReceipt, EnforcementTier, CreditStatus } from "../types/protocol.js";
import { verify, importPublicKey, type Keypair } from "../crypto/signing.js";
import type { ClawRouteConfig } from "../config/defaults.js";
import type { KeyObject } from "node:crypto";

export interface PublicKeyResolver {
  resolve(nodeId: string): Promise<KeyObject | null>;
}

/**
 * Verify a set of presented receipts from a requester.
 * Returns the number of valid credit units proven.
 */
export function verifyPresentedReceipts(
  receipts: RelayReceipt[],
  beneficiaryNodeId: string,
  resolveKey: (nodeId: string) => KeyObject | null,
  maxAgeDays: number = 7,
  halfLifeDays: number = 14
): number {
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  let total = 0;

  for (const receipt of receipts) {
    // Must be relayNodeId == the presenter (proving they did work)
    if (receipt.relayNodeId !== beneficiaryNodeId) continue;

    // Check expiry
    if (now - receipt.timestamp > maxAgeMs) continue;

    // Verify signature against the requester's public key
    const pubKey = resolveKey(receipt.requesterNodeId);
    if (!pubKey) continue;

    const { signature, ...unsigned } = receipt;
    if (!verify(unsigned, signature, pubKey)) continue;

    // Apply half-life decay
    const decay = Math.pow(0.5, (now - receipt.timestamp) / halfLifeMs);
    total += receipt.costUnits * decay;
  }

  return total;
}

/**
 * Determine enforcement tier based on credit balance.
 */
export function getEnforcementTier(
  balance: number,
  config: Pick<ClawRouteConfig, "tierThrottledBalance" | "tierCutoffBalance">
): EnforcementTier {
  if (balance > 0) return "full";
  if (balance > config.tierThrottledBalance) return "deprioritized";
  if (balance > config.tierCutoffBalance) return "throttled";
  return "cutoff";
}

/**
 * Apply diminishing returns curve.
 * First `threshold` relays/day earn full credit, subsequent earn progressively less.
 */
export function applyDiminishingReturns(
  rawUnits: number,
  relaysToday: number,
  threshold: number
): number {
  if (relaysToday <= threshold) return rawUnits;
  // After threshold: each batch of `threshold` earns half the previous
  const batchesBeyond = Math.floor((relaysToday - threshold) / threshold);
  const multiplier = Math.pow(0.5, batchesBeyond + 1);
  return rawUnits * multiplier;
}

/**
 * Check if a new node should get a grace grant.
 * New nodes (< 24h old) start with a positive credit balance.
 */
export function isNewNodeGracePeriod(
  nodeRegisteredAt: number,
  gracePeriodMs: number = 24 * 60 * 60 * 1000
): boolean {
  return Date.now() - nodeRegisteredAt < gracePeriodMs;
}
