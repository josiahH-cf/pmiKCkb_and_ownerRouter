// Hand-written declarations for the subset of scripts/check-budget-guard.mjs consumed by
// lib/admin/migration-readiness.ts. Keep in sync with the implementation; the
// migration-readiness smoke test exercises the real module shapes.

export interface BudgetGuardConfig {
  askDemoMode: boolean;
  notificationsEnabled: boolean;
  geminiAnswerModel: string;
  liveSpaceIds: string[];
  budgetCapUsd: number;
}

export interface BudgetGuardResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  budgetCapUsd: number;
  posture: "live" | "demo";
  awayModeActive: boolean;
}

export function readBudgetGuardConfig(
  env?: Record<string, string | undefined>,
  localEnv?: Record<string, string | undefined>,
): BudgetGuardConfig;

export function evaluateBudgetGuard(
  config: BudgetGuardConfig,
  options?: {
    awayModeActive?: boolean;
    allowPro?: boolean;
    allowNotifications?: boolean;
    allowMultipleSpaces?: boolean;
  },
): BudgetGuardResult;

export function readAwayModeStatus(docPath?: string): "ACTIVE" | "INACTIVE" | "UNKNOWN";
