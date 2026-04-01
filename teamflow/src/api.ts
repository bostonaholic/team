/**
 * REST API Fastify plugin.
 *
 * Registers GET /api/state which returns all session snapshots as a
 * Record<string, RunState> keyed by sessionId.
 */

import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import type { RunState } from "./state.js";

interface ApiPluginOptions extends FastifyPluginOptions {
  getAllSnapshots: () => Array<{ sessionId: string; state: RunState }>;
}

export async function apiPlugin(
  app: FastifyInstance,
  opts: ApiPluginOptions,
): Promise<void> {
  app.get("/api/state", async () => {
    const snapshots = opts.getAllSnapshots();
    const result: Record<string, RunState> = {};
    for (const entry of snapshots) {
      result[entry.sessionId] = entry.state;
    }
    return result;
  });
}
