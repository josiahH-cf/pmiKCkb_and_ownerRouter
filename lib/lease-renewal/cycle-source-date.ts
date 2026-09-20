import type { RenewalCycleBasis } from "@/lib/lease-renewal/workspace-state";

/**
 * S123 (F02, R-F02-04): the recorded cycle basis compared with the lease end the provider reports
 * now. The recorded basis is history: a source change never rewrites it, and this projection never
 * writes anything. It only says whether RentVine now reports a different date, so an operator can
 * review offers, prepared documents and messages against the recorded terms before continuing.
 *
 * The states are exhaustive and fail closed: an unreadable current date is `current_unavailable`,
 * never "unchanged", and a cycle based on a reviewed periodic-review date is reported as such
 * rather than compared against a provider lease end it was never keyed to.
 */
export type CycleSourceDateChange =
  | {
      state: "not_recorded";
      recordedIso: null;
      currentIso: string | null;
      label: string;
    }
  | {
      state: "review_basis";
      recordedIso: string;
      currentIso: string | null;
      label: string;
    }
  | {
      state: "current_unavailable";
      recordedIso: string;
      currentIso: null;
      label: string;
    }
  | { state: "unchanged"; recordedIso: string; currentIso: string; label: string }
  | { state: "changed"; recordedIso: string; currentIso: string; label: string };

function cleanIso(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function projectCycleSourceDateChange(
  basis: RenewalCycleBasis | null | undefined,
  currentEndDateIso: string | null | undefined,
): CycleSourceDateChange {
  const currentIso = cleanIso(currentEndDateIso);
  if (!basis) {
    return {
      state: "not_recorded",
      recordedIso: null,
      currentIso,
      label: currentIso
        ? `Previous terms were not recorded for this lease. RentVine currently reports lease end ${currentIso}.`
        : "Previous terms were not recorded for this lease. RentVine currently reports no lease end.",
    };
  }
  const recordedIso = basis.dateIso;
  if (basis.kind === "review_date") {
    return {
      state: "review_basis",
      recordedIso,
      currentIso,
      label: `This cycle is based on the reviewed periodic-review date ${recordedIso}. The provider lease end is shown separately.`,
    };
  }
  if (!currentIso) {
    return {
      state: "current_unavailable",
      recordedIso,
      currentIso: null,
      label: `This cycle recorded lease end ${recordedIso}. RentVine currently reports no lease end; the recorded date is kept.`,
    };
  }
  if (currentIso === recordedIso) {
    return {
      state: "unchanged",
      recordedIso,
      currentIso,
      label: `RentVine still reports the lease end this cycle recorded (${recordedIso}).`,
    };
  }
  return {
    state: "changed",
    recordedIso,
    currentIso,
    label: `Source date changed: this cycle recorded lease end ${recordedIso}; RentVine now reports ${currentIso}. Review offers, prepared documents and messages against the recorded terms before continuing. The recorded cycle is kept as history.`,
  };
}
