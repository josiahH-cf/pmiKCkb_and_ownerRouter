import type { HelpGuide } from "@/lib/help/types";

const GUIDANCE = "components/spaces/RenewalProcessGuidance.tsx";
const GUIDANCE_WORDS = "lib/processes/guidance-only.ts";
const RUN_PAGE = "components/workflows/WorkflowRunClient.tsx";

// S286 (help V5.0): renewal work has one place, the Renewal Desk. The three renewal Spaces show
// their published process as guidance with Open the Renewal Desk, start no checklist run, and an
// earlier run of a renewal process stays readable as a record. The guide keeps its id so earlier
// links and What changed entries still open it.
export const WORKFLOW_RUNS_GUIDES: readonly HelpGuide[] = [
  {
    id: "outreach-checklist",
    section: "workflow-runs",
    title: "Read a renewal process as guidance",
    audience: "Renewal staff",
    purpose:
      "Read how owner outreach is done on the Owner Renewal Outreach + Comp Lookup Space, follow Open the Renewal Desk to work the leases, and read an earlier checklist run as a record. Renewal work is done on the Renewal Desk, so a renewal process starts no checklist run.",
    prerequisites: [
      "You are signed in. Reading a Space, a process definition or a run needs no edit access.",
      "The Owner Renewal Outreach + Comp Lookup process is published as Active version 1, so its Space shows the six published steps. A renewal Space whose process has no published version says Renewals are worked on the Renewal Desk.",
      "The lease work itself, from the owner message to the recorded outcome, is done on the Renewal Desk; Work a renewal from the desk to a recorded outcome explains it.",
    ],
    steps: [
      {
        id: "open-internal-processes",
        action: "Open Internal Processes from the Operations menu in the top bar.",
        control: {
          label: "Internal Processes",
          role: "link",
          region: "navigation:Primary",
          availability: "required",
          source: ["lib/navigation/primary-navigation.ts"],
          actions: ["click-button:Operations"],
        },
        route: "/",
        where: "Top bar, Operations menu, on every page",
        result:
          "Internal Processes opens with one card for each Space. The Owner Renewal Outreach + Comp Lookup card reads Read how owner outreach is done with the state Guidance.",
        effect: "reads",
      },
      {
        id: "open-outreach-space",
        action: "Select the Owner Renewal Outreach + Comp Lookup card.",
        control: {
          label: "Owner Renewal Outreach + Comp Lookup",
          role: "heading",
          availability: "required",
          source: ["lib/spaces.ts"],
        },
        route: "/spaces",
        where: "Internal Processes, Space cards",
        result:
          "The Space opens on How this work is done. It has no Start run, no checklist and no Overview or Process views.",
        effect: "reads",
        note: "The Lease Renewals and Tenant Renewal Notice + DotLoop Follow-Up Spaces read the same way: Guidance when their process is published, Worked on the Renewal Desk when it is not.",
      },
      {
        id: "read-the-guidance",
        scene: "renewal-process-guidance",
        action:
          "Read the short outcome and the six published steps, and open a link under Sources to read the procedure it cites.",
        control: {
          label: "How this work is done",
          role: "heading",
          availability: "required",
          source: [GUIDANCE_WORDS],
        },
        route: "/spaces/[spaceId]",
        where: "Space page, How this work is done",
        result:
          "Each step shows its title and its description. Each web link under Sources opens in a new tab, and a source that is not a web address shows as its name. Reading saves nothing.",
        effect: "reads",
      },
      {
        id: "open-the-renewal-desk",
        action: "Select Open the Renewal Desk to work the leases.",
        control: {
          label: "Open the Renewal Desk",
          role: "link",
          availability: "required",
          source: [GUIDANCE_WORDS],
        },
        route: "/spaces/[spaceId]",
        where: "Space page, How this work is done, below the steps",
        result:
          "The Renewal Desk opens on the working batch, where each lease is worked step by step in Guided view and its work is recorded on the lease.",
        effect: "reads",
      },
      {
        id: "open-process-definition",
        action: "Select View full process → to read the whole definition.",
        control: {
          label: "View full process →",
          role: "link",
          availability: "required",
          source: [GUIDANCE],
        },
        route: "/spaces/[spaceId]",
        where: "Space page, How this work is done, at the end",
        result:
          "The Process Definition page opens. Owner UID and Approver UID read Not used: this process starts no runs, and the Renewal work panel says Renewal work is done on the Renewal Desk. This process is guidance. with Open the Renewal Desk. Recent Runs lists any earlier run of this process.",
        effect: "reads",
        note: "Approvers and Admins keep editing and publishing the process here; Publish a process definition explains it.",
      },
      {
        id: "read-earlier-run",
        action:
          "To read an earlier run, select its name under Recent Runs and read its Checklist.",
        control: {
          label: "Checklist",
          role: "heading",
          availability: "conditional",
          source: [RUN_PAGE],
        },
        route: "/workflow-runs/[runId]",
        where: "Workflow Run, Checklist panel",
        result:
          "The run opens read only with its Owner, Due Date, Started By and Definition version, and Next Action reads None. Checklist says This run is kept as a record. Renewal work continues on the Renewal Desk., lists each step as Done, Skipped with its reason, or To do, and offers Open the Renewal Desk. Timeline keeps the run's history.",
        effect: "reads",
        note: "An earlier renewal run appears in no next action list: not My Work, the Space card, the process summary or Ask.",
      },
      {
        id: "find-runs",
        action: "Find runs later under Recent runs on Processes.",
        control: {
          label: "Recent runs",
          role: "heading",
          availability: "required",
          source: ["components/workflows/ProcessDefinitionListClient.tsx"],
        },
        route: "/processes",
        where: "Processes, Recent runs",
        result:
          "Recent runs lists the newest runs across processes with due date, owner, status and Definition version, and each name opens its run.",
        effect: "reads",
        note: "Back to Processes on the Process Definition page opens Processes.",
      },
    ],
    result:
      "You have read how owner outreach is done, opened the Renewal Desk where the leases are worked, and read any earlier run as a record.",
    doesNotDo: [
      "A renewal process starts no checklist run: its Space, its Process Definition page and Anticipated work offer no Start run, and a direct start answers Renewal work is done on the Renewal Desk. This process is guidance.",
      "An earlier renewal run is never completed, failed, changed or deleted; its checklist only reads.",
      "Reading the guidance sends no message and changes nothing in RentVine, the operating Sheet or Dotloop.",
      "The published steps record no lease work; each lease's work is recorded on that lease on the Renewal Desk.",
    ],
    relatedGuides: ["work-a-renewal", "publish-a-process", "owner-message"],
    relatedScreens: [
      "spaces",
      "space",
      "process-definition",
      "workflow-run",
      "processes",
    ],
    lastUpdated: "2026-11-13",
    spaces: ["owner-renewal-outreach"],
  },
];
