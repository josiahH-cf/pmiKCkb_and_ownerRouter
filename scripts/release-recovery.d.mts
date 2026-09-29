import type { GoogleAuth } from "google-auth-library";
import type {
  PredecessorBaseline,
  RecoveryBaselineReference,
} from "./production-assurance-receipts.mjs";
type Client = Awaited<ReturnType<GoogleAuth["getClient"]>>;
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
  readonly allowedDifference: "sheet_writeback_false_and_revision_identity";
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
export function revisionSheetPaused(value: unknown): boolean;
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
