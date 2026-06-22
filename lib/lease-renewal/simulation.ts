// Deterministic lease-renewal SIMULATION runs (Phase-1, read-only).
//
// The app is still source-blocked (no approved live sheet), so the workflow-run review surface
// renders a simulation computed in-memory from the governance-clean synthetic sample. This is the
// same "simulation-only" posture the KB already uses for process-definition runs. Pure and
// deterministic: no Firestore, no live call, no Date.now(); the sample's timestamps are fixed
// inputs. Every result carries `production_allowed: false`.

import { runRenewalPipeline, type RenewalRunResult } from "@/lib/lease-renewal/pipeline";
import {
  SAMPLE_NON_SHEET_CANDIDATES,
  SAMPLE_RENEWAL_TABLES,
} from "@/lib/lease-renewal/sample-sheet";

export const SIMULATION_RUN_ID = "sim-renewal-001";

export interface SimulationRunSummary {
  runId: string;
  label: string;
  /** Short, non-secret description for the index page. */
  description: string;
}

const SIMULATION_RUNS: readonly SimulationRunSummary[] = [
  {
    runId: SIMULATION_RUN_ID,
    label: "Sample renewal run (synthetic)",
    description:
      "Phase-1 read → reconcile → flag over the synthetic sample sheet and synthetic Rentvine / Google Form reads. No live data, no writes.",
  },
];

/** List the available simulation runs (metadata only). */
export function listSimulationRuns(): SimulationRunSummary[] {
  return SIMULATION_RUNS.map((run) => ({ ...run }));
}

/** Compute a simulation run by id, or null when the id is unknown. Deterministic and pure. */
export function getSimulationRun(runId: string): RenewalRunResult | null {
  if (runId !== SIMULATION_RUN_ID) return null;
  return runRenewalPipeline({
    runId,
    tables: SAMPLE_RENEWAL_TABLES,
    nonSheetCandidates: SAMPLE_NON_SHEET_CANDIDATES,
  });
}
