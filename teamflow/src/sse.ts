/**
 * SSE (Server-Sent Events) Fastify plugin.
 *
 * Registers GET /api/events as an SSE endpoint.
 * On connect, sends one `snapshot` message per known session with envelope
 * { sessionId, state }. Exposes broadcastSession() and broadcastRemoval()
 * to push multiplexed updates to all connected clients.
 */

import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import type { RunState } from "./state.js";

interface SSEPluginOptions extends FastifyPluginOptions {
  getAllSnapshots: () => Array<{ sessionId: string; state: RunState }>;
}

const clients = new Set<FastifyReply>();

export async function ssePlugin(
  app: FastifyInstance,
  opts: SSEPluginOptions,
): Promise<void> {
  app.get("/api/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    clients.add(reply);

    // Flush headers with a comment so EventSource fires onopen immediately
    reply.raw.write(":ok\n\n");

    // Send one snapshot per known session on connect
    const snapshots = opts.getAllSnapshots();
    for (const entry of snapshots) {
      reply.raw.write(`event: snapshot\ndata: ${JSON.stringify({ sessionId: entry.sessionId, state: entry.state })}\n\n`);
    }

    // Handle client disconnect
    request.raw.on("close", () => {
      clients.delete(reply);
    });

    // Keep connection open -- don't call reply.send()
  });
}

export function getBroadcast(_app: FastifyInstance): { broadcastSession: (sessionId: string, state: RunState) => void; broadcastRemoval: (sessionId: string) => void } {
  return {
    broadcastSession(sessionId: string, state: RunState) {
      const message = `event: update\ndata: ${JSON.stringify({ sessionId, state })}\n\n`;
      for (const client of clients) {
        try {
          client.raw.write(message);
        } catch {
          clients.delete(client);
        }
      }
    },
    broadcastRemoval(sessionId: string) {
      const message = `event: session-removed\ndata: ${JSON.stringify({ sessionId })}\n\n`;
      for (const client of clients) {
        try {
          client.raw.write(message);
        } catch {
          clients.delete(client);
        }
      }
    },
  };
}
