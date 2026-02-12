import type { Request, Response } from "express";
import type { Identity } from "../identity/identity.js";
import type { ClawRouteConfig } from "../config/defaults.js";
import type { RelayRequest, RelayResponse, RelayReceipt } from "../types/protocol.js";
import { verify, importPublicKey } from "../crypto/signing.js";
import { UrlPolicy } from "../security/url-policy.js";
import { RateLimiter } from "../security/rate-limiter.js";
import { NonceTracker } from "../security/nonce-tracker.js";
import { ReceiptStore } from "../receipts/store.js";
import { verifyPresentedReceipts, getEnforcementTier } from "../receipts/credit.js";
import { fetchTarget } from "./fetcher.js";
import type { KeyObject } from "node:crypto";

interface HandlerDeps {
  identity: Identity;
  config: ClawRouteConfig;
  urlPolicy: UrlPolicy;
  rateLimiter: RateLimiter;
  nonceTracker: NonceTracker;
  receiptStore: ReceiptStore;
  resolvePublicKey: (nodeId: string) => KeyObject | null;
}

export function createRelayHandler(deps: HandlerDeps) {
  const {
    identity,
    config,
    urlPolicy,
    rateLimiter,
    nonceTracker,
    receiptStore,
    resolvePublicKey,
  } = deps;

  return async function handleRelayFetch(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const relayReq = req.body as RelayRequest;

      // 1. Basic validation
      if (relayReq.version !== 1) {
        res.status(400).json({ error: "Unsupported protocol version" });
        return;
      }
      if (relayReq.method !== "GET" && relayReq.method !== "HEAD") {
        res.status(400).json({ error: "Only GET/HEAD allowed" });
        return;
      }

      // 2. Verify request signature
      const requesterKey = resolvePublicKey(relayReq.requesterNodeId);
      if (!requesterKey) {
        res.status(403).json({ error: "Unknown requester node" });
        return;
      }

      const { signature, ...unsigned } = relayReq;
      if (!verify(unsigned, signature, requesterKey)) {
        res.status(403).json({ error: "Invalid request signature" });
        return;
      }

      // 3. Check nonce (replay prevention)
      if (!nonceTracker.check(relayReq.requestId, relayReq.nonce)) {
        res.status(409).json({ error: "Replayed request" });
        return;
      }

      // 4. Check timestamp freshness (10 min window)
      const age = Date.now() - relayReq.timestamp;
      if (Math.abs(age) > config.nonceWindowMs) {
        res.status(400).json({ error: "Request timestamp too old or too far in the future" });
        return;
      }

      // 5. Verify credit proof and determine enforcement tier
      const creditFromReceipts = verifyPresentedReceipts(
        relayReq.creditProof.receipts,
        relayReq.requesterNodeId,
        resolvePublicKey,
        config.receiptMaxAgeDays,
        config.creditHalfLifeDays
      );

      const effectiveBalance =
        relayReq.creditProof.balance + creditFromReceipts;
      const tier = getEnforcementTier(effectiveBalance, config);

      if (tier === "cutoff") {
        res.status(402).json({ error: "Insufficient credits", balance: effectiveBalance });
        return;
      }

      // 6. Rate limiting (with tier-aware throttling)
      if (tier === "throttled") {
        const throttleCheck = rateLimiter.checkWithInterval(
          relayReq.requesterNodeId,
          config.tierThrottleIntervalMs
        );
        if (!throttleCheck.allowed) {
          res
            .status(429)
            .json({ error: "Throttled", retryAfterMs: throttleCheck.retryAfterMs });
          return;
        }
      } else {
        const rateCheck = rateLimiter.check(relayReq.requesterNodeId);
        if (!rateCheck.allowed) {
          res
            .status(429)
            .json({ error: "Rate limited", retryAfterMs: rateCheck.retryAfterMs });
          return;
        }
      }

      // 7. URL policy check
      const urlCheck = urlPolicy.check(relayReq.targetUrl);
      if (!urlCheck.allowed) {
        res.status(403).json({ error: `URL blocked: ${urlCheck.reason}` });
        return;
      }

      // 8. Fetch the target
      const result = await fetchTarget(
        relayReq.targetUrl,
        relayReq.method,
        relayReq.headers,
        Math.min(relayReq.timeout, config.fetchTimeoutMs),
        config.maxResponseBodyBytes
      );

      // 9. Build and sign response
      const responsePayload: Omit<RelayResponse, "signature"> = {
        requestId: relayReq.requestId,
        relayNodeId: identity.nodeId,
        statusCode: result.statusCode,
        headers: result.headers,
        body: result.body,
        bodyHash: result.bodyHash,
        bodyTruncated: result.bodyTruncated,
        fetchDurationMs: result.durationMs,
        timestamp: Date.now(),
      };

      const responseSig = identity.sign(responsePayload);
      const response: RelayResponse = { ...responsePayload, signature: responseSig };

      res.status(200).json(response);
    } catch (err: any) {
      res.status(502).json({ error: `Relay fetch failed: ${err.message}` });
    }
  };
}

export function createReceiptHandler(deps: Pick<HandlerDeps, "receiptStore" | "resolvePublicKey">) {
  return async function handleReceipt(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const receipt = req.body as RelayReceipt;

      // Verify signature
      const requesterKey = deps.resolvePublicKey(receipt.requesterNodeId);
      if (!requesterKey) {
        res.status(403).json({ error: "Unknown receipt issuer" });
        return;
      }

      const { signature, ...unsigned } = receipt;
      if (!verify(unsigned, signature, requesterKey)) {
        res.status(403).json({ error: "Invalid receipt signature" });
        return;
      }

      deps.receiptStore.storeEarned(receipt);
      res.status(200).json({ stored: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };
}
