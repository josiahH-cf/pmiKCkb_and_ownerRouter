import type { RenewalProcessStepId } from "@/lib/lease-renewal/renewal-process";

export const RENEWAL_DASHBOARD_SECTIONS = [
  {
    id: "lease-details",
    label: "Lease details",
    steps: ["verify-renewal"],
  },
  {
    id: "comps",
    label: "Market rent comparison",
    steps: [],
  },
  {
    id: "owner",
    label: "Owner approval",
    steps: ["owner-decision"],
  },
  {
    id: "tenant",
    label: "Tenant offer and response",
    steps: ["tenant-decision"],
  },
  {
    id: "documents",
    label: "Documents and completion",
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
