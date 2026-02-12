import express from "express";
import type { Server } from "node:http";
import type { Identity } from "../identity/identity.js";
import type { ClawRouteConfig } from "../config/defaults.js";
import { UrlPolicy } from "../security/url-policy.js";
import { RateLimiter } from "../security/rate-limiter.js";
import { NonceTracker } from "../security/nonce-tracker.js";
import { ReceiptStore } from "../receipts/store.js";
import { createRelayHandler, createReceiptHandler } from "./handler.js";
import type { KeyObject } from "node:crypto";

export interface RelayServerDeps {
  identity: Identity;
  config: ClawRouteConfig;
  receiptStore: ReceiptStore;
  resolvePublicKey: (nodeId: string) => KeyObject | null;
}

export class RelayServer {
  private app: express.Application;
  private server: Server | null = null;
  private readonly port: number;

  constructor(deps: RelayServerDeps) {
    this.port = deps.config.relayPort;
    this.app = express();
    this.app.use(express.json({ limit: "10mb" }));

    const urlPolicy = new UrlPolicy({
      allowGlobs: deps.config.urlAllowGlobs,
      denyGlobs: deps.config.urlDenyGlobs,
      allowPrivateIps: deps.config.urlAllowPrivateIps,
    });

    const rateLimiter = new RateLimiter(
      deps.config.perNodeRateLimit,
      deps.config.globalRateLimit,
      deps.config.rateLimitWindowMs
    );

    const nonceTracker = new NonceTracker(deps.config.nonceWindowMs);

    const handlerDeps = {
      identity: deps.identity,
      config: deps.config,
      urlPolicy,
      rateLimiter,
      nonceTracker,
      receiptStore: deps.receiptStore,
      resolvePublicKey: deps.resolvePublicKey,
    };

    this.app.post("/relay/fetch", createRelayHandler(handlerDeps));
    this.app.post("/relay/receipt", createReceiptHandler({
      receiptStore: deps.receiptStore,
      resolvePublicKey: deps.resolvePublicKey,
    }));

    this.app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        nodeId: deps.identity.nodeId,
        uptime: process.uptime(),
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app
        .listen(this.port, () => resolve())
        .on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  get address(): string {
    return `http://localhost:${this.port}`;
  }

  get listening(): boolean {
    return this.server?.listening ?? false;
  }
}
