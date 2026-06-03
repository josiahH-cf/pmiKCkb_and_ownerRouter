import { DRAFT_BANNER } from "@/lib/constants";
import { demoSeedsBySpaceId } from "@/lib/demo/data";
import type {
  PlaceholderRecord,
  SopRecord,
  TemplateRecord,
  ToolRecord,
} from "@/lib/firestore/types";
import { launchSpaces } from "@/lib/spaces";

type LaunchSop = Pick<
  SopRecord,
  | "body_md"
  | "id"
  | "owner_uid"
  | "sensitivity"
  | "source_state_hint"
  | "space_id"
  | "status"
  | "title"
  | "updated_at"
>;
type LaunchTemplate = Pick<
  TemplateRecord,
  "audience" | "body" | "channel" | "id" | "name" | "space_id" | "status"
>;
type LaunchPlaceholder = Pick<
  PlaceholderRecord,
  "due_date" | "id" | "missing_detail" | "owner_uid" | "priority" | "space_id" | "status"
>;
type LaunchTool = Pick<
  ToolRecord,
  | "id"
  | "integration_status"
  | "name"
  | "primary_owner_uid"
  | "purpose"
  | "sensitivity"
  | "url"
>;

export interface LaunchEditableSeed {
  placeholders: LaunchPlaceholder[];
  sops: LaunchSop[];
  templates: LaunchTemplate[];
  tools: LaunchTool[];
}

const seedTimestamp = "2026-05-29T00:00:00.000Z";
const defaultOwnerUid = "launch-process-owner";
const sharedTools: LaunchTool[] = demoSeedsBySpaceId["lease-renewals"]?.tools ?? [];

const skeletonDefinitions = [
  {
    id: "owner-renewal-outreach",
    name: "Owner Renewal Outreach + Comp Lookup",
    prompt:
      "Approved owner renewal outreach wording, comp lookup screenshots, and follow-up cadence still need source confirmation.",
    sourceHint:
      "Transcript context supports manual Zillow/PMI comp lookup and owner follow-up pain, but exact wording/cadence requires approved sources.",
    templateName: "Owner Renewal Outreach Placeholder",
  },
  {
    id: "tenant-renewal-notice",
    name: "Tenant Renewal Notice + DotLoop Follow-Up",
    prompt:
      "Approved tenant renewal notice, DotLoop handoff, and signature follow-up wording still need source confirmation.",
    sourceHint:
      "Transcript context supports RentVine tenant outreach, DotLoop document creation, and repeated signature follow-up pain.",
    templateName: "Tenant Renewal Notice Placeholder",
  },
  {
    id: "vendor-assignment-handoff",
    name: "Vendor Assignment Handoff",
    prompt:
      "Approved vendor-routing categories, Dan escalation rules, and vendor notification wording still need source confirmation.",
    sourceHint:
      "Transcript context supports Dan-owned vendor assignment and scattered vendor communication, but not autonomous vendor choice.",
    templateName: "Vendor Assignment Handoff Placeholder",
  },
  {
    id: "daily-inbox-triage",
    name: "Daily Inbox Triage",
    prompt:
      "Approved LeadSimple/Gmail triage ownership, daily assignment rules, and escalation timing still need source confirmation.",
    sourceHint:
      "Transcript context supports LeadSimple unassigned inbox review, Gmail overload, and team assignment friction.",
    templateName: "Daily Inbox Triage Placeholder",
  },
  {
    id: "fathom-training",
    name: "Fathom Training",
    prompt:
      "Approved Fathom recording intake, training index ownership, and meeting action-item follow-up rules still need source confirmation.",
    sourceHint:
      "Transcript context supports Fathom recording use and the need for assignment-tracked meeting follow-up.",
    templateName: "Fathom Training Placeholder",
  },
  {
    id: "escalation-rules",
    name: "Escalation Rules",
    prompt:
      "Approved escalation ownership by issue type, urgency, and backup owner still needs source confirmation.",
    sourceHint:
      "Transcript context supports Bailey as knowledge bottleneck and Dan as vendor/document decision bottleneck.",
    templateName: "Escalation Rules Placeholder",
  },
  {
    id: "move-in",
    name: "Move-In",
    prompt:
      "Approved move-in checklist ownership, tenant prerequisites, Z-inspection handoff, and closeout wording still need source confirmation.",
    sourceHint:
      "Transcript context supports processing fee, animal registration, utilities, Z-inspection, keys, welcome letter, and listing closeout tracking.",
    templateName: "Move-In Checklist Placeholder",
  },
] as const;

const skeletonSeeds = Object.fromEntries(
  skeletonDefinitions.map((definition) => [definition.id, buildSkeletonSeed(definition)]),
) as Record<string, LaunchEditableSeed>;

export const launchEditableSeedsBySpaceId: Readonly<Record<string, LaunchEditableSeed>> =
  Object.fromEntries(
    launchSpaces
      .filter((space) => !space.readOnly)
      .map((space) => [
        space.id,
        demoSeedsBySpaceId[space.id] ?? skeletonSeeds[space.id] ?? emptySeed(),
      ]),
  );

export const ownerEmailReadOnlySources = [
  "Gmail Inbox 0 source package",
  "Legacy Owner Router artifacts, pending naming migration",
  "01 Reply Patterns - Approved",
  "03 Routing Rules",
] as const;

export function launchApprovalQueueItems() {
  return Object.entries(launchEditableSeedsBySpaceId).flatMap(([spaceId, seed]) => {
    const spaceName = launchSpaces.find((space) => space.id === spaceId)?.name ?? spaceId;

    return [
      ...seed.sops.map((sop) => ({
        id: sop.id,
        kind: "SOP" as const,
        spaceId,
        spaceName,
        status: sop.status,
        title: sop.title,
      })),
      ...seed.templates.map((template) => ({
        id: template.id,
        kind: "Template" as const,
        spaceId,
        spaceName,
        status: template.status,
        title: template.name,
      })),
      ...seed.placeholders.map((placeholder) => ({
        id: placeholder.id,
        kind: "Placeholder" as const,
        spaceId,
        spaceName,
        status: placeholder.status,
        title: placeholder.missing_detail,
      })),
    ];
  });
}

function buildSkeletonSeed(definition: (typeof skeletonDefinitions)[number]) {
  const sourceHint = `Source basis: ${definition.sourceHint}`;

  return {
    placeholders: [
      {
        due_date: "2026-06-30",
        id: `launch-placeholder-${definition.id}`,
        missing_detail: definition.prompt,
        owner_uid: defaultOwnerUid,
        priority: "P1" as const,
        space_id: definition.id,
        status: "Open" as const,
      },
    ],
    sops: [
      {
        body_md: [
          `# ${definition.name} Placeholder SOP`,
          "",
          "This launch Space is ready for source-backed content, but final SOP wording is not approved yet.",
          "",
          "Known from sanitized call context:",
          `- ${sourceHint}`,
          "",
          "Do not answer legal, fee, deadline, approval-threshold, or system-of-record questions from this placeholder alone.",
        ].join("\n"),
        id: `launch-${definition.id}-sop`,
        owner_uid: defaultOwnerUid,
        sensitivity: "Low" as const,
        source_state_hint: "Bailey Placeholder" as const,
        space_id: definition.id,
        status: "Placeholder" as const,
        title: `${definition.name} Placeholder SOP`,
        updated_at: seedTimestamp,
      },
    ],
    templates: [
      {
        audience: "Internal" as const,
        body: `${DRAFT_BANNER}\n\nNeeds Verification: approved ${definition.name} wording.\n\nUse this placeholder only to route the missing source detail to the process owner.`,
        channel: "Internal" as const,
        id: `launch-${definition.id}-template`,
        name: definition.templateName,
        space_id: definition.id,
        status: "Draft" as const,
      },
    ],
    tools: sharedTools,
  } satisfies LaunchEditableSeed;
}

function emptySeed(): LaunchEditableSeed {
  return {
    placeholders: [],
    sops: [],
    templates: [],
    tools: sharedTools,
  };
}
