import Fastify from "fastify";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { RunState } from "./state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const port = parseInt(process.env.TEAMFLOW_PORT || "7425", 10);
const host = "127.0.0.1";
const noOpen = process.env.TEAMFLOW_NO_OPEN === "1";
const teamDir = join(homedir(), ".team");

const app = Fastify({ logger: false });

// Health endpoint
app.get("/api/health", async () => {
  return { status: "ok" };
});

// Import and wire state engine, tailer, SSE, and API once they exist
let stateEngine: { apply(events: Record<string, unknown>[]): void; getSnapshot(): RunState } | null = null;
let broadcast: ((data: unknown) => void) | null = null;

async function start() {
  // Lazily import modules -- they may not exist yet during scaffolding
  try {
    const { createStateEngine } = await import("./state.js");
    const { createTailer } = await import("./tail.js");
    const { ssePlugin, getBroadcast } = await import("./sse.js");
    const { apiPlugin } = await import("./api.js");

    stateEngine = createStateEngine();

    await app.register(ssePlugin, { getSnapshot: () => stateEngine!.getSnapshot() });
    broadcast = getBroadcast(app);

    await app.register(apiPlugin, { getSnapshot: () => stateEngine!.getSnapshot() });

    // Static file serving for the built frontend
    const distDir = join(__dirname, "..", "dist");
    if (existsSync(distDir)) {
      const { default: fastifyStatic } = await import("@fastify/static");
      await app.register(fastifyStatic, {
        root: distDir,
        prefix: "/",
        wildcard: false,
      });
    }

    // Start tailing the event log
    const eventsPath = join(teamDir, "events.jsonl");
    createTailer(eventsPath, (events) => {
      stateEngine!.apply(events);
      if (broadcast) {
        broadcast(stateEngine!.getSnapshot());
      }
    });
  } catch (err) {
    // If modules aren't available yet, just serve health endpoint
    console.error("Warning: some modules not available, running in minimal mode:", (err as Error).message);
  }

  await app.listen({ port, host });
  console.log(`Teamflow dashboard running at http://${host}:${port}`);

  if (!noOpen) {
    try {
      const { default: open } = await import("open");
      await open(`http://${host}:${port}`);
    } catch {
      // open is optional
    }
  }
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
