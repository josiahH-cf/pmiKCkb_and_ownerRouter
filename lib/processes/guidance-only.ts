// S286 ARCH-S286-1: the one list of process definitions that are guidance only. Renewal work is
// done on the Renewal Desk, so the three renewal processes are read as "how this work is done" and
// start no checklist run. The run start service, the run start route, the step and outcome
// services, the Space page, the Space card state, the definition form, the next action projections
// and the anticipated-work lane all read this list. Publication, versions and the process content
// are unchanged (S241), and an earlier run of these processes stays readable as a record.
//
// Pure and client-safe: no I/O, no server import.
import type { WorkflowRunRecord } from "@/lib/firestore/types";
import type { LaunchSpace } from "@/lib/spaces";

/** The renewal process definitions that are guidance only, by their fixed seeded ids. */
export const GUIDANCE_ONLY_PROCESS_DEFINITION_IDS: readonly string[] = Object.freeze([
  "lease-renewal",
  "owner-renewal-outreach",
  "tenant-renewal-notice",
]);

/** R-S286-2: the staff sentence every refused renewal run start answers with. */
export const GUIDANCE_ONLY_RUN_START_REFUSAL =
  "Renewal work is done on the Renewal Desk. This process is guidance.";

/** R-S286-3: what an earlier renewal run says, and what a refused change to it answers with. */
export const GUIDANCE_ONLY_RUN_RECORD_NOTICE =
  "This run is kept as a record. Renewal work continues on the Renewal Desk.";

/** R-S286-5: how the definition form shows the run owner and default approver. */
export const GUIDANCE_ONLY_STAFF_FIELD_NOTE = "Not used: this process starts no runs";

/** R-S286-1: the heading the published steps and source links are shown under. */
export const GUIDANCE_HEADING = "How this work is done";

/** R-S286-1: what a renewal Space page reads when its process has no published version. */
export const GUIDANCE_WITHOUT_PUBLISHED_PROCESS =
  "Renewals are worked on the Renewal Desk.";

/** R-S286-1: the one primary link a renewal Space page and an earlier renewal run offer. */
export const RENEWAL_DESK_LINK_LABEL = "Open the Renewal Desk";

/** The Renewal Desk route (the canonical Live desk). */
export const RENEWAL_DESK_HREF = "/lease-renewal/live/desk";

const GUIDANCE_ONLY = new Set<string>(GUIDANCE_ONLY_PROCESS_DEFINITION_IDS);

/** True when the definition id names a guidance-only (renewal) process. */
export function isGuidanceOnlyProcessDefinitionId(
  definitionId: string | null | undefined,
): boolean {
  return typeof definitionId === "string" && GUIDANCE_ONLY.has(definitionId);
}

/** True when the run belongs to a guidance-only (renewal) process: it is kept as a record. */
export function isGuidanceOnlyWorkflowRun(
  run: Partial<Pick<WorkflowRunRecord, "definition_id">>,
): boolean {
  return isGuidanceOnlyProcessDefinitionId(run.definition_id);
}

/** True when the Space carries a guidance-only (renewal) process. */
export function isGuidanceOnlySpace(
  space: Pick<LaunchSpace, "processDefinitionId">,
): boolean {
  return isGuidanceOnlyProcessDefinitionId(space.processDefinitionId);
}

/** True when the definition has a published version: Active with an immutable version pin. */
export function hasPublishedVersion(definition: {
  readonly status: string;
  readonly active_version_id?: string | null;
}): boolean {
  return (
    definition.status === "Active" &&
    typeof definition.active_version_id === "string" &&
    definition.active_version_id.trim().length > 0
  );
}

const UNUSED_STAFF_FIELDS = ["owner_uid", "default_approver_uid"] as const;

/**
 * R-S286-5: on a guidance-only definition the run owner and default approver are not used, so a
 * save that leaves them empty is accepted and keeps the stored values. A blank or absent value is
 * dropped from the update; a non-blank value is kept as sent. Every other definition and every
 * other field passes through unchanged, so a non-renewal definition still requires its fields.
 */
export function withoutUnusedGuidanceStaffFields(
  definitionId: string,
  payload: unknown,
): unknown {
  if (
    !isGuidanceOnlyProcessDefinitionId(definitionId) ||
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  )
    return payload;
  const next: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const field of UNUSED_STAFF_FIELDS) {
    const value = next[field];
    if (value === undefined || value === null) delete next[field];
    else if (typeof value === "string" && value.trim().length === 0) delete next[field];
  }
  return next;
}

/** A process source link opens only on the web; any other scheme is shown as text. */
export function guidanceSourceHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
