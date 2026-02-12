import { Identity } from "./identity/identity.js";
import { resolveConfig, type ClawRouteConfig } from "./config/defaults.js";
import { importPublicKey } from "./crypto/signing.js";
import { RegistryClient } from "./registry/client.js";
import { PeerCache } from "./peers/cache.js";
import { HealthTracker } from "./peers/health.js";
import { ReceiptStore } from "./receipts/store.js";
import { RelayServer } from "./relay/server.js";
import { RelayClient } from "./client/relay-client.js";
import { TOOL_DEFINITION, executeClawRouteFetch } from "./tools/clawroute-fetch.js";
import { runCommand, type CliContext } from "./cli/commands.js";
import type { PeerInfo } from "./types/protocol.js";
import type { KeyObject } from "node:crypto";

export class ClawRoutePlugin {
  private identity!: Identity;
  private config: ClawRouteConfig;
  private registryClient!: RegistryClient;
  private peerCache!: PeerCache;
  private health!: HealthTracker;
  private receiptStore!: ReceiptStore;
  private relayServer!: RelayServer;
  private relayClient!: RelayClient;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  // Cache of peer public keys for signature verification
  private keyCache = new Map<string, KeyObject>();

  constructor(userConfig: Partial<ClawRouteConfig> = {}) {
    this.config = resolveConfig(userConfig);
  }

  async initialize(): Promise<void> {
    // Load or generate identity
    this.identity = await Identity.load(this.config.identityDir);

    // Initialize stores
    this.receiptStore = new ReceiptStore(this.config.identityDir);

    // Initialize registry client
    this.registryClient = new RegistryClient(
      this.config.registryUrl,
      this.identity
    );

    // Initialize peer management
    this.health = new HealthTracker(this.config.peerFailureDeweightMs);
    this.peerCache = new PeerCache(
      this.registryClient,
      this.config.peerCacheTtlMs,
      this.config.maxPeersPerRequest
    );

    // Initialize relay server
    this.relayServer = new RelayServer({
      identity: this.identity,
      config: this.config,
      receiptStore: this.receiptStore,
      resolvePublicKey: (nodeId) => this.resolvePublicKey(nodeId),
    });

    // Initialize relay client
    this.relayClient = new RelayClient(
      this.identity,
      this.config,
      this.peerCache,
      this.health,
      this.receiptStore
    );
  }

  async start(): Promise<void> {
    // Start relay server
    await this.relayServer.start();

    // Register with registry
    try {
      await this.registryClient.register(this.relayServer.address);
    } catch (err: any) {
      console.warn(`[ClawRoute] Registry registration failed: ${err.message}`);
    }

    // Start heartbeat
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.registryClient.heartbeat(this.getLoad());
      } catch {
        // Silently retry next interval
      }
    }, this.config.heartbeatIntervalMs);

    // Start receipt pruning
    this.pruneTimer = setInterval(() => {
      this.receiptStore.prune(
        this.config.receiptMaxAgeDays,
        this.config.receiptMaxStored
      );
    }, 60 * 60_000); // Prune hourly
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    try {
      await this.registryClient.deregister();
    } catch {
      // Best effort
    }

    await this.relayServer.stop();
    this.receiptStore.close();
  }

  /** OpenClaw tool registration */
  getToolDefinition() {
    return TOOL_DEFINITION;
  }

  /** OpenClaw tool execution */
  async executeTool(params: { url: string; extractMode?: "markdown" | "text"; maxChars?: number }) {
    return executeClawRouteFetch(params, this.relayClient);
  }

  /** CLI command execution */
  async runCli(command: string, args: string[]): Promise<string> {
    const ctx: CliContext = {
      identity: this.identity,
      config: this.config,
      registryClient: this.registryClient,
      peerCache: this.peerCache,
      receiptStore: this.receiptStore,
      relayClient: this.relayClient,
      relayServer: this.relayServer,
    };
    return runCommand(command, args, ctx);
  }

  /** Get current node load (0-1) based on active connections */
  private getLoad(): number {
    // Simple heuristic: use memory pressure as load indicator
    const mem = process.memoryUsage();
    return Math.min(1, mem.heapUsed / (512 * 1024 * 1024));
  }

  /** Resolve a nodeId to its public key (from cached peers) */
  private resolvePublicKey(nodeId: string): KeyObject | null {
    const cached = this.keyCache.get(nodeId);
    if (cached) return cached;

    // Search peers for the public key
    // This is synchronous because we cache peers locally
    const peers = (this.peerCache as any).peers as PeerInfo[];
    if (!peers) return null;

    const peer = peers.find((p) => p.nodeId === nodeId);
    if (!peer) return null;

    try {
      const key = importPublicKey(peer.publicKey);
      this.keyCache.set(nodeId, key);
      return key;
    } catch {
      return null;
    }
  }

  get nodeId(): string {
    return this.identity.nodeId;
  }
}

export { Identity } from "./identity/identity.js";
export { resolveConfig, DEFAULT_CONFIG } from "./config/defaults.js";
export type { ClawRouteConfig } from "./config/defaults.js";
export type * from "./types/protocol.js";
