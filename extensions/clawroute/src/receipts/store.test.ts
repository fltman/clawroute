import { describe, it, expect, afterEach } from "vitest";
import { ReceiptStore } from "./store.js";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { rmSync } from "node:fs";
import type { RelayReceipt } from "../types/protocol.js";

function tmpDir(): string {
  return join(tmpdir(), `cr-store-test-${randomBytes(4).toString("hex")}`);
}

function makeReceipt(overrides: Partial<RelayReceipt> = {}): RelayReceipt {
  return {
    version: 1,
    receiptId: randomUUID(),
    requestId: randomUUID(),
    requesterNodeId: "cr_requester",
    relayNodeId: "cr_relay",
    targetDomainHash: "abc123",
    responseBodyHash: "def456",
    timestamp: Date.now(),
    costUnits: 1,
    signature: "fakesig",
    ...overrides,
  };
}

describe("receipts/store", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    dirs.length = 0;
  });

  it("stores and retrieves earned receipts", () => {
    const dir = tmpDir();
    dirs.push(dir);
    const store = new ReceiptStore(dir);
    const r = makeReceipt();
    store.storeEarned(r);
    const retrieved = store.getEarnedReceipts(10);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].receiptId).toBe(r.receiptId);
    store.close();
  });

  it("counts earned and spent", () => {
    const dir = tmpDir();
    dirs.push(dir);
    const store = new ReceiptStore(dir);
    store.storeEarned(makeReceipt({ costUnits: 3 }));
    store.storeEarned(makeReceipt({ costUnits: 2 }));
    store.storeSpent(makeReceipt({ costUnits: 1 }));
    expect(store.countEarned()).toBe(5);
    expect(store.countSpent()).toBe(1);
    store.close();
  });

  it("computes decayed balance", () => {
    const dir = tmpDir();
    dirs.push(dir);
    const store = new ReceiptStore(dir);
    // Recent receipt = nearly full value
    store.storeEarned(makeReceipt({ costUnits: 10 }));
    store.storeSpent(makeReceipt({ costUnits: 3 }));
    const balance = store.getDecayedBalance(14);
    // Should be close to 10 - 3 = 7
    expect(balance).toBeGreaterThan(6.9);
    expect(balance).toBeLessThan(7.1);
    store.close();
  });

  it("prunes old receipts", () => {
    const dir = tmpDir();
    dirs.push(dir);
    const store = new ReceiptStore(dir);
    // Old receipt
    store.storeEarned(
      makeReceipt({ timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000 })
    );
    // Fresh receipt
    store.storeEarned(makeReceipt());
    store.prune(7, 1000);
    expect(store.countEarned()).toBe(1);
    store.close();
  });

  it("ignores duplicate receipt IDs", () => {
    const dir = tmpDir();
    dirs.push(dir);
    const store = new ReceiptStore(dir);
    const r = makeReceipt();
    store.storeEarned(r);
    store.storeEarned(r);
    expect(store.getEarnedReceipts(10)).toHaveLength(1);
    store.close();
  });
});
