import type { Identity } from "../identity/identity.js";
import type { RegistryClient } from "../registry/client.js";
import type { PeerCache } from "../peers/cache.js";
import type { ReceiptStore } from "../receipts/store.js";
import type { RelayClient } from "../client/relay-client.js";
import type { RelayServer } from "../relay/server.js";
import type { ClawRouteConfig } from "../config/defaults.js";
import { getEnforcementTier } from "../receipts/credit.js";

export interface CliContext {
  identity: Identity;
  config: ClawRouteConfig;
  registryClient: RegistryClient;
  peerCache: PeerCache;
  receiptStore: ReceiptStore;
  relayClient: RelayClient;
  relayServer: RelayServer;
}

export async function runCommand(
  command: string,
  args: string[],
  ctx: CliContext
): Promise<string> {
  switch (command) {
    case "status":
      return statusCommand(ctx);
    case "peers":
      return peersCommand(ctx);
    case "receipts":
      return receiptsCommand(ctx);
    case "identity":
      return identityCommand(ctx);
    case "test":
      return testCommand(args, ctx);
    default:
      return `Unknown command: ${command}\nAvailable: status, peers, receipts, identity, test <url>`;
  }
}

async function statusCommand(ctx: CliContext): Promise<string> {
  const balance = ctx.receiptStore.getDecayedBalance(ctx.config.creditHalfLifeDays);
  const tier = getEnforcementTier(balance, ctx.config);
  const peers = await ctx.peerCache.getPeers();

  const lines = [
    "=== ClawRoute Status ===",
    `Node ID:    ${ctx.identity.nodeId}`,
    `Relay URL:  ${ctx.relayServer.address}`,
    `Listening:  ${ctx.relayServer.listening ? "yes" : "no"}`,
    `Registry:   ${ctx.config.registryUrl}`,
    `Peers:      ${peers.length}`,
    ``,
    `--- Credits ---`,
    `Balance:    ${balance.toFixed(2)}`,
    `Tier:       ${tier}`,
    `Earned:     ${ctx.receiptStore.countEarned()} receipts`,
    `Spent:      ${ctx.receiptStore.countSpent()} receipts`,
  ];

  return lines.join("\n");
}

async function peersCommand(ctx: CliContext): Promise<string> {
  const peers = await ctx.peerCache.getPeers(true);

  if (peers.length === 0) {
    return "No peers discovered.";
  }

  const lines = ["=== ClawRoute Peers ===", ""];
  for (const peer of peers) {
    const age = Date.now() - peer.lastHeartbeat;
    const ageStr =
      age < 60_000
        ? `${Math.round(age / 1000)}s ago`
        : `${Math.round(age / 60_000)}m ago`;

    lines.push(
      `  ${peer.nodeId}`,
      `    URL:       ${peer.relayUrl}`,
      `    Load:      ${(peer.load * 100).toFixed(0)}%`,
      `    Heartbeat: ${ageStr}`,
      ""
    );
  }

  return lines.join("\n");
}

async function receiptsCommand(ctx: CliContext): Promise<string> {
  const earned = ctx.receiptStore.countEarned();
  const spent = ctx.receiptStore.countSpent();
  const balance = ctx.receiptStore.getDecayedBalance(ctx.config.creditHalfLifeDays);
  const tier = getEnforcementTier(balance, ctx.config);
  const recent = ctx.receiptStore.getEarnedReceipts(5);

  const lines = [
    "=== ClawRoute Receipts ===",
    `Total earned:  ${earned}`,
    `Total spent:   ${spent}`,
    `Balance:       ${balance.toFixed(2)} (with decay)`,
    `Tier:          ${tier}`,
    "",
    "--- Recent earned ---",
  ];

  if (recent.length === 0) {
    lines.push("  (none)");
  } else {
    for (const r of recent) {
      const age = Date.now() - r.timestamp;
      const ageStr = age < 60_000
        ? `${Math.round(age / 1000)}s ago`
        : `${Math.round(age / 60_000)}m ago`;
      lines.push(
        `  ${r.receiptId.slice(0, 8)}... from ${r.requesterNodeId.slice(0, 12)}... ${ageStr} (${r.costUnits} units)`
      );
    }
  }

  return lines.join("\n");
}

async function identityCommand(ctx: CliContext): Promise<string> {
  return [
    "=== ClawRoute Identity ===",
    `Node ID:    ${ctx.identity.nodeId}`,
    `Public Key: ${ctx.identity.publicKeyB64.slice(0, 40)}...`,
    `Created:    ${new Date(ctx.identity.createdAt).toISOString()}`,
  ].join("\n");
}

async function testCommand(args: string[], ctx: CliContext): Promise<string> {
  const url = args[0];
  if (!url) {
    return "Usage: clawroute test <url>";
  }

  const start = Date.now();
  try {
    const result = await ctx.relayClient.fetch(url, "GET");
    const elapsed = Date.now() - start;

    return [
      "=== ClawRoute Test ===",
      `URL:      ${url}`,
      `Status:   ${result.statusCode}`,
      `Relayed:  ${result.direct ? "no (direct)" : `yes (via ${result.relayedThrough})`}`,
      `Duration: ${result.fetchDurationMs}ms (total: ${elapsed}ms)`,
      `Body:     ${result.body.length} chars${result.bodyTruncated ? " (truncated)" : ""}`,
      `Hash:     ${result.bodyHash.slice(0, 16)}...`,
    ].join("\n");
  } catch (err: any) {
    return `Test failed: ${err.message}`;
  }
}
