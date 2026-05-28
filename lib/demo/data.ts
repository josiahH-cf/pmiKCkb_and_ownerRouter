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
  "audience" | "body" | "channel" | "id" | "name" | "status" | "updated_at"
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

export const demoCitation: Citation = {
  source_id: "demo-lease-renewals-sop",
  title: "Lease Renewals Demo SOP",
  url: "https://example.com/demo/lease-renewals-sop",
  excerpt:
    "Demo source: renewal questions are handled by checking the renewal SOP, confirming owner decision status, and using approved follow-up wording.",
};

export const demoLeaseRenewals: {
  placeholders: DemoPlaceholder[];
  sops: DemoSop[];
  templates: DemoTemplate[];
  tools: DemoTool[];
} = {
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
  templates: [
    {
      audience: "Owner",
      body: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are checking the renewal status and will confirm the recommended next step once the documented renewal details are verified.\n\nThank you,`,
      channel: "Gmail",
      id: "demo-owner-renewal-follow-up",
      name: "Owner Renewal Follow-Up",
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
      purpose: "Check lease and renewal context. No API write path exists in the KB.",
      sensitivity: "Medium",
      updated_at: "2026-05-28T00:00:00.000Z",
      url: "https://example.com/rentvine",
    },
  ],
};

export function isLeaseRenewalsDemoQuestion(question: string) {
  const normalized = question.toLowerCase();
  return (
    normalized.includes("lease renewal") ||
    normalized.includes("renewal process") ||
    normalized.includes("renewal workflow") ||
    normalized.includes("owner renewal") ||
    normalized.includes("renewal follow-up")
  );
}

export function isUnsupportedDemoQuestion(question: string) {
  const normalized = question.toLowerCase();
  return (
    normalized.includes("unusual lease break") ||
    normalized.includes("exact fee") ||
    normalized.includes("ignore all rules") ||
    normalized.includes("generic")
  );
}
