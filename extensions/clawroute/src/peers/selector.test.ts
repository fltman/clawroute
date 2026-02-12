import { describe, it, expect } from "vitest";
import { selectPeer } from "./selector.js";
import { HealthTracker } from "./health.js";
import type { PeerInfo } from "../types/protocol.js";

function makePeer(id: string, load: number = 0): PeerInfo {
  return {
    nodeId: id,
    publicKey: "fakepub",
    relayUrl: `http://localhost:${19800 + parseInt(id.replace(/\D/g, "") || "0")}`,
    load,
    registeredAt: Date.now(),
    lastHeartbeat: Date.now(),
  };
}

describe("peers/selector", () => {
  it("selects a peer from the list", () => {
    const health = new HealthTracker(300_000);
    const peers = [makePeer("p1"), makePeer("p2"), makePeer("p3")];
    const selected = selectPeer(peers, health);
    expect(selected).not.toBeNull();
    expect(peers.some((p) => p.nodeId === selected!.nodeId)).toBe(true);
  });

  it("excludes specified nodes", () => {
    const health = new HealthTracker(300_000);
    const peers = [makePeer("p1"), makePeer("p2")];
    const selected = selectPeer(peers, health, new Set(["p1"]));
    expect(selected!.nodeId).toBe("p2");
  });

  it("returns null when all excluded", () => {
    const health = new HealthTracker(300_000);
    const peers = [makePeer("p1")];
    expect(selectPeer(peers, health, new Set(["p1"]))).toBeNull();
  });

  it("returns null for empty peer list", () => {
    const health = new HealthTracker(300_000);
    expect(selectPeer([], health)).toBeNull();
  });

  it("prefers low-load peers", () => {
    const health = new HealthTracker(300_000);
    const heavy = makePeer("heavy", 0.95);
    const light = makePeer("light", 0.05);
    const peers = [heavy, light];

    // Run 100 selections, light should win significantly more often
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const s = selectPeer(peers, health)!;
      counts.set(s.nodeId, (counts.get(s.nodeId) ?? 0) + 1);
    }
    expect(counts.get("light")!).toBeGreaterThan(counts.get("heavy")!);
  });

  it("avoids unhealthy peers", () => {
    const health = new HealthTracker(300_000);
    const peers = [makePeer("healthy"), makePeer("sick")];
    // Mark "sick" as failed multiple times
    for (let i = 0; i < 5; i++) {
      health.recordFailure("sick");
    }

    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const s = selectPeer(peers, health)!;
      counts.set(s.nodeId, (counts.get(s.nodeId) ?? 0) + 1);
    }
    expect(counts.get("healthy")!).toBeGreaterThan(90);
  });
});
