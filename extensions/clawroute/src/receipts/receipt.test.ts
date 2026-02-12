import { describe, it, expect } from "vitest";
import { createReceipt, verifyReceipt } from "./receipt.js";
import { Identity } from "../identity/identity.js";
import { verify, importPublicKey } from "../crypto/signing.js";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { rmSync } from "node:fs";

describe("receipts/receipt", () => {
  it("creates a valid signed receipt", async () => {
    const dir = join(tmpdir(), `cr-test-${randomBytes(4).toString("hex")}`);
    try {
      const id = await Identity.generate(dir);
      const receipt = createReceipt(
        id,
        "req-123",
        "cr_otherNode",
        "example.com",
        "abc123hash"
      );

      expect(receipt.version).toBe(1);
      expect(receipt.requesterNodeId).toBe(id.nodeId);
      expect(receipt.relayNodeId).toBe("cr_otherNode");
      expect(receipt.costUnits).toBe(1);
      expect(receipt.signature).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("verifyReceipt passes for valid receipt", async () => {
    const dir = join(tmpdir(), `cr-test-${randomBytes(4).toString("hex")}`);
    try {
      const id = await Identity.generate(dir);
      const receipt = createReceipt(id, "req-1", "cr_relay", "test.com", "hash");

      const valid = verifyReceipt(receipt, (payload, sig) =>
        id.verify(payload, sig)
      );
      expect(valid).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("verifyReceipt fails with wrong verifier", async () => {
    const dir1 = join(tmpdir(), `cr-test-${randomBytes(4).toString("hex")}`);
    const dir2 = join(tmpdir(), `cr-test-${randomBytes(4).toString("hex")}`);
    try {
      const id1 = await Identity.generate(dir1);
      const id2 = await Identity.generate(dir2);
      const receipt = createReceipt(id1, "req-1", "cr_relay", "test.com", "hash");

      const valid = verifyReceipt(receipt, (payload, sig) =>
        id2.verify(payload, sig)
      );
      expect(valid).toBe(false);
    } finally {
      rmSync(dir1, { recursive: true, force: true });
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});
