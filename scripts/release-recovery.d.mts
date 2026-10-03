import type { GoogleAuth } from "google-auth-library";
import type {
  PredecessorBaseline,
  RecoveryBaselineReference,
} from "./production-assurance-receipts.mjs";
import type { SheetWritebackValue } from "../lib/production-assurance/sheet-writeback-expectation.mjs";
type Client = Awaited<ReturnType<GoogleAuth["getClient"]>>;
/** Historical S128 receipts: the tooling forced the recovery target's Sheet switch to false. */
export type LegacyPausedRecoveryDifference =
  "sheet_writeback_false_and_revision_identity";
/** S159 receipts: the target is the predecessor's actual configuration under a new identity. */
export type PredecessorActualRecoveryDifference = "revision_identity_only";
export interface RecoveryBaseline {
  readonly schemaVersion: "pmi-kc-recovery-baseline.v1";
  readonly receiptId: string;
  readonly runId: string;
  readonly sha: string;
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly issuedAt: string;
  readonly originalBaseline: PredecessorBaseline;
  readonly originalFingerprint: string;
  readonly targetRevision: string;
  readonly targetFingerprint: string;
  readonly imageDigests: readonly string[];
  readonly allowedDifference:
    | LegacyPausedRecoveryDifference
    | PredecessorActualRecoveryDifference;
  /** The captured predecessor's actual switch value. Absent only on a historical receipt. */
  readonly predecessorSheetWriteback?: SheetWritebackValue;
  readonly tag: string;
  readonly tagOrigin: string;
  readonly tagPreviousRevision: string;
  readonly serviceControlsHash: string;
  readonly assurance: RecoveryAssurance;
}
export interface RecoveryAssurance {
  readonly phase: "recovery_preparation";
  readonly verifiedAt: string;
  readonly adminVerdict: "passed";
  readonly editorVerdict: "not_run";
  readonly monitoringState: "ready";
  readonly trafficPercent: 0;
}
export interface RecoveryTarget {
  readonly expectedRevision: string;
  readonly expectedCommit: string;
  readonly expectedConfigurationFingerprint: string;
  readonly origin: string;
  readonly phase: "recovery_preparation";
}
export const RECOVERY_BASELINE_SCHEMA: RecoveryBaseline["schemaVersion"];
export function recoveryHash(value: unknown): string;
export const LEGACY_PAUSED_RECOVERY_DIFFERENCE: LegacyPausedRecoveryDifference;
export const PREDECESSOR_ACTUAL_RECOVERY_DIFFERENCE: PredecessorActualRecoveryDifference;
/** The exact switch value this receipt's recovery target must read back with. */
export function recoveryTargetSheetWriteback(
  receipt: Pick<RecoveryBaseline, "allowedDifference" | "predecessorSheetWriteback">,
): SheetWritebackValue;
export function assertRecoveryTemplatePreservesPredecessor(
  template: unknown,
  predecessorSheetWriteback: unknown,
): void;
export function predecessorActualTemplate(
  source: unknown,
  expectedRevision: string,
  imageDigests: readonly string[],
): {
  template: Record<string, unknown>;
  expected: Record<string, unknown>;
  predecessorSheetWriteback: SheetWritebackValue;
};
export function assertRecoveryBaseline(
  value: unknown,
  expected?: Partial<RecoveryBaseline>,
): RecoveryBaseline;
export function recoveryReference(
  path: string,
  receipt: RecoveryBaseline,
): RecoveryBaselineReference;
export function readRecoveryBaseline(
  reference: RecoveryBaselineReference,
  expected?: Partial<RecoveryBaseline>,
): RecoveryBaseline;
export function prepareRecoveryBaseline(
  input: {
    runId: string;
    sha: string;
    project: string;
    region: string;
    service: string;
    predecessorRevision: string;
    tag: string;
    tagOrigin: string;
    tagPreviousRevision: string;
  },
  dependencies: {
    client: Client;
    /** Deterministic test seam; the default proves kernel lock and exact checkpoint. */
    assertLock?(): void;
    captureOriginalBaseline(): Promise<PredecessorBaseline>;
    assureTarget(target: RecoveryTarget): Promise<RecoveryAssurance>;
  },
): Promise<{ receipt: RecoveryBaseline; path: string }>;
export function verifyRecoveryAvailability(
  receipt: RecoveryBaseline,
  dependencies: {
    client: Client;
    requireFresh?: boolean;
    candidateRevision?: string;
    stateRoot?: string;
  },
): Promise<boolean>;
export function executeSafeRecovery(
  reference: RecoveryBaselineReference,
  dependencies: {
    client: Client;
    candidateRevision: string;
    /** Deterministic test seam; the default proves kernel lock and exact checkpoint. */
    assertLock?(receipt: RecoveryBaseline): void;
    verifyRecovered(receipt: RecoveryBaseline): Promise<void>;
  },
): Promise<{
  state: "ROLLED_BACK_VERIFIED";
  revision: string;
  fingerprint: string;
  receiptPath: string;
}>;
