import { randomUUID } from "node:crypto";
import { hashSha256 } from "../crypto/signing.js";
import type { Identity } from "../identity/identity.js";
import type { RelayReceipt } from "../types/protocol.js";

/**
 * Create a receipt signed by the requester (the node that received relay service).
 * The receipt proves that relayNodeId did work for the requester.
 */
export function createReceipt(
  identity: Identity,
  requestId: string,
  relayNodeId: string,
  targetDomain: string,
  responseBodyHash: string,
  costUnits: number = 1
): RelayReceipt {
  const unsigned: Omit<RelayReceipt, "signature"> = {
    version: 1,
    receiptId: randomUUID(),
    requestId,
    requesterNodeId: identity.nodeId,
    relayNodeId,
    targetDomainHash: hashSha256(targetDomain),
    responseBodyHash,
    timestamp: Date.now(),
    costUnits,
  };

  const signature = identity.sign(unsigned);
  return { ...unsigned, signature };
}

/**
 * Verify a receipt's signature against the claimed requester's public key.
 */
export function verifyReceipt(
  receipt: RelayReceipt,
  verifyFn: (payload: unknown, signature: string) => boolean
): boolean {
  const { signature, ...unsigned } = receipt;
  return verifyFn(unsigned, signature);
}
