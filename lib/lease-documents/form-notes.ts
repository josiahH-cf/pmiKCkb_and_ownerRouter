// S253 (R-S253-8, R-S253-9, R-S253-10): what a reviewed form says about itself on the lease.
//
// A form's notes come from its reviewed map alone: an execution-date area the business has yet to
// define, the initial boxes kept for tenants, agency selections left for the signer, and the
// organization, representative and signer text that form prints. Nothing here fills, matches or
// corrects a form, and one form's printed text is never read for another. Pure and client-safe.

import type { ArtifactFieldMap } from "@/lib/lease-documents/artifact-intake-contract";
import { fieldMapOpenQuestionIssues } from "@/lib/lease-documents/form-open-questions";

export const EXECUTION_DATE_NOTE =
  "Lease executed on is left blank until the business confirms which date belongs there";
export const AGENCY_SELECTIONS_NOTE =
  "Agency selections are left for the signer until they are confirmed for the case";
export const ORGANIZATION_DIFFERENCE_NOTE =
  "These forms print different organization names. Each form keeps the text it prints.";

const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];
const countWord = (count: number) => COUNT_WORDS[count] ?? String(count);

export function tenantInitialNote(boxes: number): string {
  return `Tenant initials: ${countWord(boxes)} ${boxes === 1 ? "box" : "boxes"}`;
}

export function tenantInitialQuestion(boxes: number): string {
  return `More than ${countWord(boxes)} ${boxes === 1 ? "tenant" : "tenants"}: confirm how initials are collected`;
}

const PRINTED_KIND_LABELS = {
  organization: "Organization",
  representative: "Representative",
  signer: "Signer",
} as const;

export interface FormNotes {
  /** What the form leaves blank or keeps for a signer, in the words the lease shows. */
  notes: string[];
  /** A question this lease raises that the business has yet to answer. */
  questions: string[];
  /** The organization, representative and signer text this form prints, as information. */
  printed: string[];
  /** What the map does that an open question forbids; a form with any is never prepared. */
  mapIssues: string[];
}

/**
 * The tenant initial boxes a reviewed map keeps: initial areas marked for the tenant role. A form
 * that repeats its boxes on several pages is counted by the page with the fewest, since that page
 * decides how many tenants have a box of their own. An area every signer shares names no role and
 * is not counted.
 */
export function tenantInitialBoxes(map: ArtifactFieldMap | null | undefined): number {
  const perPage = new Map<number, number>();
  for (const region of map?.static?.protectedRegions ?? [])
    if (region.kind === "initial" && region.signerRole === "tenant")
      perPage.set(region.pageIndex, (perPage.get(region.pageIndex) ?? 0) + 1);
  return perPage.size ? Math.min(...perPage.values()) : 0;
}

export function formNotesOf(
  map: ArtifactFieldMap | null | undefined,
  /** The tenants on this lease, when known. */
  tenants: number | null = null,
): FormNotes {
  const result: FormNotes = { notes: [], questions: [], printed: [], mapIssues: [] };
  if (!map) return result;
  if (map.static?.protectedRegions.some((region) => region.kind === "execution_date"))
    result.notes.push(EXECUTION_DATE_NOTE);
  const boxes = tenantInitialBoxes(map);
  if (boxes > 0) {
    result.notes.push(tenantInitialNote(boxes));
    if (tenants !== null && tenants > boxes)
      result.questions.push(tenantInitialQuestion(boxes));
  }
  if (map.artifactKind === "brokerage_disclosure")
    result.notes.push(AGENCY_SELECTIONS_NOTE);
  for (const printed of map.printedParties ?? [])
    result.printed.push(
      `Page ${printed.pageIndex + 1}, ${PRINTED_KIND_LABELS[printed.kind]}: ${printed.text}`,
    );
  result.mapIssues = fieldMapOpenQuestionIssues(map);
  return result;
}

/**
 * S253 (R-S253-10): information, never an error: two or more forms of a lease print different
 * organization text. Each entry is one form's organization text exactly as that form prints it.
 * The texts are compared only to say that they differ; nothing is changed to make them agree.
 */
export function organizationDifferenceNote(
  forms: ReadonlyArray<readonly string[] | undefined>,
): string | null {
  const perForm = forms
    .map((texts) => [...(texts ?? [])].sort().join("\u0000"))
    .filter((texts) => texts !== "");
  return new Set(perForm).size > 1 ? ORGANIZATION_DIFFERENCE_NOTE : null;
}
