export type November5MixGroup =
  | "working_month"
  | "carried_over"
  | "later"
  | "closed"
  | "renewed_in_rentvine"
  | "month_to_month"
  | "move_out_notice";

export type November5MixRole =
  | "prepared"
  | "covered"
  | "assisted"
  | "missingRecipient"
  | "replied";

export interface November5MixLeaseRow {
  lease: {
    leaseID: number;
    startDate: string;
    endDate: string;
    leaseType?: string;
    leaseStatusID?: number;
    tags?: string;
    isMonthToMonth?: string;
    monthToMonthStartDate?: string;
    noticeDate?: string;
    expectedMoveOutDate?: string;
    tenants: { name: string; contactID?: number; email?: string }[];
  };
  property: {
    propertyID?: number;
    name: string;
    streetNumber: string;
    streetName: string;
    address2?: string;
    city?: string;
    stateID?: string;
    postalCode?: string;
  };
  portfolio: { portfolioID: number; owners: { name: string; email?: string }[] };
  unit: {
    unitID?: number;
    rent: string;
    beds?: number;
    fullBaths?: number;
    halfBaths?: number;
    size?: number;
    postalCode: string;
  };
}

export interface November5MixStatus {
  leaseStatus: {
    leaseStatusID: number | string;
    name: string;
    primaryLeaseStatusID: number | string;
    isPendingMoveOutStatus: number | string;
    isCompletedMoveOutStatus: number | string;
  };
}

/** What later suites seed for one working-month lease; the source rows never depend on it. */
export interface November5MixRoleSeed {
  leaseId: number;
  handoff?: string;
  animals: { name: string; kind: "pet" | "assistance_animal" }[];
  standingAgreement?: { name: string; rule: string; percentIncrease: number };
  housingAssistance?: { program: string };
  ownerReply?: { text: string };
}

export interface November5MixSheetRow {
  leaseId: number;
  link: { column: number; url: string };
  cells: string[];
}

export interface November5MixFixture {
  name: string;
  description: string;
  anchorBusinessDate: string;
  statuses: November5MixStatus[];
  leases: November5MixLeaseRow[];
  /** Recorded cycle end date by lease id, earlier than the lease's RentVine end date. */
  recordedCycles: Record<string, string>;
  roles: Record<November5MixRole, November5MixRoleSeed>;
  sheet?: { rows: November5MixSheetRow[] };
}

/** The fixture as loaded on one business date, every date shifted by whole months. */
export interface November5Mix extends November5MixFixture {
  businessDate: string;
  /** The next calendar month on the business date, YYYY-MM. */
  workingMonth: string;
  monthsShifted: number;
  sheet: { rows: November5MixSheetRow[] };
}

export interface November5MixSummary {
  counts: Record<November5MixGroup, number>;
  groups: Record<November5MixGroup, number[]>;
  /** Leases whose RentVine text carries voucher wording in a field the classification reads. */
  assistanceWordingLeaseIds: number[];
  problems: string[];
}

export interface RentvineStandInFlags {
  /** Serve each renewed lease's recorded end date in place of its current one. */
  recordingCycles?: boolean;
  /** Lease id to "missing" (no status on the lease) or "unresolved" (an id the table lacks). */
  unavailableLeaseId?: number | string | null;
  sourceCycleDate?: { leaseId: string; endDate: string } | null;
  statusUnreadable?: Record<string, string>;
}

export const NOVEMBER_5_MIX_PATH: string;
export const NOVEMBER_5_MIX_TOTAL: number;
export const NOVEMBER_5_MIX_COUNTS: Readonly<Record<November5MixGroup, number>>;
export const NOVEMBER_5_MIX_ROLES: readonly November5MixRole[];

export function readNovember5Mix(path?: string | URL): November5MixFixture;
/** Today's business date in America/Chicago, YYYY-MM-DD. */
export function centralBusinessDate(now?: Date): string;
export function workingMonthFor(businessDate: string): string;
export function shiftMixDate(date: string, months: number): string;
export function loadNovember5Mix(
  fixture: November5MixFixture,
  businessDate: string,
): November5Mix;
export function summarizeNovember5Mix(mix: November5Mix): November5MixSummary;
/** Problems with the fixture; an empty list means the shape of R-S254-2 holds. */
export function checkNovember5MixShape(
  fixture: November5MixFixture,
  businessDate?: string,
): string[];
/** The stand-in's answer to one RentVine read; an undefined body is a 404. */
export function rentvineStandInResponse(
  mix: November5Mix,
  url: URL,
  flags?: RentvineStandInFlags,
): { body: unknown };
export function mixSheetFixture(mix: November5Mix): {
  rows: November5MixSheetRow[];
  rentvinePropertyIds: Record<string, number>;
};
