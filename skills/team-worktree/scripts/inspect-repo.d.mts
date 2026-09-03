export interface RepositoryInspection {
  repo: string;
  gitDir: string;
  commonDir: string;
  primaryRoot: string;
  branch: string;
  defaultBranch: string;
  linked: boolean;
  onDefaultBranch: boolean;
}

export function inspectRepo(repo: string): RepositoryInspection;
