export interface PredecessorBaseline {
  readonly verifiedAt: string;
  readonly canonicalOrigin: string;
  readonly expectedCommit: string;
  readonly expectedRevision: string;
  readonly expectedConfigurationFingerprint: string;
  readonly trafficPercent: 100;
  readonly adminVerdict: "passed";
  readonly editorVerdict: "passed";
  readonly monitoringState: "ready";
}

export interface CandidateAssuranceReceipt {
  readonly schemaVersion: "pmi-kc-candidate-assurance-receipt.v2";
  readonly candidateReceiptId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly candidateOrigin: string;
  readonly canonicalOrigin: string;
  readonly expectedCommit: string;
  readonly expectedRevision: string;
  readonly expectedConfigurationFingerprint: string;
  readonly predecessorRevision: string;
  readonly predecessorBaseline: PredecessorBaseline;
  readonly adminVerdict: "passed";
  readonly editorVerdict: "passed";
  readonly reconciliationState: "matched";
  readonly monitoringState: "ready";
}

export interface PromotionReceipt {
  readonly schemaVersion: "pmi-kc-promotion-receipt.v2";
  readonly candidateReceiptId: string;
  readonly candidateReceiptIssuedAt: string;
  readonly promotionStartedAt: string;
  readonly promotionVerifiedAt: string;
  readonly project: string;
  readonly region: string;
  readonly service: string;
  readonly canonicalOrigin: string;
  readonly expectedCommit: string;
  readonly expectedRevision: string;
  readonly expectedConfigurationFingerprint: string;
  readonly predecessorRevision: string;
  readonly predecessorBaseline: PredecessorBaseline;
}

export interface ReceiptReservation {
  readonly path: string;
  readonly pendingPath: string;
  readonly descriptor: number;
  open: boolean;
  finalPublished: boolean;
  readonly io: unknown;
}

export const CANDIDATE_ASSURANCE_RECEIPT_SCHEMA: CandidateAssuranceReceipt["schemaVersion"];
export const PROMOTION_RECEIPT_SCHEMA: PromotionReceipt["schemaVersion"];
export const CANDIDATE_RECEIPT_CLAIM_SCHEMA: string;
export const CANDIDATE_RECEIPT_TTL_MS: number;

export function buildCandidateAssuranceReceipt(
  input: Omit<
    CandidateAssuranceReceipt,
    "schemaVersion" | "candidateReceiptId" | "issuedAt" | "expiresAt"
  >,
  nowMs?: number,
  candidateReceiptId?: string,
): CandidateAssuranceReceipt;
export function assertCandidateAssuranceReceipt(
  value: unknown,
  expected?: Partial<CandidateAssuranceReceipt>,
  nowMs?: number,
  options?: { readonly allowExpired?: boolean },
): CandidateAssuranceReceipt;
export function buildPromotionReceipt(
  candidate: CandidateAssuranceReceipt,
  promotionStartedAtMs: number,
  promotionVerifiedAtMs?: number,
): PromotionReceipt;
export function assertPromotionReceipt(
  value: unknown,
  expected?: Partial<PromotionReceipt>,
  nowMs?: number,
  options?: { readonly allowStale?: boolean },
): PromotionReceipt;
export function readCandidateAssuranceReceipt(
  path: string,
  expected?: Partial<CandidateAssuranceReceipt>,
  nowMs?: number,
): CandidateAssuranceReceipt;
export function readPromotionReceipt(
  path: string,
  expected?: Partial<PromotionReceipt>,
  nowMs?: number,
): PromotionReceipt;
export function readAssuranceReceiptForRecovery(
  path: string,
  expected?: Readonly<Record<string, unknown>>,
  nowMs?: number,
): CandidateAssuranceReceipt | PromotionReceipt;
export function claimCandidateAssuranceReceipt(
  candidatePath: string,
  candidate: CandidateAssuranceReceipt,
  nowMs?: number,
  options?: {
    readonly authorityRoot?: string;
    readonly repositoryRoot?: string;
  },
): Readonly<{ claimPath: string; claim: Readonly<Record<string, unknown>> }>;
export function writeReceipt(path: string, receipt: unknown): string;
export function reserveReceipt(path: string, repositoryRoot?: string): ReceiptReservation;
export function commitReservedReceipt(
  reservation: ReceiptReservation,
  receipt: unknown,
): string;
export function discardReceiptReservation(reservation: ReceiptReservation): void;
export function exactExternalReceiptPath(path: string, repositoryRoot?: string): string;
