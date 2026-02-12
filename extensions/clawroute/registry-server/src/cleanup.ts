import type { RegistryStore } from "./store.js";

const DEFAULT_INTERVAL_MS = 2 * 60_000;
const DEFAULT_STALE_MS = 5 * 60_000;

export class StaleNodeCleaner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private store: RegistryStore;
  private staleMs: number;

  constructor(store: RegistryStore, staleMs: number = DEFAULT_STALE_MS) {
    this.store = store;
    this.staleMs = staleMs;
  }

  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    this.timer = setInterval(() => {
      const evicted = this.store.evictStale(this.staleMs);
      if (evicted > 0) {
        console.log(`[Registry] Evicted ${evicted} stale node(s)`);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
