export type CleanupMode = "merged" | "abandon";

export type ParseResult =
  | {
      ok: true;
      mode: CleanupMode;
      target: string;
      number: number;
      repository: string | null;
    }
  | { ok: false; error: string };

export function parseInput(raw: string): ParseResult;
