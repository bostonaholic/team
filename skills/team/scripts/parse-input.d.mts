export type TeamInput =
  | { mode: "start"; request: string }
  | { mode: "resume"; id: string; only: string | null };

export function parseTeamInput(raw: string): TeamInput;
