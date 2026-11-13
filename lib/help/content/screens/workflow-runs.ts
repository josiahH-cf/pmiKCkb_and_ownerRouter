import type { HelpScreenReference } from "@/lib/help/types";

const RUN_PAGE = "components/workflows/WorkflowRunClient.tsx";

export const WORKFLOW_RUNS_SCREENS: readonly HelpScreenReference[] = [
  {
    id: "workflow-run",
    title: "Workflow Run",
    routes: ["/workflow-runs/[runId]"],
    who: "All staff",
    summary:
      "A Workflow Run page shows one checklist run: its process name and status, its Owner, Next Action, Due Date, Started By and Definition version, and the Timeline. An earlier run of a renewal process is kept as a record: its Checklist panel says This run is kept as a record. Renewal work continues on the Renewal Desk., lists each step as Done, Skipped or To do, and offers Open the Renewal Desk, and its Next Action reads None. A run of any other process has the Outcome panel with the checklist count, Complete run and Fail run; its steps are checked on the Space Overview, and this page closes the run.",
    controls: [
      {
        label: "Workflow Run",
        role: "heading",
        availability: "required",
        source: ["app/workflow-runs/[runId]/page.tsx"],
        does: "The page title. The facts below come from the saved run and the process version it recorded.",
        who: "All staff",
      },
      {
        label: "Open Process",
        role: "link",
        availability: "required",
        source: [RUN_PAGE],
        does: "Opens the run's process definition.",
        who: "All staff",
      },
      {
        label: "Checklist",
        role: "heading",
        availability: "conditional",
        source: [RUN_PAGE],
        does: "On an earlier renewal run: each pinned step as Done, Skipped with its reason, or To do, read only. Nothing here changes the run.",
        who: "All staff",
      },
      {
        label: "Open the Renewal Desk",
        role: "link",
        availability: "conditional",
        source: ["lib/processes/guidance-only.ts"],
        does: "On an earlier renewal run: opens the Renewal Desk, where renewal work continues.",
        who: "All staff",
      },
      {
        label: "Outcome",
        role: "heading",
        availability: "conditional",
        source: [RUN_PAGE],
        does: "On a run of a process that starts runs: counts the checklist, for example Checklist: 2 of 6 complete, and names the incomplete steps. Every step must be Checked or Skipped with a reason before completion.",
        who: "All staff",
      },
      {
        label: "Notes",
        role: "textbox",
        availability: "conditional",
        source: [RUN_PAGE],
        does: "Outcome notes saved with Complete run or Fail run; they show as Outcome Notes.",
        who: "All staff",
      },
      {
        label: "Complete run",
        role: "button",
        availability: "conditional",
        source: [RUN_PAGE],
        does: "Closes the run as Completed once every step is Checked or Skipped. It sends nothing and changes no source. An earlier renewal run has no Complete run.",
        who: "All staff",
      },
      {
        label: "Fail run",
        role: "button",
        availability: "conditional",
        source: [RUN_PAGE],
        does: "Closes the run as Failed when it cannot finish, with your notes. An earlier renewal run has no Fail run.",
        who: "All staff",
      },
      {
        label: "Timeline",
        role: "heading",
        availability: "required",
        source: [RUN_PAGE],
        does: "Each event on the run with who recorded it and when, starting with the start note and the recorded version.",
        who: "All staff",
      },
    ],
    guides: ["outreach-checklist"],
    lastUpdated: "2026-11-13",
  },
];
