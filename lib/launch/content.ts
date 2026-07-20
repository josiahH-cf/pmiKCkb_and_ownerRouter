import { DRAFT_BANNER } from "@/lib/constants";
import { demoSeedsBySpaceId } from "@/lib/demo/data";
import type {
  PlaceholderRecord,
  SopRecord,
  TemplateRecord,
  ToolRecord,
} from "@/lib/firestore/types";
import { SAMPLE_REPLY_TEMPLATES } from "@/lib/gmail-inbox-zero/sample-hub";
import { WELCOME_V1_BASE_COPY } from "@/lib/move-in/welcome-draft";
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
  | "approved_by_uid"
  | "audience"
  | "body"
  | "channel"
  | "id"
  | "last_reviewed_at"
  | "name"
  | "owner_uid"
  | "space_id"
  | "status"
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
    name: "Daily Workflow Communication Review",
    prompt:
      "Approved workflow-communication ownership, daily attention rules, and escalation timing still need source confirmation.",
    sourceHint:
      "Transcript context supports communication overload and team assignment friction, but not a general inbox replacement.",
    templateName: "Daily Workflow Communication Review Placeholder",
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

// F-TMPL-2/F-TMPL-6: seed governed, Admin-editable process copy so composers and the move-in welcome
// draft read store-backed records (each caller still falls back to the code default when unseeded). The
// Gmail reply patterns live in the daily-inbox-triage Communications Space; the welcome email in the
// move-in Space. Bodies are DERIVED from the code fallbacks (SAMPLE_REPLY_TEMPLATES / WELCOME_V1_BASE_COPY)
// so the store-backed path and the fallback path produce the same wording by construction; the live seed
// writer (scripts/seed-launch-skeletons.mjs) mirrors these, guarded by a seed-consistency test.
const replySeedSpecs: ReadonlyArray<{
  id: string;
  audience: LaunchTemplate["audience"];
  status: LaunchTemplate["status"];
}> = [
  { id: "tpl-vendor-ack", audience: "Vendor", status: "Approved" },
  { id: "tpl-scheduling-ack", audience: "Unknown", status: "Approved" },
  { id: "tpl-proposed-portal", audience: "Tenant", status: "Draft" },
];

const launchReplyTemplates: LaunchTemplate[] = replySeedSpecs.map((spec) => {
  const sample = SAMPLE_REPLY_TEMPLATES.find((entry) => entry.id === spec.id);
  if (!sample) {
    throw new Error(`Missing sample reply template for launch seed: ${spec.id}`);
  }
  return {
    id: sample.id,
    name: sample.name,
    body: sample.body,
    audience: spec.audience,
    channel: "Gmail",
    space_id: "daily-inbox-triage",
    status: spec.status,
    owner_uid: defaultOwnerUid,
    ...(spec.status === "Approved"
      ? { approved_by_uid: defaultOwnerUid, last_reviewed_at: seedTimestamp }
      : {}),
  };
});

const launchWelcomeTemplate: LaunchTemplate = {
  id: "move-in-welcome-email",
  name: "Move-In Welcome Email",
  body: WELCOME_V1_BASE_COPY.emailBody,
  audience: "Tenant",
  channel: "Gmail",
  space_id: "move-in",
  status: "Approved",
  owner_uid: defaultOwnerUid,
  approved_by_uid: defaultOwnerUid,
  last_reviewed_at: seedTimestamp,
};

const extraLaunchTemplatesBySpaceId: Record<string, LaunchTemplate[]> = {
  "daily-inbox-triage": launchReplyTemplates,
  "move-in": [launchWelcomeTemplate],
};

for (const [spaceId, extra] of Object.entries(extraLaunchTemplatesBySpaceId)) {
  const seed = skeletonSeeds[spaceId];
  if (seed) {
    seed.templates = [...seed.templates, ...extra];
  }
}

export const launchEditableSeedsBySpaceId: Readonly<Record<string, LaunchEditableSeed>> =
  Object.fromEntries(
    launchSpaces
      .filter((space) => !space.readOnly)
      .map((space) => [
        space.id,
        demoSeedsBySpaceId[space.id] ?? skeletonSeeds[space.id] ?? emptySeed(),
      ]),
  );

// Gmail authorization is per-user domain-wide, but the product surface is workflow-linked rather
// than a mailbox. Legacy general-inbox framing is retired.
export const ownerEmailReadOnlySources = [
  "Per-user Gmail authorization bound to the signed-in pmikcmetro.com identity",
  "Bodyless links to authorized renewal and maintenance entities",
  "Approved labels and reviewed, versioned communication artifacts",
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
        source_state_hint: "Open Placeholder" as const,
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
        owner_uid: defaultOwnerUid,
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
