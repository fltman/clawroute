interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private globalBucket: Bucket;
  private readonly perNodeLimit: number;
  private readonly globalLimit: number;
  private readonly windowMs: number;

  constructor(perNodeLimit: number, globalLimit: number, windowMs: number) {
    this.perNodeLimit = perNodeLimit;
    this.globalLimit = globalLimit;
    this.windowMs = windowMs;
    this.globalBucket = { tokens: globalLimit, lastRefill: Date.now() };
  }

  check(nodeId: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();

    // Check global limit
    this.refill(this.globalBucket, this.globalLimit, now);
    if (this.globalBucket.tokens < 1) {
      return {
        allowed: false,
        retryAfterMs: this.timeToNextToken(this.globalBucket, this.globalLimit),
      };
    }

    // Check per-node limit
    let bucket = this.buckets.get(nodeId);
    if (!bucket) {
      bucket = { tokens: this.perNodeLimit, lastRefill: now };
      this.buckets.set(nodeId, bucket);
    }
    this.refill(bucket, this.perNodeLimit, now);

    if (bucket.tokens < 1) {
      return {
        allowed: false,
        retryAfterMs: this.timeToNextToken(bucket, this.perNodeLimit),
      };
    }

    // Consume tokens
    bucket.tokens -= 1;
    this.globalBucket.tokens -= 1;
    return { allowed: true };
  }

  /** Override for enforcement-tier throttling */
  checkWithInterval(
    nodeId: string,
    minIntervalMs: number
  ): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const bucket = this.buckets.get(nodeId);
    if (bucket && now - bucket.lastRefill < minIntervalMs) {
      return { allowed: false, retryAfterMs: minIntervalMs - (now - bucket.lastRefill) };
    }
    return this.check(nodeId);
  }

  private refill(bucket: Bucket, limit: number, now: number): void {
    const elapsed = now - bucket.lastRefill;
    const rate = limit / this.windowMs;
    const refill = elapsed * rate;
    bucket.tokens = Math.min(limit, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  private timeToNextToken(bucket: Bucket, limit: number): number {
    const rate = limit / this.windowMs;
    return Math.ceil((1 - bucket.tokens) / rate);
  }

  /** Periodically prune inactive buckets */
  prune(maxAgeMs: number = 5 * 60_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(id);
      }
    }
  }
}
