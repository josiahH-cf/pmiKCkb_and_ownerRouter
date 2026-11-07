import { z } from "zod";
import { parseCalendarDate } from "@/lib/date-display";
import type { RenewalWorkspaceState } from "./workspace-state";

export const CycleDispositionIdentitySchema = z
  .object({
    kind: z.enum(["lease_end", "review_date"]),
    dateIso: z
      .string()
      .refine(
        (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Boolean(parseCalendarDate(date)),
      ),
    cycleId: z.string().uuid().nullable(),
  })
  .strict();

export type CycleDispositionIdentity = z.infer<typeof CycleDispositionIdentitySchema>;
export type DispositionSourceBasis = Omit<CycleDispositionIdentity, "cycleId">;

export const CycleDispositionRecordSchema = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    cycle: CycleDispositionIdentitySchema,
    revision: z.number().int().positive(),
    action: z.enum(["retire", "restore"]),
    reason: z.string().trim().min(1).max(1000),
    actorUid: z.string().min(1),
    at: z.string().datetime(),
    operationId: z.string().uuid(),
  })
  .strict();

export type CycleDispositionRecord = z.infer<typeof CycleDispositionRecordSchema>;

export type CycleDisposition =
  | { readonly state: "unavailable" }
  | {
      readonly state: "active" | "retired";
      readonly cycle: CycleDispositionIdentity | null;
      readonly workspaceRevision: number;
      readonly revision: number;
      readonly record: CycleDispositionRecord | null;
    };

export function dispositionSourceBasis(input: {
  readonly term: string;
  readonly endDateIso: string | null;
  readonly nextReviewIso?: string | null;
}): DispositionSourceBasis | null {
  const review = input.term === "month_to_month";
  const dateIso = review ? input.nextReviewIso : input.endDateIso;
  if (!dateIso || !parseCalendarDate(dateIso)) return null;
  return { kind: review ? "review_date" : "lease_end", dateIso };
}

/** A later verified date can be a new cycle. An earlier correction retains the
 * recorded basis; an exact keep-working choice continues to identify its own cycle. */
export function dispositionCycleFor(
  source: DispositionSourceBasis | null,
  workspace: RenewalWorkspaceState | null,
  keepWorking = false,
): CycleDispositionIdentity | null {
  if (!source) return null;
  const basis = workspace?.basis;
  if (
    workspace &&
    basis?.kind === source.kind &&
    (source.dateIso <= basis.dateIso || keepWorking)
  )
    return { kind: basis.kind, dateIso: basis.dateIso, cycleId: workspace.cycleId };
  return { ...source, cycleId: null };
}

function sameCycle(
  saved: CycleDispositionIdentity,
  current: CycleDispositionIdentity,
): boolean {
  if (saved.kind !== current.kind) return false;
  if (saved.cycleId && current.cycleId) return saved.cycleId === current.cycleId;
  // A disposition made before any work exists also covers the first saved work
  // for that cycle and an earlier correction. A later cycle has its own basis.
  return current.dateIso <= saved.dateIso;
}

export function projectCycleDisposition(
  saved: CycleDispositionRecord | null | undefined,
  cycle: CycleDispositionIdentity | null,
  workspaceRevision: number,
): CycleDisposition {
  if (saved === undefined || (saved !== null && !cycle)) return { state: "unavailable" };
  const record = saved && cycle && sameCycle(saved.cycle, cycle) ? saved : null;
  return {
    state: record?.action === "retire" ? "retired" : "active",
    cycle,
    workspaceRevision,
    revision: saved?.revision ?? 0,
    record,
  };
}

export function cycleDispositionHold(
  disposition: CycleDisposition | undefined,
): string | null {
  if (disposition?.state === "retired")
    return "This cycle is retired. Restore it to renewals before preparing or releasing a message.";
  if (disposition?.state === "unavailable")
    return "Retirement status is unavailable. Refresh the current cycle before preparing or releasing a message.";
  return null;
}
