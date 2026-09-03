export interface RepositoryInspection {
  repo: string;
  gitDir: string;
  commonDir: string;
  primaryRoot: string;
  branch: string;
  defaultBranch: string;
  linked: boolean;
  onDefaultBranch: boolean;
  preserveArtifactHome: boolean;
}

export function inspectRepo(repo: string, artifactDir?: string | null): RepositoryInspection;
