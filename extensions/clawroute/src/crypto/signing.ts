import {
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createHash,
  createPublicKey,
  createPrivateKey,
  type KeyObject,
} from "node:crypto";
import stableStringify from "json-stable-stringify";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface Keypair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export function generateKeypair(): Keypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey, privateKey };
}

export function canonicalize(obj: unknown): string {
  return stableStringify(obj) as string;
}

export function sign(payload: unknown, privateKey: KeyObject): string {
  const data = Buffer.from(canonicalize(payload), "utf-8");
  const sig = edSign(null, data, privateKey);
  return sig.toString("base64");
}

export function verify(
  payload: unknown,
  signature: string,
  publicKey: KeyObject
): boolean {
  try {
    const data = Buffer.from(canonicalize(payload), "utf-8");
    const sig = Buffer.from(signature, "base64");
    return edVerify(null, data, publicKey, sig);
  } catch {
    return false;
  }
}

export function deriveNodeId(publicKey: KeyObject): string {
  const der = publicKey.export({ type: "spki", format: "der" });
  const hash = createHash("sha256").update(der).digest();
  const first20 = hash.subarray(0, 20);
  return "cr_" + base58Encode(first20);
}

export function hashSha256(data: string): string {
  return createHash("sha256").update(data, "utf-8").digest("hex");
}

export function exportPublicKey(key: KeyObject): string {
  return key.export({ type: "spki", format: "der" }).toString("base64");
}

export function importPublicKey(b64: string): KeyObject {
  return createPublicKey({
    key: Buffer.from(b64, "base64"),
    type: "spki",
    format: "der",
  });
}

export function exportPrivateKey(key: KeyObject): string {
  return key.export({ type: "pkcs8", format: "der" }).toString("base64");
}

export function importPrivateKey(b64: string): KeyObject {
  return createPrivateKey({
    key: Buffer.from(b64, "base64"),
    type: "pkcs8",
    format: "der",
  });
}

function base58Encode(buf: Buffer): string {
  let num = BigInt("0x" + buf.toString("hex"));
  let result = "";
  while (num > 0n) {
    const rem = Number(num % 58n);
    num = num / 58n;
    result = BASE58_ALPHABET[rem] + result;
  }
  // Handle leading zeros
  for (const byte of buf) {
    if (byte === 0) {
      result = BASE58_ALPHABET[0] + result;
    } else {
      break;
    }
  }
  return result || BASE58_ALPHABET[0];
}
