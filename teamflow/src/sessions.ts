/**
 * Session discovery module.
 *
 * Scans ~/.team/ for subdirectories containing events.jsonl.
 * Falls back to flat ~/.team/events.jsonl as session "default".
 */

import { readdir, access } from "node:fs/promises";
import { join } from "node:path";

/**
 * Discover all active sessions by scanning baseDir for subdirectories
 * containing events.jsonl. Also checks for a flat events.jsonl at baseDir
 * level and includes it as session "default" for backward compatibility.
 */
export async function discoverSessions(
  baseDir: string,
): Promise<Array<{ id: string; path: string }>> {
  const sessions: Array<{ id: string; path: string }> = [];

  try {
    const entries = await readdir(baseDir, { withFileTypes: true });

    // Check subdirectories for events.jsonl
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const eventsPath = join(baseDir, entry.name, "events.jsonl");
        try {
          await access(eventsPath);
          sessions.push({ id: entry.name, path: join(baseDir, entry.name) });
        } catch {
          // Directory exists but no events.jsonl yet -- skip until next poll
        }
      }
    }

    // Check for flat events.jsonl at baseDir level (backward compat)
    const flatEventsPath = join(baseDir, "events.jsonl");
    try {
      await access(flatEventsPath);
      sessions.push({ id: "default", path: baseDir });
    } catch {
      // No flat events.jsonl -- no default session
    }
  } catch {
    // baseDir does not exist yet
  }

  return sessions;
}

/**
 * Poll for session changes. Calls discoverSessions on an interval,
 * diffs against previous set, and invokes onChange with added/removed.
 */
export function createSessionPoller(
  baseDir: string,
  onChange: (added: Array<{ id: string; path: string }>, removed: string[]) => void,
  interval: number = 300,
): { close(): void } {
  let previousIds = new Set<string>();

  async function poll() {
    const current = await discoverSessions(baseDir);
    const currentIds = new Set(current.map((s) => s.id));

    const added: Array<{ id: string; path: string }> = [];
    const removed: string[] = [];

    for (const session of current) {
      if (!previousIds.has(session.id)) {
        added.push(session);
      }
    }

    for (const id of previousIds) {
      if (!currentIds.has(id)) {
        removed.push(id);
      }
    }

    previousIds = currentIds;

    if (added.length > 0 || removed.length > 0) {
      onChange(added, removed);
    }
  }

  const timer = setInterval(poll, interval);
  // Run initial poll immediately
  poll();

  return {
    close() {
      clearInterval(timer);
    },
  };
}
