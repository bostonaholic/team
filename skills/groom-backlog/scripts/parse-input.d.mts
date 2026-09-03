export interface ParsedProject {
  number: number;
  owner: string | null;
  kind: "users" | "orgs" | null;
}

export type ParseResult =
  | {
      ok: true;
      mode: "board" | "promotion";
      project: ParsedProject | null;
      promote: number | null;
    }
  | { ok: false; error: string };

export function parseInput(raw: string): ParseResult;
