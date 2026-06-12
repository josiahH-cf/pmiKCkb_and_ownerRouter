// Hand-written declarations for the subset of scripts/preflight-production-cutover.mjs
// consumed by lib/admin/migration-readiness.ts.

export function validateProductionCutoverConfig(
  env: Record<string, string | undefined>,
): {
  ok: boolean;
  errors: string[];
  warnings: string[];
};
