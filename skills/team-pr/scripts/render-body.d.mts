export type PullRequestBody = {
  summary: string[];
  designDecisions?: string[];
  changes: string[];
  screenshots?: string[];
  verification: string[];
  preMerge?: string[];
  reviewNotes?: string[];
  references?: string[];
  ticketFooter?: string;
  companionPrs?: string[];
};

export function renderBody(input: PullRequestBody): string;
