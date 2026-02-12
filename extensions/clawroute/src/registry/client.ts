import { request } from "undici";
import type { Identity } from "../identity/identity.js";
import type { PeerInfo } from "../types/protocol.js";

export class RegistryClient {
  private baseUrl: string;
  private identity: Identity;

  constructor(registryUrl: string, identity: Identity) {
    this.baseUrl = registryUrl.replace(/\/$/, "");
    this.identity = identity;
  }

  async register(relayUrl: string): Promise<{ ttl: number }> {
    const payload = {
      nodeId: this.identity.nodeId,
      publicKey: this.identity.publicKeyB64,
      relayUrl,
      timestamp: Date.now(),
    };
    const signature = this.identity.sign(payload);

    const { statusCode, body } = await request(
      `${this.baseUrl}/v1/nodes/register`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, signature }),
      }
    );

    if (statusCode !== 200 && statusCode !== 201) {
      const text = await body.text();
      throw new Error(`Registry register failed (${statusCode}): ${text}`);
    }

    return (await body.json()) as { ttl: number };
  }

  async heartbeat(load: number = 0): Promise<void> {
    const payload = {
      nodeId: this.identity.nodeId,
      load,
      timestamp: Date.now(),
    };
    const signature = this.identity.sign(payload);

    const { statusCode, body } = await request(
      `${this.baseUrl}/v1/nodes/heartbeat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, signature }),
      }
    );

    if (statusCode !== 200) {
      const text = await body.text();
      throw new Error(`Registry heartbeat failed (${statusCode}): ${text}`);
    }
    // Drain body
    await body.text();
  }

  async discover(limit: number = 10): Promise<PeerInfo[]> {
    const { statusCode, body } = await request(
      `${this.baseUrl}/v1/nodes/discover?exclude=${this.identity.nodeId}&limit=${limit}`
    );

    if (statusCode !== 200) {
      const text = await body.text();
      throw new Error(`Registry discover failed (${statusCode}): ${text}`);
    }

    const result = (await body.json()) as { nodes: PeerInfo[] };
    return result.nodes;
  }

  async deregister(): Promise<void> {
    const payload = {
      nodeId: this.identity.nodeId,
      timestamp: Date.now(),
    };
    const signature = this.identity.sign(payload);

    const { statusCode, body } = await request(
      `${this.baseUrl}/v1/nodes/${this.identity.nodeId}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, signature }),
      }
    );

    // Accept 200 or 404 (already gone)
    if (statusCode !== 200 && statusCode !== 404) {
      const text = await body.text();
      throw new Error(`Registry deregister failed (${statusCode}): ${text}`);
    }
    await body.text();
  }
}
