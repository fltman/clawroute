import type { PeerInfo } from "../types/protocol.js";
import type { HealthTracker } from "./health.js";

/**
 * Weighted random peer selection.
 * Weight = (1 - load) * healthWeight * freshnessFactor
 */
export function selectPeer(
  peers: PeerInfo[],
  health: HealthTracker,
  excludeNodeIds: Set<string> = new Set()
): PeerInfo | null {
  const candidates = peers.filter((p) => !excludeNodeIds.has(p.nodeId));
  if (candidates.length === 0) return null;

  const now = Date.now();
  const weights = candidates.map((peer) => {
    const loadFactor = Math.max(0, 1 - peer.load);
    const healthWeight = health.getWeight(peer.nodeId);
    // Freshness: nodes with recent heartbeat get higher weight
    const heartbeatAge = now - peer.lastHeartbeat;
    const freshness = Math.max(0.1, 1 - heartbeatAge / (10 * 60_000));
    return loadFactor * healthWeight * freshness;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) {
    // All peers have zero weight — pick randomly as last resort
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Weighted random selection
  let r = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }

  return candidates[candidates.length - 1];
}
