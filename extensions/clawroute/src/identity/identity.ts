import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { type KeyObject } from "node:crypto";
import {
  generateKeypair,
  deriveNodeId,
  sign as cryptoSign,
  verify as cryptoVerify,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
} from "../crypto/signing.js";
import type { NodeIdentity } from "../types/protocol.js";

interface IdentityFile {
  nodeId: string;
  publicKey: string;
  privateKey: string;
  createdAt: number;
}

export class Identity {
  readonly nodeId: string;
  readonly publicKeyB64: string;
  readonly createdAt: number;
  private readonly _publicKey: KeyObject;
  private readonly _privateKey: KeyObject;

  constructor(
    publicKey: KeyObject,
    privateKey: KeyObject,
    createdAt: number
  ) {
    this._publicKey = publicKey;
    this._privateKey = privateKey;
    this.nodeId = deriveNodeId(publicKey);
    this.publicKeyB64 = exportPublicKey(publicKey);
    this.createdAt = createdAt;
  }

  sign(payload: unknown): string {
    return cryptoSign(payload, this._privateKey);
  }

  verify(payload: unknown, signature: string): boolean {
    return cryptoVerify(payload, signature, this._publicKey);
  }

  get publicKey(): KeyObject {
    return this._publicKey;
  }

  toJSON(): NodeIdentity {
    return {
      nodeId: this.nodeId,
      publicKey: this.publicKeyB64,
      privateKey: exportPrivateKey(this._privateKey),
      createdAt: this.createdAt,
    };
  }

  static async load(identityDir: string): Promise<Identity> {
    const dir = resolveDir(identityDir);
    const filePath = join(dir, "identity.json");

    if (existsSync(filePath)) {
      const raw = await readFile(filePath, "utf-8");
      const data: IdentityFile = JSON.parse(raw);
      const pubKey = importPublicKey(data.publicKey);
      const privKey = importPrivateKey(data.privateKey);
      return new Identity(pubKey, privKey, data.createdAt);
    }

    return Identity.generate(identityDir);
  }

  static async generate(identityDir: string): Promise<Identity> {
    const dir = resolveDir(identityDir);
    await mkdir(dir, { recursive: true });

    const { publicKey, privateKey } = generateKeypair();
    const createdAt = Date.now();
    const identity = new Identity(publicKey, privateKey, createdAt);

    const data: IdentityFile = {
      nodeId: identity.nodeId,
      publicKey: exportPublicKey(publicKey),
      privateKey: exportPrivateKey(privateKey),
      createdAt,
    };

    const filePath = join(dir, "identity.json");
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    await chmod(filePath, 0o600);

    return identity;
  }
}

function resolveDir(dir: string): string {
  if (dir.startsWith("~")) {
    return join(homedir(), dir.slice(1));
  }
  return dir;
}
