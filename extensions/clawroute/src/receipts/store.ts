import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import type { RelayReceipt } from "../types/protocol.js";

function resolveDir(dir: string): string {
  if (dir.startsWith("~")) return join(homedir(), dir.slice(1));
  return dir;
}

export class ReceiptStore {
  private db: Database.Database;

  constructor(identityDir: string) {
    const dir = resolveDir(identityDir);
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, "receipts.db");

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS receipts_earned (
        receipt_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        requester_node_id TEXT NOT NULL,
        relay_node_id TEXT NOT NULL,
        target_domain_hash TEXT NOT NULL,
        response_body_hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        cost_units INTEGER NOT NULL DEFAULT 1,
        signature TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS receipts_spent (
        receipt_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        requester_node_id TEXT NOT NULL,
        relay_node_id TEXT NOT NULL,
        target_domain_hash TEXT NOT NULL,
        response_body_hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        cost_units INTEGER NOT NULL DEFAULT 1,
        signature TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_earned_relay ON receipts_earned(relay_node_id);
      CREATE INDEX IF NOT EXISTS idx_earned_ts ON receipts_earned(timestamp);
      CREATE INDEX IF NOT EXISTS idx_spent_requester ON receipts_spent(requester_node_id);
      CREATE INDEX IF NOT EXISTS idx_spent_ts ON receipts_spent(timestamp);
    `);
  }

  /** Store a receipt we earned (we relayed for someone) */
  storeEarned(receipt: RelayReceipt): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO receipts_earned
         (receipt_id, request_id, requester_node_id, relay_node_id,
          target_domain_hash, response_body_hash, timestamp, cost_units, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        receipt.receiptId,
        receipt.requestId,
        receipt.requesterNodeId,
        receipt.relayNodeId,
        receipt.targetDomainHash,
        receipt.responseBodyHash,
        receipt.timestamp,
        receipt.costUnits,
        receipt.signature
      );
  }

  /** Store a receipt we issued (we used someone as a relay) */
  storeSpent(receipt: RelayReceipt): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO receipts_spent
         (receipt_id, request_id, requester_node_id, relay_node_id,
          target_domain_hash, response_body_hash, timestamp, cost_units, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        receipt.receiptId,
        receipt.requestId,
        receipt.requesterNodeId,
        receipt.relayNodeId,
        receipt.targetDomainHash,
        receipt.responseBodyHash,
        receipt.timestamp,
        receipt.costUnits,
        receipt.signature
      );
  }

  /** Get recent earned receipts to present as credit proof */
  getEarnedReceipts(limit: number = 5): RelayReceipt[] {
    return this.db
      .prepare(
        `SELECT * FROM receipts_earned ORDER BY timestamp DESC LIMIT ?`
      )
      .all(limit)
      .map(rowToReceipt);
  }

  /** Count total earned (relayed for others) */
  countEarned(): number {
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(cost_units), 0) as total FROM receipts_earned`)
      .get() as { total: number };
    return row.total;
  }

  /** Count total spent (sent through others) */
  countSpent(): number {
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(cost_units), 0) as total FROM receipts_spent`)
      .get() as { total: number };
    return row.total;
  }

  /**
   * Calculate effective credit balance with half-life decay.
   * Credits lose 50% of value every `halfLifeDays` days.
   */
  getDecayedBalance(halfLifeDays: number = 14): number {
    const now = Date.now();
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;

    const earned = this.db
      .prepare(`SELECT timestamp, cost_units FROM receipts_earned`)
      .all() as { timestamp: number; cost_units: number }[];

    const spent = this.db
      .prepare(`SELECT timestamp, cost_units FROM receipts_spent`)
      .all() as { timestamp: number; cost_units: number }[];

    const decay = (ts: number) =>
      Math.pow(0.5, (now - ts) / halfLifeMs);

    const earnedValue = earned.reduce(
      (sum, r) => sum + r.cost_units * decay(r.timestamp),
      0
    );
    const spentValue = spent.reduce(
      (sum, r) => sum + r.cost_units * decay(r.timestamp),
      0
    );

    return earnedValue - spentValue;
  }

  /**
   * Check if a node is potentially gaming: many receipts for same domain hash
   * in a short window.
   */
  getDomainReceiptRate(
    nodeId: string,
    domainHash: string,
    windowMs: number = 60_000
  ): number {
    const since = Date.now() - windowMs;
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM receipts_earned
         WHERE requester_node_id = ? AND target_domain_hash = ? AND timestamp > ?`
      )
      .get(nodeId, domainHash, since) as { cnt: number };
    return row.cnt;
  }

  /** Prune expired receipts (older than maxAgeDays), cap at maxStored */
  prune(maxAgeDays: number = 7, maxStored: number = 1000): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    this.db
      .prepare(`DELETE FROM receipts_earned WHERE timestamp < ?`)
      .run(cutoff);
    this.db
      .prepare(`DELETE FROM receipts_spent WHERE timestamp < ?`)
      .run(cutoff);

    // Cap storage
    for (const table of ["receipts_earned", "receipts_spent"]) {
      this.db
        .prepare(
          `DELETE FROM ${table} WHERE receipt_id NOT IN
           (SELECT receipt_id FROM ${table} ORDER BY timestamp DESC LIMIT ?)`
        )
        .run(maxStored);
    }
  }

  close(): void {
    this.db.close();
  }
}

function rowToReceipt(row: any): RelayReceipt {
  return {
    version: 1,
    receiptId: row.receipt_id,
    requestId: row.request_id,
    requesterNodeId: row.requester_node_id,
    relayNodeId: row.relay_node_id,
    targetDomainHash: row.target_domain_hash,
    responseBodyHash: row.response_body_hash,
    timestamp: row.timestamp,
    costUnits: row.cost_units,
    signature: row.signature,
  };
}
