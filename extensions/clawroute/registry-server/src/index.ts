import Fastify from "fastify";
import { RegistryStore } from "./store.js";
import { registerRoutes } from "./routes.js";
import { StaleNodeCleaner } from "./cleanup.js";

const PORT = parseInt(process.env.REGISTRY_PORT ?? "19900", 10);
const DB_PATH = process.env.REGISTRY_DB ?? ":memory:";
const STALE_MS = parseInt(process.env.STALE_MS ?? String(5 * 60_000), 10);

async function main() {
  const store = new RegistryStore(DB_PATH);
  const cleaner = new StaleNodeCleaner(store, STALE_MS);

  const app = Fastify({ logger: true });
  registerRoutes(app, store);

  cleaner.start();

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`[Registry] Listening on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    cleaner.stop();
    await app.close();
    store.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
