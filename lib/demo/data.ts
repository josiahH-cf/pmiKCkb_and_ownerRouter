import { DRAFT_BANNER } from "@/lib/constants";
import type {
  PlaceholderRecord,
  SopRecord,
  TemplateRecord,
  ToolRecord,
} from "@/lib/firestore/types";
import type { Citation } from "@/lib/schemas";

type DemoSop = Pick<
  SopRecord,
  "body_md" | "id" | "source_state_hint" | "status" | "title" | "updated_at"
> & {
  owner_uid: string;
  sensitivity: "Low";
  space_id: string;
};
type DemoTemplate = Pick<
  TemplateRecord,
  "audience" | "body" | "channel" | "id" | "name" | "owner_uid" | "status" | "updated_at"
> & {
  space_id: string;
};
type DemoPlaceholder = Pick<
  PlaceholderRecord,
  | "due_date"
  | "id"
  | "missing_detail"
  | "owner_uid"
  | "priority"
  | "space_id"
  | "status"
  | "updated_at"
>;
type DemoTool = Pick<
  ToolRecord,
  | "id"
  | "integration_status"
  | "name"
  | "primary_owner_uid"
  | "purpose"
  | "sensitivity"
  | "updated_at"
  | "url"
>;

interface DemoWorkflow {
  answer: string;
  citation: Citation;
  draft: string;
  handlingSteps: string[];
  matchTerms: string[];
  placeholders: DemoPlaceholder[];
  sops: DemoSop[];
  spaceId: string;
  templates: DemoTemplate[];
  tools: DemoTool[];
  unsupportedTerms?: string[];
}

type DemoEditableSeed = {
  placeholders: DemoPlaceholder[];
  sops: DemoSop[];
  templates: DemoTemplate[];
  tools: DemoTool[];
};

export const demoWorkflows: readonly DemoWorkflow[] = [
  {
    answer:
      "Check RentVine and the renewal tracker, confirm owner direction before tenant-facing commitments, and use documented renewal wording only for known terms.",
    citation: {
      source_id: "demo-lease-renewals-sop",
      title: "Lease Renewals Demo SOP",
      url: "https://example.com/demo/lease-renewals-sop",
      excerpt:
        "Demo source: renewal questions are handled by checking the renewal SOP, confirming owner decision status, and using approved follow-up wording.",
    },
    draft: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are checking the renewal status and will confirm the recommended next step once the documented renewal details are verified.\n\nThank you,`,
    handlingSteps: [
      "Open the Lease Renewals Space.",
      "Check the renewal SOP and any open placeholders.",
      "Confirm owner direction before tenant-facing commitments.",
      "Use approved owner follow-up wording only for verified details.",
    ],
    matchTerms: [
      "lease renewal",
      "renewal process",
      "renewal workflow",
      "owner renewal",
      "renewal follow-up",
    ],
    placeholders: [
      {
        due_date: "2026-06-15",
        id: "demo-placeholder-renewal-timing",
        missing_detail: "Confirm the exact renewal follow-up timing for edge cases.",
        owner_uid: "local-demo-admin",
        priority: "P1",
        space_id: "lease-renewals",
        status: "Open",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    sops: [
      {
        body_md:
          "# Lease Renewals Demo SOP\n\n1. Check the current lease and renewal status.\n2. Confirm owner direction before sending owner-facing commitments.\n3. Use approved renewal follow-up wording when the source is verified.\n4. Create a placeholder when timing, fee, or approval details are not documented.",
        id: "demo-lease-renewals-sop",
        owner_uid: "local-demo-admin",
        sensitivity: "Low",
        source_state_hint: "Verified Source",
        space_id: "lease-renewals",
        status: "In Review",
        title: "Lease Renewals Demo SOP",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    spaceId: "lease-renewals",
    templates: [
      {
        audience: "Owner",
        body: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are checking the renewal status and will confirm the recommended next step once the documented renewal details are verified.\n\nThank you,`,
        channel: "Gmail",
        id: "demo-owner-renewal-follow-up",
        name: "Owner Renewal Follow-Up",
        owner_uid: "local-demo-admin",
        space_id: "lease-renewals",
        status: "In Review",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    tools: [
      {
        id: "demo-rentvine",
        integration_status: "Link only",
        name: "RentVine",
        primary_owner_uid: "local-demo-admin",
        purpose: "Check lease, tenant, owner, maintenance, and renewal context.",
        sensitivity: "Medium",
        updated_at: "2026-05-28T00:00:00.000Z",
        url: "https://example.com/rentvine",
      },
      {
        id: "demo-dotloop",
        integration_status: "Link only",
        name: "DotLoop",
        primary_owner_uid: "local-demo-admin",
        purpose: "Prepare and track renewal or move-out related documents.",
        sensitivity: "Medium",
        updated_at: "2026-05-28T00:00:00.000Z",
        url: "https://example.com/dotloop",
      },
      {
        id: "demo-google-sheets",
        integration_status: "Link only",
        name: "Google Sheets",
        primary_owner_uid: "local-demo-admin",
        purpose:
          "Review demo trackers and onboarding checklists without KB write access.",
        sensitivity: "Medium",
        updated_at: "2026-05-28T00:00:00.000Z",
        url: "https://example.com/google-sheets",
      },
      {
        id: "demo-google-chat",
        integration_status: "Link only",
        name: "Google Chat",
        primary_owner_uid: "local-demo-admin",
        purpose: "Keep operational handoffs visible without automated KB posting.",
        sensitivity: "Medium",
        updated_at: "2026-05-28T00:00:00.000Z",
        url: "https://example.com/google-chat",
      },
    ],
    unsupportedTerms: ["unusual lease break", "exact fee"],
  },
  {
    answer:
      "Maintenance intake starts in RentVine. The team verifies the request details, asks for missing photos when needed, keeps the handoff visible, and escalates vendor assignment for a person to decide.",
    citation: {
      source_id: "demo-maintenance-work-order-sop",
      title: "Maintenance Work Order Intake Demo SOP",
      url: "https://example.com/demo/maintenance-work-order-sop",
      excerpt:
        "Demo source: maintenance requests come through RentVine, missing photos create friction, and vendor assignment remains a human decision.",
    },
    draft: `${DRAFT_BANNER}\n\nHi [Tenant Name],\n\nWe received the maintenance request. Please add photos or any missing details in RentVine so the team can review the next step.\n\nThank you,`,
    handlingSteps: [
      "Open the Maintenance Work Order Intake Space.",
      "Check RentVine for the request details and any attached photos.",
      "Use the approved photo-request template when details are missing.",
      "Escalate vendor assignment for a person to decide.",
    ],
    matchTerms: ["maintenance", "work order", "vendor", "photo", "photos"],
    placeholders: [
      {
        due_date: "2026-06-15",
        id: "demo-placeholder-maintenance-routing",
        missing_detail:
          "Confirm approved routing rules for maintenance requests that arrive without photos.",
        owner_uid: "local-demo-admin",
        priority: "P1",
        space_id: "maintenance-work-order-intake",
        status: "Open",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    sops: [
      {
        body_md:
          "# Maintenance Work Order Intake Demo SOP\n\n1. Check the RentVine work order details.\n2. Confirm whether tenant photos or access details are missing.\n3. Use the approved request-for-photos wording when needed.\n4. Escalate vendor assignment when no approved routing rule applies.",
        id: "demo-maintenance-work-order-sop",
        owner_uid: "local-demo-admin",
        sensitivity: "Low",
        source_state_hint: "Verified Source",
        space_id: "maintenance-work-order-intake",
        status: "In Review",
        title: "Maintenance Work Order Intake Demo SOP",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    spaceId: "maintenance-work-order-intake",
    templates: [
      {
        audience: "Tenant",
        body: `${DRAFT_BANNER}\n\nHi [Tenant Name],\n\nPlease add photos and any access notes to the maintenance request in RentVine so the team can review the next step.\n\nThank you,`,
        channel: "RentVine",
        id: "demo-maintenance-photo-request",
        name: "Maintenance Photo Request",
        owner_uid: "local-demo-admin",
        space_id: "maintenance-work-order-intake",
        status: "In Review",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    tools: [],
    unsupportedTerms: ["assign a vendor by itself", "pick a vendor"],
  },
  {
    answer:
      "Move-out work starts from the notice, then the team tracks instructions, owner utility reminders, inspection, vendor bids, deposit-sensitive decisions, RentVine close-out, and relisting readiness.",
    citation: {
      source_id: "demo-move-out-deposit-sop",
      title: "Move-Out + Deposit Disposition Demo SOP",
      url: "https://example.com/demo/move-out-deposit-sop",
      excerpt:
        "Demo source: move-outs require notice tracking, inspection, owner approval for repairs, deposit-sensitive escalation, and RentVine close-out.",
    },
    draft: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are tracking the move-out steps and will confirm inspection or repair next steps once the documented details are reviewed.\n\nThank you,`,
    handlingSteps: [
      "Open the Move-Out + Deposit Disposition Space.",
      "Confirm the notice and move-out tracker status.",
      "Check inspection and vendor-bid status before owner-facing commitments.",
      "Escalate deposit disposition questions so a person confirms the charges.",
    ],
    matchTerms: ["move-out", "move out", "deposit", "disposition", "inspection"],
    placeholders: [
      {
        due_date: "2026-06-15",
        id: "demo-placeholder-deposit-disposition",
        missing_detail:
          "Confirm approved deposit disposition wording and escalation requirements.",
        owner_uid: "local-demo-admin",
        priority: "P1",
        space_id: "move-out-deposit-disposition",
        status: "Open",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    sops: [
      {
        body_md:
          "# Move-Out + Deposit Disposition Demo SOP\n\n1. Confirm move-out notice and tracker status.\n2. Send approved tenant or owner instructions only from documented details.\n3. Review inspection and vendor-bid status before owner-facing commitments.\n4. Escalate deposit-sensitive decisions and legal wording.",
        id: "demo-move-out-deposit-sop",
        owner_uid: "local-demo-admin",
        sensitivity: "Low",
        source_state_hint: "Verified Source",
        space_id: "move-out-deposit-disposition",
        status: "In Review",
        title: "Move-Out + Deposit Disposition Demo SOP",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    spaceId: "move-out-deposit-disposition",
    templates: [
      {
        audience: "Owner",
        body: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are tracking the move-out and will confirm documented inspection or repair next steps once available.\n\nThank you,`,
        channel: "Gmail",
        id: "demo-move-out-owner-update",
        name: "Move-Out Owner Update",
        owner_uid: "local-demo-admin",
        space_id: "move-out-deposit-disposition",
        status: "In Review",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    tools: [],
    unsupportedTerms: ["decide deposit", "charge the tenant"],
  },
  {
    answer:
      "Owner onboarding is checklist-driven: confirm agreement status, utilities, insurance, keys or locks, filters, lawn care, lease takeover details, tenant contact, and deposit tracking before treating the property as fully ready.",
    citation: {
      source_id: "demo-owner-onboarding-sop",
      title: "Owner Onboarding Demo SOP",
      url: "https://example.com/demo/owner-onboarding-sop",
      excerpt:
        "Demo source: owner onboarding uses a checklist for agreement, utilities, insurance, keys, locks, filters, lawn care, lease takeover, tenant contact, and deposit details.",
    },
    draft: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are confirming the onboarding checklist items and will follow up on any missing setup details before the property is treated as fully ready.\n\nThank you,`,
    handlingSteps: [
      "Open the Owner Onboarding Space.",
      "Check the onboarding checklist for missing setup facts.",
      "Confirm agreement, utilities, insurance, keys, locks, and tenant/deposit details.",
      "Create a placeholder for missing owner or property setup details.",
    ],
    matchTerms: ["owner onboarding", "onboarding", "utilities", "insurance", "keys"],
    placeholders: [
      {
        due_date: "2026-06-15",
        id: "demo-placeholder-owner-onboarding-gaps",
        missing_detail:
          "Confirm who owns each missing owner-onboarding checklist item when setup stalls.",
        owner_uid: "local-demo-admin",
        priority: "P1",
        space_id: "owner-onboarding",
        status: "Open",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    sops: [
      {
        body_md:
          "# Owner Onboarding Demo SOP\n\n1. Check the onboarding tracker before treating setup details as known.\n2. Confirm agreement, utilities, insurance, keys or locks, filters, and lawn care.\n3. Confirm lease takeover, tenant contact, and deposit tracking when applicable.\n4. Create a placeholder for missing setup ownership or timing.",
        id: "demo-owner-onboarding-sop",
        owner_uid: "local-demo-admin",
        sensitivity: "Low",
        source_state_hint: "Verified Source",
        space_id: "owner-onboarding",
        status: "In Review",
        title: "Owner Onboarding Demo SOP",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    spaceId: "owner-onboarding",
    templates: [
      {
        audience: "Owner",
        body: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are confirming the onboarding checklist and will follow up on any missing setup details.\n\nThank you,`,
        channel: "Gmail",
        id: "demo-owner-onboarding-follow-up",
        name: "Owner Onboarding Follow-Up",
        owner_uid: "local-demo-admin",
        space_id: "owner-onboarding",
        status: "In Review",
        updated_at: "2026-05-28T00:00:00.000Z",
      },
    ],
    tools: [],
    unsupportedTerms: ["update rentvine", "update the onboarding sheet"],
  },
];

export const demoCitation = demoWorkflows[0].citation;

export const demoLeaseRenewals: DemoEditableSeed = {
  placeholders: demoWorkflows[0].placeholders,
  sops: demoWorkflows[0].sops,
  templates: demoWorkflows[0].templates,
  tools: demoWorkflows[0].tools,
};

export const demoSeedsBySpaceId: Readonly<Record<string, DemoEditableSeed>> =
  Object.fromEntries(
    demoWorkflows.map((workflow) => [
      workflow.spaceId,
      {
        placeholders: workflow.placeholders,
        sops: workflow.sops,
        templates: workflow.templates,
        tools: demoWorkflows[0].tools,
      },
    ]),
  );

export function findDemoWorkflow(question: string, spaceId?: string) {
  const normalized = question.toLowerCase();
  const candidates = spaceId
    ? demoWorkflows.filter((workflow) => workflow.spaceId === spaceId)
    : demoWorkflows;

  return candidates.find((workflow) =>
    workflow.matchTerms.some((term) => normalized.includes(term)),
  );
}

export function isLeaseRenewalsDemoQuestion(question: string) {
  return findDemoWorkflow(question, "lease-renewals") !== undefined;
}

export function isUnsupportedDemoQuestion(question: string, spaceId?: string) {
  const normalized = question.toLowerCase();
  const workflow = findDemoWorkflow(question, spaceId);
  const unsupportedTerms = [
    "ignore all rules",
    "generic",
    ...(workflow?.unsupportedTerms ?? []),
  ];

  return unsupportedTerms.some((term) => normalized.includes(term));
}
