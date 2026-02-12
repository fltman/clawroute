import { describe, it, expect } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("security/rate-limiter", () => {
  it("allows requests under limit", () => {
    const rl = new RateLimiter(5, 10, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(rl.check("node1").allowed).toBe(true);
    }
  });

  it("blocks when per-node limit exceeded", () => {
    const rl = new RateLimiter(3, 100, 60_000);
    rl.check("node1");
    rl.check("node1");
    rl.check("node1");
    const result = rl.check("node1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("blocks when global limit exceeded", () => {
    const rl = new RateLimiter(100, 3, 60_000);
    rl.check("a");
    rl.check("b");
    rl.check("c");
    expect(rl.check("d").allowed).toBe(false);
  });

  it("different nodes have independent limits", () => {
    const rl = new RateLimiter(2, 100, 60_000);
    rl.check("node1");
    rl.check("node1");
    expect(rl.check("node1").allowed).toBe(false);
    expect(rl.check("node2").allowed).toBe(true);
  });
});
