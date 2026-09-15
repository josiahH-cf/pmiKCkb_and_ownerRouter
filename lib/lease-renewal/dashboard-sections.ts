import type { RenewalProcessStepId } from "@/lib/lease-renewal/renewal-process";

export const RENEWAL_DASHBOARD_SECTIONS = [
  {
    id: "lease-details",
    label: "Lease details",
    description:
      "Start here: check the unit, people, dates and base rent, then confirm the renewal cycle. Review any source differences before continuing.",
    steps: ["verify-renewal"],
  },
  {
    id: "comps",
    label: "Market rent comparison",
    description:
      "Optional: compare similar rentals or enter your sourced analysis. Save the recommendation for the owner message; it does not set the approved rent.",
    steps: [],
  },
  {
    id: "owner",
    label: "Owner approval",
    description:
      "Prepare the owner message, record the contact and response, and save the exact approved rent and dates for the tenant offer.",
    steps: ["owner-decision"],
  },
  {
    id: "tenant",
    label: "Tenant offer and response",
    description:
      "Use the owner's approved terms in the tenant message. Record delivery and the tenant's actual response before preparing documents.",
    steps: ["tenant-decision"],
  },
  {
    id: "documents",
    label: "Documents and completion",
    description:
      "Review the approved terms and required forms, record document delivery and signatures, then complete the remaining checks. Staff records and provider verification stay separate.",
    steps: ["document-packet", "signatures-follow-up", "compliance-close"],
  },
] as const;

export function renewalDashboardTarget(step: string): string {
  return `renewal-step-${step}`;
}

export function renewalDashboardSection(step: RenewalProcessStepId | string): string {
  return (
    RENEWAL_DASHBOARD_SECTIONS.find((section) =>
      (section.steps as readonly string[]).includes(step),
    )?.id ?? "lease-details"
  );
}
