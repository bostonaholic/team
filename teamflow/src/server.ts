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

async function start() {
  try {
    const { createStateEngine } = await import("./state.js");
    const { createTailer } = await import("./tail.js");
    const { ssePlugin, getBroadcast } = await import("./sse.js");
    const { apiPlugin } = await import("./api.js");
    const { discoverSessions, createSessionPoller } = await import("./sessions.js");

    // Per-session map: sessionId -> { engine, tailer }
    const sessions = new Map<string, { engine: ReturnType<typeof createStateEngine>, tailer: ReturnType<typeof createTailer> }>();

    function getAllSnapshots(): Array<{ sessionId: string; state: RunState }> {
      const result: Array<{ sessionId: string; state: RunState }> = [];
      for (const [id, entry] of sessions) {
        result.push({ sessionId: id, state: entry.engine.getSnapshot() });
      }
      return result;
    }

    await app.register(ssePlugin, { getAllSnapshots: () => getAllSnapshots() });
    const { broadcastSession, broadcastRemoval } = getBroadcast(app);

    await app.register(apiPlugin, { getAllSnapshots: () => getAllSnapshots() });

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

    function addSession(id: string, path: string) {
      if (sessions.has(id)) return;

      const engine = createStateEngine();
      const eventsPath = join(path, "events.jsonl");
      const tailer = createTailer(eventsPath, (events) => {
        engine.apply(events);
        broadcastSession(id, engine.getSnapshot());
      });

      sessions.set(id, { engine, tailer });
    }

    function removeSession(id: string) {
      const entry = sessions.get(id);
      if (entry) {
        entry.tailer.close();
        sessions.delete(id);
        broadcastRemoval(id);
      }
    }

    // Discover existing sessions on startup
    const initial = await discoverSessions(teamDir);
    for (const session of initial) {
      addSession(session.id, session.path);
    }

    // Poll for new/removed sessions
    createSessionPoller(teamDir, (added, removed) => {
      for (const session of added) {
        addSession(session.id, session.path);
      }
      for (const id of removed) {
        removeSession(id);
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
