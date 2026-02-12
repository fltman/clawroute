import Database from "better-sqlite3";

export interface StoredNode {
  node_id: string;
  public_key: string;
  relay_url: string;
  load: number;
  registered_at: number;
  last_heartbeat: number;
}

export class RegistryStore {
  private db: Database.Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        node_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        relay_url TEXT NOT NULL,
        load REAL NOT NULL DEFAULT 0,
        registered_at INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_heartbeat ON nodes(last_heartbeat);
    `);
  }

  register(
    nodeId: string,
    publicKey: string,
    relayUrl: string
  ): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO nodes (node_id, public_key, relay_url, load, registered_at, last_heartbeat)
         VALUES (?, ?, ?, 0, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET
           public_key = excluded.public_key,
           relay_url = excluded.relay_url,
           last_heartbeat = excluded.last_heartbeat`
      )
      .run(nodeId, publicKey, relayUrl, now, now);
  }

  heartbeat(nodeId: string, load: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE nodes SET load = ?, last_heartbeat = ? WHERE node_id = ?`
      )
      .run(load, Date.now(), nodeId);
    return result.changes > 0;
  }

  discover(exclude: string, limit: number): StoredNode[] {
    return this.db
      .prepare(
        `SELECT * FROM nodes
         WHERE node_id != ?
         ORDER BY last_heartbeat DESC
         LIMIT ?`
      )
      .all(exclude, limit) as StoredNode[];
  }

  remove(nodeId: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM nodes WHERE node_id = ?`)
      .run(nodeId);
    return result.changes > 0;
  }

  getNode(nodeId: string): StoredNode | undefined {
    return this.db
      .prepare(`SELECT * FROM nodes WHERE node_id = ?`)
      .get(nodeId) as StoredNode | undefined;
  }

  /** Remove nodes that haven't sent a heartbeat in `staleMs` */
  evictStale(staleMs: number = 5 * 60_000): number {
    const cutoff = Date.now() - staleMs;
    const result = this.db
      .prepare(`DELETE FROM nodes WHERE last_heartbeat < ?`)
      .run(cutoff);
    return result.changes;
  }

  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM nodes`)
      .get() as { cnt: number };
    return row.cnt;
  }

  close(): void {
    this.db.close();
  }
}
