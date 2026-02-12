import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { Identity } from "./identity/identity.js";
import { resolveConfig } from "./config/defaults.js";
import { importPublicKey } from "./crypto/signing.js";
import { RegistryClient } from "./registry/client.js";
import { PeerCache } from "./peers/cache.js";
import { HealthTracker } from "./peers/health.js";
import { ReceiptStore } from "./receipts/store.js";
import { RelayServer } from "./relay/server.js";
import { RelayClient } from "./client/relay-client.js";
import { RegistryStore } from "../registry-server/src/store.js";
import { registerRoutes } from "../registry-server/src/routes.js";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { rmSync } from "node:fs";
import type { KeyObject } from "node:crypto";
import type { PeerInfo } from "./types/protocol.js";

function tmpDir(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(4).toString("hex")}`);
}

describe("integration: two-node relay", () => {
  // Registry
  let registryApp: ReturnType<typeof Fastify>;
  let registryUrl: string;
  let registryStore: RegistryStore;

  // Target server (simulates the site being fetched)
  let targetApp: ReturnType<typeof Fastify>;
  let targetUrl: string;

  // Node A (requester) and Node B (relay)
  let idA: Identity;
  let idB: Identity;
  let relayServerB: RelayServer;
  let receiptStoreA: ReceiptStore;
  let receiptStoreB: ReceiptStore;
  let relayClientA: RelayClient;

  const dirs: string[] = [];

  beforeAll(async () => {
    // --- Start registry ---
    registryStore = new RegistryStore(":memory:");
    registryApp = Fastify();
    registerRoutes(registryApp, registryStore);
    await registryApp.listen({ port: 0, host: "127.0.0.1" });
    const regAddr = registryApp.server.address();
    if (typeof regAddr === "object" && regAddr) {
      registryUrl = `http://127.0.0.1:${regAddr.port}`;
    }

    // --- Start target server ---
    targetApp = Fastify();
    targetApp.get("/hello", async () => ({ message: "Hello from target!" }));
    await targetApp.listen({ port: 0, host: "127.0.0.1" });
    const targetAddr = targetApp.server.address();
    if (typeof targetAddr === "object" && targetAddr) {
      targetUrl = `http://127.0.0.1:${targetAddr.port}`;
    }

    // --- Node A identity ---
    const dirA = tmpDir("nodeA");
    dirs.push(dirA);
    idA = await Identity.generate(dirA);

    // --- Node B identity ---
    const dirB = tmpDir("nodeB");
    dirs.push(dirB);
    idB = await Identity.generate(dirB);

    // --- Receipt stores ---
    receiptStoreA = new ReceiptStore(dirA);
    receiptStoreB = new ReceiptStore(dirB);

    // Key resolution map
    const keyMap = new Map<string, KeyObject>();
    keyMap.set(idA.nodeId, importPublicKey(idA.publicKeyB64));
    keyMap.set(idB.nodeId, importPublicKey(idB.publicKeyB64));

    const resolveKey = (nodeId: string) => keyMap.get(nodeId) ?? null;

    // --- Node B: relay server ---
    const configB = resolveConfig({
      registryUrl,
      relayPort: 0, // Will pick random port
      identityDir: dirB,
      newNodeCreditGrant: 50,
      urlAllowPrivateIps: true, // Allow 127.0.0.1 for testing
    });

    // Use a random available port
    const portB = 19800 + Math.floor(Math.random() * 1000);
    const configBWithPort = { ...configB, relayPort: portB };

    relayServerB = new RelayServer({
      identity: idB,
      config: configBWithPort,
      receiptStore: receiptStoreB,
      resolvePublicKey: resolveKey,
    });
    await relayServerB.start();

    // Register both nodes with registry
    const regClientA = new RegistryClient(registryUrl, idA);
    const regClientB = new RegistryClient(registryUrl, idB);
    await regClientA.register("http://127.0.0.1:19999"); // A doesn't relay in this test
    await regClientB.register(relayServerB.address);

    // --- Node A: relay client ---
    const configA = resolveConfig({
      registryUrl,
      identityDir: dirA,
      newNodeCreditGrant: 50,
    });

    const healthA = new HealthTracker(configA.peerFailureDeweightMs);
    const peerCacheA = new PeerCache(
      regClientA,
      configA.peerCacheTtlMs,
      configA.maxPeersPerRequest
    );

    relayClientA = new RelayClient(
      idA,
      configA,
      peerCacheA,
      healthA,
      receiptStoreA
    );
  }, 15_000);

  afterAll(async () => {
    await relayServerB?.stop();
    await registryApp?.close();
    await targetApp?.close();
    receiptStoreA?.close();
    receiptStoreB?.close();
    registryStore?.close();
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("discovers peers via registry", async () => {
    const regClient = new RegistryClient(registryUrl, idA);
    const peers = await regClient.discover(10);
    // Should see node B (but not A, since we exclude self)
    expect(peers.length).toBeGreaterThanOrEqual(1);
    const bPeer = peers.find((p) => p.nodeId === idB.nodeId);
    expect(bPeer).toBeDefined();
  });

  it("relays a fetch through node B", async () => {
    const result = await relayClientA.fetch(
      `${targetUrl}/hello`,
      "GET"
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("Hello from target!");
    expect(result.direct).toBe(false);
    expect(result.relayedThrough).toBe(idB.nodeId);
  });

  it("stores a receipt after relay", async () => {
    // Give the fire-and-forget receipt a moment to arrive
    await new Promise((r) => setTimeout(r, 500));

    // Node A should have a spent receipt
    const spent = receiptStoreA.countSpent();
    expect(spent).toBeGreaterThanOrEqual(1);
  });

  it("node B earned a receipt", async () => {
    await new Promise((r) => setTimeout(r, 500));
    const earned = receiptStoreB.countEarned();
    expect(earned).toBeGreaterThanOrEqual(1);
  });

  it("health check on relay server works", async () => {
    const res = await fetch(`${relayServerB.address}/health`);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.nodeId).toBe(idB.nodeId);
  });
});
