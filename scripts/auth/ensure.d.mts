export type AuthNeed = "gcloud" | "adc" | "env" | "gh" | "canary";
export interface AuthenticationStatus {
  credential: AuthNeed;
  state: "ok" | "repaired" | "repairable" | "blocked" | "skipped" | "unverified";
  identity: string;
  detail: string;
  code?: string;
  humanStep?: string;
}
export function ensureAuthenticated(options?: {
  need?: AuthNeed[];
  unattended?: boolean;
  statusOnly?: boolean;
  env?: NodeJS.ProcessEnv;
  root?: string;
  canary?: Array<{ label: string; profile: string; origin: string; email: string }>;
}): Promise<{ items: AuthenticationStatus[]; exitCode: number; lines: string[] }>;
