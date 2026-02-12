import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  sign,
  verify,
  canonicalize,
  deriveNodeId,
  hashSha256,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
} from "./signing.js";

describe("crypto/signing", () => {
  it("generates a valid Ed25519 keypair", () => {
    const kp = generateKeypair();
    expect(kp.publicKey).toBeDefined();
    expect(kp.privateKey).toBeDefined();
  });

  it("signs and verifies a payload", () => {
    const kp = generateKeypair();
    const payload = { foo: "bar", num: 42 };
    const sig = sign(payload, kp.privateKey);
    expect(typeof sig).toBe("string");
    expect(verify(payload, sig, kp.publicKey)).toBe(true);
  });

  it("rejects tampered payload", () => {
    const kp = generateKeypair();
    const payload = { foo: "bar" };
    const sig = sign(payload, kp.privateKey);
    expect(verify({ foo: "baz" }, sig, kp.publicKey)).toBe(false);
  });

  it("rejects wrong key", () => {
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();
    const payload = { test: true };
    const sig = sign(payload, kp1.privateKey);
    expect(verify(payload, sig, kp2.publicKey)).toBe(false);
  });

  it("canonicalize produces stable output", () => {
    const a = canonicalize({ b: 2, a: 1 });
    const b = canonicalize({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2}');
  });

  it("deriveNodeId produces cr_ prefix", () => {
    const kp = generateKeypair();
    const nodeId = deriveNodeId(kp.publicKey);
    expect(nodeId.startsWith("cr_")).toBe(true);
    expect(nodeId.length).toBeGreaterThan(10);
  });

  it("deriveNodeId is deterministic", () => {
    const kp = generateKeypair();
    expect(deriveNodeId(kp.publicKey)).toBe(deriveNodeId(kp.publicKey));
  });

  it("hashSha256 produces hex", () => {
    const h = hashSha256("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("exports and imports public key round-trip", () => {
    const kp = generateKeypair();
    const exported = exportPublicKey(kp.publicKey);
    const imported = importPublicKey(exported);
    const payload = { test: "roundtrip" };
    const sig = sign(payload, kp.privateKey);
    expect(verify(payload, sig, imported)).toBe(true);
  });

  it("exports and imports private key round-trip", () => {
    const kp = generateKeypair();
    const exported = exportPrivateKey(kp.privateKey);
    const imported = importPrivateKey(exported);
    const payload = { test: "private roundtrip" };
    const sig = sign(payload, imported);
    expect(verify(payload, sig, kp.publicKey)).toBe(true);
  });
});
