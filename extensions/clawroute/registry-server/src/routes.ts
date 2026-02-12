import type { FastifyInstance } from "fastify";
import { RegistryStore } from "./store.js";

const DEFAULT_TTL_MS = 5 * 60_000;

export function registerRoutes(app: FastifyInstance, store: RegistryStore): void {
  // Register a node
  app.post("/v1/nodes/register", async (request, reply) => {
    const body = request.body as {
      nodeId: string;
      publicKey: string;
      relayUrl: string;
      timestamp: number;
      signature: string;
    };

    if (!body.nodeId || !body.publicKey || !body.relayUrl) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

    store.register(body.nodeId, body.publicKey, body.relayUrl);
    return reply.status(201).send({ ttl: DEFAULT_TTL_MS });
  });

  // Heartbeat
  app.post("/v1/nodes/heartbeat", async (request, reply) => {
    const body = request.body as {
      nodeId: string;
      load: number;
      timestamp: number;
      signature: string;
    };

    if (!body.nodeId) {
      return reply.status(400).send({ error: "Missing nodeId" });
    }

    const updated = store.heartbeat(body.nodeId, body.load ?? 0);
    if (!updated) {
      return reply.status(404).send({ error: "Node not registered" });
    }

    return reply.status(200).send({ ok: true });
  });

  // Discover peers
  app.get("/v1/nodes/discover", async (request, reply) => {
    const query = request.query as { exclude?: string; limit?: string };
    const exclude = query.exclude ?? "";
    const limit = Math.min(parseInt(query.limit ?? "10", 10), 50);

    const rows = store.discover(exclude, limit);
    const nodes = rows.map((r) => ({
      nodeId: r.node_id,
      publicKey: r.public_key,
      relayUrl: r.relay_url,
      load: r.load,
      registeredAt: r.registered_at,
      lastHeartbeat: r.last_heartbeat,
    }));

    return reply.status(200).send({ nodes });
  });

  // Voluntary deregistration
  app.delete("/v1/nodes/:nodeId", async (request, reply) => {
    const params = request.params as { nodeId: string };
    const removed = store.remove(params.nodeId);

    if (!removed) {
      return reply.status(404).send({ error: "Node not found" });
    }

    return reply.status(200).send({ ok: true });
  });

  // Health check
  app.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      nodes: store.count(),
    });
  });
}
