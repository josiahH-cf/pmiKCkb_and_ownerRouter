export interface ReleasePermit {
  readonly schemaVersion: "pmi-kc-release-permit.v1";
  readonly runId: string;
  readonly sha: string;
  readonly state: "prepared" | "admitted" | "held" | "consumed";
  readonly preparedAt: string;
  readonly expiresAt: string;
  readonly admission: { checkedAt: string; preflightHash: string } | null;
  readonly reason: string | null;
}
export function defaultReleaseStateRoot(): string;
export function releaseHead(root?: string): string;
export function readReleasePermit(stateRoot?: string): ReleasePermit;
export function assertReleaseAdmission(input: {
  sha: string;
  runId?: string;
  stateRoot?: string;
}): ReleasePermit;
export function assertReleaseCheckpoint(input: {
  sha: string;
  runId: string;
  revision?: string;
  phases: readonly string[];
  stateRoot?: string;
}): { sha: string; runId: string; revision: string; phase: string; inFlight: string };
