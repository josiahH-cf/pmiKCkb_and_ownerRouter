export interface LaunchSpace {
  id: string;
  name: string;
  processCategory: string;
  readOnly?: boolean;
  /**
   * The process-definition id this Space carries (Spaces ⊇ Processes). Set only for Spaces whose
   * process is seeded (the fixed process-definition seeder ids). Surfaced beside the Space via the
   * Process sub-tab; drives the "process ready / needs a process" card state.
   */
  processDefinitionId?: string;
}

export const launchSpaces: readonly LaunchSpace[] = [
  {
    id: "lease-renewals",
    name: "Lease Renewals",
    processCategory: "Renewals",
    processDefinitionId: "lease-renewal",
  },
  {
    id: "owner-renewal-outreach",
    name: "Owner Renewal Outreach + Comp Lookup",
    processCategory: "Renewals",
    processDefinitionId: "owner-renewal-outreach",
  },
  {
    id: "tenant-renewal-notice",
    name: "Tenant Renewal Notice + DotLoop Follow-Up",
    processCategory: "Renewals",
    processDefinitionId: "tenant-renewal-notice",
  },
  {
    id: "maintenance-work-order-intake",
    name: "Maintenance Work Order Intake",
    processCategory: "Maintenance",
    processDefinitionId: "maintenance-work-order-intake",
  },
  {
    id: "vendor-assignment-handoff",
    name: "Vendor Assignment Handoff",
    processCategory: "Maintenance",
  },
  { id: "daily-inbox-triage", name: "Daily Inbox Triage", processCategory: "Inbox" },
  { id: "fathom-training", name: "Fathom Training", processCategory: "Training" },
  { id: "escalation-rules", name: "Escalation Rules", processCategory: "Escalation" },
  {
    id: "move-in",
    name: "Move-In",
    processCategory: "Move-In",
    processDefinitionId: "move-in",
  },
  {
    id: "move-out-deposit-disposition",
    name: "Move-Out + Deposit Disposition",
    processCategory: "Move-Out",
    processDefinitionId: "move-out-deposit-disposition",
  },
  { id: "owner-onboarding", name: "Owner Onboarding", processCategory: "Onboarding" },
  {
    id: "owner-email",
    name: "Owner Email",
    processCategory: "Owner Email",
    readOnly: true,
  },
] as const;

/** Where a launch space opens. Lease Renewals and Maintenance Work Order Intake have built operator
 *  desks; every other space opens its space detail. Centralized so the home launcher and the Spaces
 *  directory stay consistent. */
export function spaceHref(space: Pick<LaunchSpace, "id">): string {
  if (space.id === "lease-renewals") return "/lease-renewal";
  if (space.id === "maintenance-work-order-intake") return "/maintenance";
  return `/spaces/${space.id}`;
}
