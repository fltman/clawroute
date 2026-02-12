export class NonceTracker {
  private seen = new Map<string, number>();
  private windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  /** Returns true if nonce is fresh, false if replayed */
  check(requestId: string, nonce: string): boolean {
    const key = `${requestId}:${nonce}`;
    const now = Date.now();

    // Prune old entries
    this.prune(now);

    if (this.seen.has(key)) {
      return false;
    }

    this.seen.set(key, now);
    return true;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, ts] of this.seen) {
      if (ts < cutoff) {
        this.seen.delete(key);
      }
    }
  }

  get size(): number {
    return this.seen.size;
  }
}
