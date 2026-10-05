import { z } from "zod";
import { canonicalDeskPreferenceView } from "@/lib/lease-renewal/desk-preferences";

export const PERSONAL_VIEW_VERSION = "personal-view/v2";
export const PERSONAL_VIEW_SURFACES = [
  "renewals",
  "maintenance-queue",
  "maintenance-blockers",
  "maintenance-import",
  "vendor-lifecycle",
  "lease-contract",
  "work",
  "work-team",
  "processes",
  "process-runs",
  "approvals",
  "access-requests",
  "notifications",
  "connections",
  "admin-users",
  "admin-activity",
  "spaces",
  "communications",
] as const;
export type PersonalViewSurface = (typeof PERSONAL_VIEW_SURFACES)[number];
const width = z.number().int().min(96).max(640);
export const PersonalViewLayoutSchema = z
  .object({
    columns: z
      .record(z.string().regex(/^c(?:[0-9]|[12][0-9]|3[0-9])$/), width)
      .default({}),
    panelWidth: z.number().int().min(288).max(640).optional(),
  })
  .strict();
export const PersonalViewValueSchema = z
  .object({
    query: z.string().max(1800).default(""),
    layout: PersonalViewLayoutSchema.default({ columns: {} }),
  })
  .strict();
export type PersonalViewValue = z.infer<typeof PersonalViewValueSchema>;
export const PersonalViewSaveSchema = z
  .object({
    surface: z.enum(PERSONAL_VIEW_SURFACES),
    expectedRevision: z.number().int().min(0),
    value: PersonalViewValueSchema,
  })
  .strict();
export type PersonalViewSave = z.infer<typeof PersonalViewSaveSchema>;
export interface PersonalView {
  surface: PersonalViewSurface;
  revision: number;
  value: PersonalViewValue;
  updatedAt: string | null;
}
export const DEFAULT_PERSONAL_VIEW: PersonalViewValue = {
  query: "",
  layout: { columns: {} },
};
const QUERY_KEYS = new Set([
  "q",
  "search",
  "query",
  "sort",
  "direction",
  "state",
  "status",
  "scope",
  "view",
  "assignee",
  "space",
  "source",
  "kind",
  "category",
  "from",
  "through",
  "due",
  "priority",
]);
const TABLE_QUERY_KEYS: Partial<Record<PersonalViewSurface, ReadonlySet<string>>> = {
  "maintenance-queue": new Set(["assignee", "waiting"]),
  "access-requests": new Set([
    "requesterQuery",
    "intentKind",
    "catalogKey",
    "spaceId",
    "state",
    "waitingMinutes",
  ]),
  "work-team": new Set(["staff", "space", "type", "state", "from", "to"]),
  work: new Set(["staff", "space", "type", "state", "from", "to"]),
  approvals: new Set([
    "assignee_uid",
    "audience_group",
    "due_date",
    "process_run_id",
    "required_approver_uid",
    "risk",
    "status",
  ]),
};
export function canonicalPersonalView(
  surface: PersonalViewSurface,
  input: PersonalViewValue,
): PersonalViewValue | null {
  const parsed = PersonalViewValueSchema.safeParse(input);
  if (!parsed.success) return null;
  const value = parsed.data;
  if (surface === "renewals") {
    const query = canonicalDeskPreferenceView(value.query || "v=2");
    return query === null ? null : { ...value, query };
  }
  const params = new URLSearchParams(value.query);
  for (const [key, text] of params) {
    if (
      !(TABLE_QUERY_KEYS[surface] ?? QUERY_KEYS).has(key) ||
      text.length > 120 ||
      params.getAll(key).length !== 1
    )
      return null;
  }
  params.sort();
  return { ...value, query: params.toString() };
}
/** Clamp the rendered size only. The saved desktop intent is deliberately unchanged. */
export function renderedPanelWidth(preferred: number, viewportWidth: number): number {
  return Math.min(
    Math.max(288, preferred),
    Math.max(288, Math.min(640, viewportWidth - 560)),
  );
}
