// Hand-written declarations for the subset of scripts/preflight-gcp-setup.mjs consumed
// by lib/admin/migration-readiness.ts. Callers must pass explicit arguments: the
// implementation's defaults resolve paths from import.meta.url, which mis-resolves after
// Next.js bundling.

export interface GcpSetupPlan {
  project: { id: string | null };
  apis: Record<string, unknown>;
  firebase: Record<string, unknown>;
  firestore: Record<string, unknown>;
  budget: Record<string, unknown>;
  blockers: string[];
  warnings: string[];
}

export function buildGcpSetupPlan(options?: {
  projectId?: string;
  env?: Record<string, string | undefined>;
  awayModeActive?: boolean;
  rulesFileExists?: boolean;
  definedIndexCount?: number;
}): GcpSetupPlan;

export function buildReadiness(input: { blockers: string[]; warnings: string[] }): {
  ok: boolean;
  blockers: string[];
  warnings: string[];
};
