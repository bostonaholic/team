/**
 * Offset-based file tailer for events.jsonl.
 *
 * Uses fs.watch to detect changes. On each callback, reads ALL bytes from the
 * current offset to EOF (critic issue C3: multiple rapid appends may coalesce
 * into a single callback). Buffers partial lines across reads.
 */

import { open, watch, stat } from "node:fs/promises";
import { existsSync, watchFile, unwatchFile } from "node:fs";
import { dirname } from "node:path";

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
  let watcher: ReturnType<typeof watchFile> | null = null;
  let fsWatcher: Awaited<ReturnType<typeof watch>> | null = null;

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
      // Watch the file directly
      try {
        const ac = new AbortController();
        fsWatcher = watch(filePath, { signal: ac.signal }) as any;
        (async () => {
          try {
            for await (const _event of watch(filePath, { signal: ac.signal })) {
              if (closed) break;
              await readNewData();
            }
          } catch {
            // Watcher closed or aborted
          }
        })();
        // Store abort controller for cleanup
        (fsWatcher as any).__ac = ac;
      } catch {
        // Fallback to polling
        watchFile(filePath, { interval: 200 }, () => {
          readNewData();
        });
        watcher = filePath as any;
      }
    } else {
      // File doesn't exist yet -- watch the parent directory
      const dir = dirname(filePath);
      try {
        const ac = new AbortController();
        (async () => {
          try {
            for await (const event of watch(dir, { signal: ac.signal })) {
              if (closed) break;
              if (existsSync(filePath)) {
                ac.abort();
                await startWatching();
                break;
              }
            }
          } catch {
            // Watcher closed or aborted
          }
        })();
        fsWatcher = { __ac: ac } as any;
      } catch {
        // Fallback: poll for file creation
        const interval = setInterval(async () => {
          if (closed) {
            clearInterval(interval);
            return;
          }
          if (existsSync(filePath)) {
            clearInterval(interval);
            await startWatching();
          }
        }, 200);
      }
    }
  }

  startWatching();

  return {
    close() {
      closed = true;
      if (fsWatcher && (fsWatcher as any).__ac) {
        (fsWatcher as any).__ac.abort();
      }
      if (typeof watcher === "string") {
        unwatchFile(watcher);
      }
    },
  };
}
