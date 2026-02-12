import { describe, it, expect, afterEach } from "vitest";
import { Identity } from "./identity.js";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

function tmpIdentityDir(): string {
  return join(tmpdir(), `clawroute-test-${randomBytes(8).toString("hex")}`);
}

describe("identity/identity", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    dirs.length = 0;
  });

  it("generates a new identity", async () => {
    const dir = tmpIdentityDir();
    dirs.push(dir);
    const id = await Identity.generate(dir);
    expect(id.nodeId.startsWith("cr_")).toBe(true);
    expect(id.publicKeyB64).toBeTruthy();
    expect(id.createdAt).toBeGreaterThan(0);
  });

  it("loads an existing identity", async () => {
    const dir = tmpIdentityDir();
    dirs.push(dir);
    const id1 = await Identity.generate(dir);
    const id2 = await Identity.load(dir);
    expect(id2.nodeId).toBe(id1.nodeId);
    expect(id2.publicKeyB64).toBe(id1.publicKeyB64);
  });

  it("sign and verify round-trip", async () => {
    const dir = tmpIdentityDir();
    dirs.push(dir);
    const id = await Identity.generate(dir);
    const payload = { message: "hello" };
    const sig = id.sign(payload);
    expect(id.verify(payload, sig)).toBe(true);
  });

  it("creates identity on first load of empty dir", async () => {
    const dir = tmpIdentityDir();
    dirs.push(dir);
    const id = await Identity.load(dir);
    expect(id.nodeId.startsWith("cr_")).toBe(true);
  });
});
