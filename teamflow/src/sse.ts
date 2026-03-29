/**
 * SSE (Server-Sent Events) Fastify plugin.
 *
 * Registers GET /api/events as an SSE endpoint.
 * On connect, sends a `snapshot` message with the full current state.
 * Exposes broadcast() to push `update` messages to all connected clients
 * (critic issue M4: sends full RunState snapshot, not partial diff).
 */

import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import type { RunState } from "./state.js";

interface SSEPluginOptions extends FastifyPluginOptions {
  getSnapshot: () => RunState;
}

const clients = new Set<FastifyReply>();

export async function ssePlugin(
  app: FastifyInstance,
  opts: SSEPluginOptions,
): Promise<void> {
  app.get("/api/events", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    clients.add(reply);

    // Send snapshot on connect
    const snapshot = opts.getSnapshot();
    reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

    // Handle client disconnect
    request.raw.on("close", () => {
      clients.delete(reply);
    });

    // Keep connection open -- don't call reply.send()
    // Fastify will handle cleanup on disconnect
  });
}

export function getBroadcast(_app: FastifyInstance): (data: unknown) => void {
  return (data: unknown) => {
    const message = `event: update\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try {
        client.raw.write(message);
      } catch {
        clients.delete(client);
      }
    }
  };
}
