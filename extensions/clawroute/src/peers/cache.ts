import type { PeerInfo } from "../types/protocol.js";
import type { RegistryClient } from "../registry/client.js";

export class PeerCache {
  private peers: PeerInfo[] = [];
  private lastRefresh: number = 0;
  private ttlMs: number;
  private maxPeers: number;
  private registryClient: RegistryClient;

  constructor(
    registryClient: RegistryClient,
    ttlMs: number,
    maxPeers: number
  ) {
    this.registryClient = registryClient;
    this.ttlMs = ttlMs;
    this.maxPeers = maxPeers;
  }

  async getPeers(forceRefresh: boolean = false): Promise<PeerInfo[]> {
    const now = Date.now();
    if (
      forceRefresh ||
      this.peers.length === 0 ||
      now - this.lastRefresh > this.ttlMs
    ) {
      await this.refresh();
    }
    return this.peers;
  }

  async refresh(): Promise<void> {
    try {
      this.peers = await this.registryClient.discover(this.maxPeers);
      this.lastRefresh = Date.now();
    } catch {
      // Keep stale cache on failure
    }
  }

  removePeer(nodeId: string): void {
    this.peers = this.peers.filter((p) => p.nodeId !== nodeId);
  }

  get size(): number {
    return this.peers.length;
  }

  get stale(): boolean {
    return Date.now() - this.lastRefresh > this.ttlMs;
  }
}
