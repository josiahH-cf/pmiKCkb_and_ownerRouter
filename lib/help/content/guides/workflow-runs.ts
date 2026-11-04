import type { HelpGuide } from "@/lib/help/types";

const RUN_PANEL = "components/desk/SpaceDeskRunPanel.tsx";
const RUN_PAGE = "components/workflows/WorkflowRunClient.tsx";

export const WORKFLOW_RUNS_GUIDES: readonly HelpGuide[] = [
  {
    id: "outreach-checklist",
    section: "workflow-runs",
    title: "Run the Owner Renewal Outreach checklist",
    audience: "Renewal staff",
    purpose:
      "Work the Owner Renewal Outreach process as an internal checklist: start a run from its published definition, check or skip each step as the work happens, complete the run and find it again later.",
    prerequisites: [
      "You are signed in with edit access, which the Editor, Approver and Admin roles have.",
      "The Owner Renewal Outreach + Comp Lookup process is published as Active version 1, so a new run records that immutable version. It has no runs until staff start one.",
      "The steps point to work done on the lease renewal workspace and in Communications; the checklist records what staff marked.",
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
        result: "Internal Processes opens with one card for each Space.",
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
          "The Space opens on its Overview. The Workflow card lists the six steps, and until staff start a run the Run card says No run yet and offers Start run.",
        effect: "reads",
      },
      {
        id: "open-process-tab",
        action: "Select Process under Space views.",
        control: {
          label: "Process",
          role: "link",
          region: "navigation:Space views",
          availability: "required",
          source: ["app/spaces/[spaceId]/page.tsx"],
        },
        route: "/spaces/[spaceId]",
        where: "Space page, Space views",
        result:
          "The Process tab shows the status Active, the Immutable version line with the published version, the six steps and Recent runs, which reads No workflow runs yet until staff start one.",
        effect: "reads",
      },
      {
        id: "open-process-definition",
        action: "Select View full process → to open the process definition.",
        control: {
          label: "View full process →",
          role: "link",
          availability: "required",
          source: ["components/spaces/ProcessSummaryPanel.tsx"],
          actions: ["click-link:Process"],
        },
        route: "/spaces/[spaceId]",
        where: "Space page, Process tab",
        result:
          "The Process Definition page opens. Its Start run panel says Creates an internal checklist. External changes use their separate confirmation controls.",
        effect: "reads",
      },
      {
        id: "start-run",
        scene: "process-start-run",
        action:
          "In Start run, pick a Due date, add a Start note that says which renewal the run is for, and select Start run.",
        control: {
          label: "Start run",
          role: "button",
          availability: "required",
          source: ["components/workflows/ProcessDefinitionDetailClient.tsx"],
        },
        route: "/processes/[definitionId]",
        where: "Process Definition, Start run panel",
        result:
          "The app creates the run and opens its Workflow Run page: status In Progress, Next Action Gather facts and Definition version set to the published version. Without a Due date the run is due today. While the published version still carries placeholder owner or approver assignments, the page says so and no run is created.",
        effect: "saves-in-app",
        note: "Start run on the Space Overview also starts a run, without a due date or note, while the process has no run. When Start run reports placeholder owner or approver assignments, record the responsible staff in Owner UID and Approver UID on the definition and publish that reviewed version first.",
      },
      {
        id: "read-run",
        action: "Read the run page.",
        control: {
          label: "Outcome",
          role: "heading",
          availability: "required",
          source: [RUN_PAGE],
        },
        route: "/workflow-runs/[runId]",
        where: "Workflow Run, Outcome panel",
        result:
          "The run shows its Owner, Next Action, Due Date, Started By and Definition version. Outcome counts the checklist, for example Checklist: 0 of 6 complete, and names the incomplete steps; Timeline records the start.",
        effect: "reads",
      },
      {
        id: "open-checklist",
        action: "Open the Space again from Internal Processes to work the steps.",
        control: {
          label: "Checklist",
          role: "heading",
          availability: "conditional",
          source: [RUN_PANEL],
        },
        route: "/spaces/[spaceId]",
        where: "Space page, Overview, Checklist card",
        result:
          "The Overview shows the Checklist for the newest run. Each step has a To do pill, Check, Skip and its own Reason to skip field, and the Workflow card adds This run: with the run's version.",
        effect: "reads",
      },
      {
        id: "check-step",
        action: "When a step's work is done, select Check on that step.",
        control: {
          label: "Check",
          role: "button",
          availability: "conditional",
          source: [RUN_PANEL],
        },
        route: "/spaces/[spaceId]",
        where: "Space page, Overview, Checklist card",
        result:
          "The step's pill reads Done and the Workflow card moves the current step to the next open one. A check records the checklist only; it does not verify a source or change RentVine or the operating Sheet.",
        effect: "saves-in-app",
      },
      {
        id: "skip-step",
        action:
          "For a step that does not apply, type why in its Reason to skip field and select Skip.",
        control: {
          label: "Skip",
          role: "button",
          availability: "conditional",
          source: [RUN_PANEL],
        },
        route: "/spaces/[spaceId]",
        where: "Space page, Overview, Checklist card",
        result:
          "The pill reads Skipped and the reason shows under the step. Without a reason the page says A reason is required to skip a step.",
        effect: "saves-in-app",
        note: "Clear returns a checked or skipped step to To do while the run is open.",
      },
      {
        id: "open-run",
        action: "Open the run from Recent Runs on the Process Definition page.",
        control: {
          label: "Owner Renewal Outreach + Comp Lookup",
          role: "link",
          availability: "conditional",
          source: ["lib/lease-renewal/owner-renewal-outreach/process-template.ts"],
        },
        route: "/processes/[definitionId]",
        where: "Process Definition, Recent Runs panel",
        result:
          "Recent Runs lists each run by name with its status, due date and Definition version; selecting one opens its run page with the current checklist count.",
        effect: "reads",
      },
      {
        id: "complete-run",
        action:
          "When every step is Checked or Skipped, add the outcome in Notes and select Complete run.",
        control: {
          label: "Complete run",
          role: "button",
          availability: "required",
          source: [RUN_PAGE],
        },
        route: "/workflow-runs/[runId]",
        where: "Workflow Run, Outcome panel",
        result:
          "The run reads Completed, your notes show as Outcome Notes and the Timeline records the change. Complete run stays unavailable while any step is open, and Fail run closes a run that cannot finish.",
        effect: "saves-in-app",
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
          "Recent runs lists the newest runs across processes with due date, owner, status and Definition version. The Space's Process tab and the Process Definition page list this process's runs too.",
        effect: "reads",
        note: "Back to Processes on the Process Definition page opens Processes.",
      },
    ],
    result:
      "The run reads Completed with its outcome notes and timeline, each step shows Done or Skipped with its reason, and the run is listed under Recent Runs.",
    doesNotDo: [
      "A run is an internal checklist only: it sends no message and changes nothing in RentVine, the operating Sheet or Dotloop.",
      "Checking a step does not verify a source, approve renewal terms or prove that a message was delivered.",
      "Owner messages, source updates and Dotloop steps keep their own preview and confirmation controls on their own pages; the checklist never starts them.",
      "Starting a run does not change the published process or its Active version.",
    ],
    relatedGuides: ["publish-a-process", "owner-message", "work-a-renewal"],
    relatedScreens: [
      "spaces",
      "space",
      "process-definition",
      "workflow-run",
      "processes",
    ],
    lastUpdated: "2026-11-04",
    spaces: ["owner-renewal-outreach"],
  },
];
