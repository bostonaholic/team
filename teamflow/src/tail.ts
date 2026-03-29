/**
 * Offset-based file tailer for events.jsonl.
 *
 * Uses fs.watch to detect changes. On each callback, reads ALL bytes from the
 * current offset to EOF (critic issue C3: multiple rapid appends may coalesce
 * into a single callback). Buffers partial lines across reads.
 */

import { open } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface TailedEvent {
  seq: number;
  event: string;
  producer: string;
  ts: string;
  data?: Record<string, unknown>;
  artifact?: string | null;
  [key: string]: unknown;
}

export function createTailer(
  filePath: string,
  onEvents: (events: TailedEvent[]) => void,
): { close: () => void } {
  let offset = 0;
  let partialLine = "";
  let closed = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let creationPollInterval: ReturnType<typeof setInterval> | null = null;

  async function readNewData(): Promise<void> {
    if (closed) return;

    let fileHandle;
    try {
      fileHandle = await open(filePath, "r");
      const fileStat = await fileHandle.stat();
      const fileSize = fileStat.size;

      if (fileSize <= offset) {
        await fileHandle.close();
        return;
      }

      const buffer = Buffer.alloc(fileSize - offset);
      await fileHandle.read(buffer, 0, buffer.length, offset);
      offset = fileSize;
      await fileHandle.close();

      const chunk = partialLine + buffer.toString("utf-8");
      const lines = chunk.split("\n");

      // Last element might be a partial line
      partialLine = lines.pop() || "";

      const events: TailedEvent[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          // Skip malformed lines
        }
      }

      if (events.length > 0) {
        onEvents(events);
      }
    } catch {
      // File might not exist yet or be temporarily unavailable
      if (fileHandle) {
        try { await fileHandle.close(); } catch { /* ignore */ }
      }
    }
  }

  async function startWatching(): Promise<void> {
    // Do an initial read to pick up existing content
    await readNewData();

    if (closed) return;

    if (existsSync(filePath)) {
      // Use polling as the primary mechanism — reliable on all platforms.
      // fs.watch on macOS can miss or coalesce file-append events.
      // 300ms is fast enough for a local dev dashboard.
      pollInterval = setInterval(() => {
        if (!closed) readNewData();
      }, 300);
    } else {
      // File doesn't exist yet — poll for creation
      creationPollInterval = setInterval(async () => {
        if (closed) {
          if (creationPollInterval) clearInterval(creationPollInterval);
          return;
        }
        if (existsSync(filePath)) {
          if (creationPollInterval) clearInterval(creationPollInterval);
          creationPollInterval = null;
          await startWatching();
        }
      }, 300);
    }
  }

  startWatching();

  return {
    close() {
      closed = true;
      if (pollInterval) clearInterval(pollInterval);
      if (creationPollInterval) clearInterval(creationPollInterval);
    },
  };
}
