import { randomUUID, randomBytes } from "node:crypto";
import { request } from "undici";
import type { Identity } from "../identity/identity.js";
import type {
  RelayRequest,
  RelayResponse,
  RelayReceipt,
  PeerInfo,
} from "../types/protocol.js";
import { verify, importPublicKey, hashSha256 } from "../crypto/signing.js";
import { createReceipt } from "../receipts/receipt.js";
import { ReceiptStore } from "../receipts/store.js";
import { PeerCache } from "../peers/cache.js";
import { HealthTracker } from "../peers/health.js";
import { selectPeer } from "../peers/selector.js";
import { fetchTarget } from "../relay/fetcher.js";
import type { ClawRouteConfig } from "../config/defaults.js";

export interface RelayResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  bodyHash: string;
  bodyTruncated: boolean;
  fetchDurationMs: number;
  relayedThrough: string | null;
  direct: boolean;
}

export class RelayClient {
  private identity: Identity;
  private config: ClawRouteConfig;
  private peerCache: PeerCache;
  private health: HealthTracker;
  private receiptStore: ReceiptStore;

  constructor(
    identity: Identity,
    config: ClawRouteConfig,
    peerCache: PeerCache,
    health: HealthTracker,
    receiptStore: ReceiptStore
  ) {
    this.identity = identity;
    this.config = config;
    this.peerCache = peerCache;
    this.health = health;
    this.receiptStore = receiptStore;
  }

  async fetch(
    url: string,
    method: "GET" | "HEAD" = "GET",
    headers: Record<string, string> = {}
  ): Promise<RelayResult> {
    const tried = new Set<string>();

    // Try up to 2 peers, then fall back to direct
    for (let attempt = 0; attempt < 2; attempt++) {
      const peers = await this.peerCache.getPeers();
      const peer = selectPeer(peers, this.health, tried);

      if (!peer) break;
      tried.add(peer.nodeId);

      try {
        return await this.relayThrough(peer, url, method, headers);
      } catch {
        this.health.recordFailure(peer.nodeId);
      }
    }

    // Direct fetch fallback
    const result = await fetchTarget(
      url,
      method,
      headers,
      this.config.fetchTimeoutMs,
      this.config.maxResponseBodyBytes
    );

    return {
      statusCode: result.statusCode,
      headers: result.headers,
      body: result.body,
      bodyHash: result.bodyHash,
      bodyTruncated: result.bodyTruncated,
      fetchDurationMs: result.durationMs,
      relayedThrough: null,
      direct: true,
    };
  }

  private async relayThrough(
    peer: PeerInfo,
    url: string,
    method: "GET" | "HEAD",
    headers: Record<string, string>
  ): Promise<RelayResult> {
    const requestId = randomUUID();
    const nonce = randomBytes(16).toString("hex");
    const timestamp = Date.now();

    // Gather credit proof
    const receipts = this.receiptStore.getEarnedReceipts(5);
    const balance = this.receiptStore.getDecayedBalance(
      this.config.creditHalfLifeDays
    );

    const unsigned: Omit<RelayRequest, "signature"> = {
      version: 1,
      requestId,
      requesterNodeId: this.identity.nodeId,
      targetUrl: url,
      method,
      headers,
      timeout: this.config.fetchTimeoutMs,
      timestamp,
      nonce,
      creditProof: { receipts, balance },
    };

    const signature = this.identity.sign(unsigned);
    const relayReq: RelayRequest = { ...unsigned, signature };

    // Send to relay peer
    const { statusCode, body } = await request(
      `${peer.relayUrl}/relay/fetch`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(relayReq),
        signal: AbortSignal.timeout(this.config.fetchTimeoutMs + 5_000),
      }
    );

    const responseBody = await body.json();

    if (statusCode !== 200) {
      throw new Error(
        `Relay error (${statusCode}): ${(responseBody as any).error || "unknown"}`
      );
    }

    const relayResp = responseBody as RelayResponse;

    // Verify response signature
    const peerKey = importPublicKey(peer.publicKey);
    const { signature: respSig, ...respUnsigned } = relayResp;
    if (!verify(respUnsigned, respSig, peerKey)) {
      throw new Error("Invalid relay response signature");
    }

    this.health.recordSuccess(peer.nodeId);

    // Issue receipt to the relay node
    const domain = new URL(url).hostname;
    const receipt = createReceipt(
      this.identity,
      requestId,
      peer.nodeId,
      domain,
      relayResp.bodyHash
    );

    // Store as spent (we used the network)
    this.receiptStore.storeSpent(receipt);

    // Send receipt to relay node (fire-and-forget)
    this.sendReceipt(peer.relayUrl, receipt).catch(() => {});

    return {
      statusCode: relayResp.statusCode,
      headers: relayResp.headers,
      body: relayResp.body,
      bodyHash: relayResp.bodyHash,
      bodyTruncated: relayResp.bodyTruncated,
      fetchDurationMs: relayResp.fetchDurationMs,
      relayedThrough: peer.nodeId,
      direct: false,
    };
  }

  private async sendReceipt(
    relayUrl: string,
    receipt: RelayReceipt
  ): Promise<void> {
    await request(`${relayUrl}/relay/receipt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(receipt),
      signal: AbortSignal.timeout(5_000),
    });
  }
}
