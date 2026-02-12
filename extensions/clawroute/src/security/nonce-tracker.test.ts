import { describe, it, expect } from "vitest";
import { NonceTracker } from "./nonce-tracker.js";

describe("security/nonce-tracker", () => {
  it("accepts fresh nonces", () => {
    const nt = new NonceTracker(60_000);
    expect(nt.check("req1", "abc")).toBe(true);
    expect(nt.check("req2", "def")).toBe(true);
  });

  it("rejects duplicate nonces", () => {
    const nt = new NonceTracker(60_000);
    expect(nt.check("req1", "abc")).toBe(true);
    expect(nt.check("req1", "abc")).toBe(false);
  });

  it("same requestId with different nonce is ok", () => {
    const nt = new NonceTracker(60_000);
    expect(nt.check("req1", "abc")).toBe(true);
    expect(nt.check("req1", "def")).toBe(true);
  });

  it("tracks size", () => {
    const nt = new NonceTracker(60_000);
    nt.check("a", "1");
    nt.check("b", "2");
    expect(nt.size).toBe(2);
  });
});
