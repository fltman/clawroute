interface FailureRecord {
  count: number;
  lastFailure: number;
}

export class HealthTracker {
  private failures = new Map<string, FailureRecord>();
  private deweightMs: number;

  constructor(deweightMs: number) {
    this.deweightMs = deweightMs;
  }

  recordFailure(nodeId: string): void {
    const existing = this.failures.get(nodeId);
    if (existing) {
      existing.count += 1;
      existing.lastFailure = Date.now();
    } else {
      this.failures.set(nodeId, { count: 1, lastFailure: Date.now() });
    }
  }

  recordSuccess(nodeId: string): void {
    this.failures.delete(nodeId);
  }

  /** Returns a weight multiplier (0-1) based on failure history */
  getWeight(nodeId: string): number {
    const record = this.failures.get(nodeId);
    if (!record) return 1.0;

    const elapsed = Date.now() - record.lastFailure;
    if (elapsed > this.deweightMs) {
      // Past the deweight window, start recovering
      this.failures.delete(nodeId);
      return 1.0;
    }

    // Exponential backoff: more failures = lower weight
    return Math.max(0.01, Math.pow(0.5, record.count));
  }

  isDeweighted(nodeId: string): boolean {
    return this.getWeight(nodeId) < 0.5;
  }
}
