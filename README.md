# ClawRoute

[![Support me on Patreon](https://img.shields.io/badge/Patreon-Support%20my%20work-FF424D?style=flat&logo=patreon&logoColor=white)](https://www.patreon.com/AndersBjarby)

ClawRoute is a one-hop distributed relay mesh for OpenClaw. It distributes web fetches across peer nodes to gain IP diversity and avoid IP-based blocking, using a receipt-based credit system so nodes that relay for others earn credit to have their own fetches relayed.

## What it does

- **Relay mesh** — your fetch can be performed by a peer node, so requests come from diverse IPs
- **Receipt-based credits** — signed receipts track who relayed what; new nodes start with a credit grant and earn more by relaying
- **Registry server** — a separate service handles peer discovery and node registration
- **Cryptographic identity** — each node holds a keypair and signs requests/receipts
- **Security controls** — URL policy, nonce tracking, and rate limiting on relayed traffic

Exposes a `clawroute_fetch` tool plus a `clawroute` CLI namespace with `status`, `peers`, `receipts`, `identity`, and `test` commands.

## Setup

The plugin lives in `extensions/clawroute`. Requires Node.js >= 22.

```bash
cd extensions/clawroute
npm install
npm run build      # compile TypeScript to dist/
npm test           # run the vitest suite
```

Run the registry server separately:

```bash
cd extensions/clawroute/registry-server
npm install
npm run build
npm start          # starts on http://localhost:19900 by default
```

### Configuration

Defaults (see `openclaw.plugin.json`): registry URL `http://localhost:19900`, local relay port `19800`, identity stored in `~/.openclaw/clawroute`, 5 MB max response body, 15 s fetch timeout, 50 credits for new nodes.

## Tech

TypeScript, Node.js >= 22, Express / Fastify, better-sqlite3, undici, vitest. OpenClaw plugin.
