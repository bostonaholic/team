/**
 * REST API Fastify plugin.
 *
 * Registers GET /api/state which returns the current RunState snapshot as JSON.
 */

import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import type { RunState } from "./state.js";

interface ApiPluginOptions extends FastifyPluginOptions {
  getSnapshot: () => RunState;
}

export async function apiPlugin(
  app: FastifyInstance,
  opts: ApiPluginOptions,
): Promise<void> {
  app.get("/api/state", async () => {
    return opts.getSnapshot();
  });
}
