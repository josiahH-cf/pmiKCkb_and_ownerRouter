import type { HelpGuide } from "@/lib/help/types";

const DETAIL = "components/workflows/ProcessDefinitionDetailClient.tsx";

export const SPACES_AND_PROCESSES_GUIDES: readonly HelpGuide[] = [
  {
    id: "publish-a-process",
    section: "spaces-and-processes",
    title: "Publish a process definition",
    audience: "Approver or Admin",
    purpose:
      "Change a process definition, save it against the revision you reviewed, publish it through the Publication checks and read the Active immutable version that every new run records.",
    prerequisites: [
      "You are signed in with edit access, which the Editor, Approver and Admin roles have. Without it the page says Editing, publishing, or starting this process requires Editor access and offers Request access.",
      "Publishing sets the version every new run follows, so this guide is written for the Approvers and Admins who look after a process.",
      "An Admin has enabled a publication policy for the Space. Without one, Publish says No enabled Live publication policy covers this Space.",
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
        id: "open-the-space",
        action:
          "Select the card of the Space that carries the process, for example Owner Renewal Outreach + Comp Lookup.",
        control: {
          label: "Owner Renewal Outreach + Comp Lookup",
          role: "heading",
          availability: "required",
          source: ["lib/spaces.ts"],
        },
        route: "/spaces",
        where: "Internal Processes, Space cards",
        result:
          "The Space page opens on its Overview, with Overview and Process links under Space views.",
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
          "The Process tab shows the definition's status, its Immutable version line, its Steps and its Recent runs.",
        effect: "reads",
      },
      {
        id: "open-definition",
        action: "Select View full process → to open the definition.",
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
          "The Process Definition page opens with the definition form, Save and Publish, the Publication panel, Start run and Recent Runs.",
        effect: "reads",
        note: "Processes lists every definition you can open, and Back to Processes on this page opens it.",
      },
      {
        id: "edit-fields",
        action:
          "Change the fields that need it, such as Name, Short outcome, Source links or Steps.",
        control: {
          label: "Steps",
          role: "textbox",
          availability: "required",
          source: [DETAIL],
        },
        route: "/processes/[definitionId]",
        where: "Process Definition, definition form",
        result: "Your changes stay in the form. Nothing is saved until you select Save.",
        effect: "reads",
        note: "Write one step per line: its title, then a vertical bar and its description when it has one. Write one source per line as its label, a vertical bar and its link; publication needs at least one source link.",
      },
      {
        id: "save-reviewed-revision",
        action: "Select Save to save the definition against the revision you loaded.",
        control: {
          label: "Save",
          role: "button",
          availability: "required",
          source: [DETAIL],
        },
        route: "/processes/[definitionId]",
        where: "Process Definition, below the form",
        result:
          "The message reads Process definition saved. When someone saved a newer revision first, the save is refused, your edits stay in the form, and Compare saved process and Load current saved definition appear.",
        effect: "saves-in-app",
        note: "Saving changes to an Active definition returns it to Draft. The Publication panel then reads Prior immutable version: until the next Publish, and a run started in the meantime reads Not pinned (draft).",
      },
      {
        id: "publish-version",
        action:
          "Open About Publication checks to see what a version must pass, add a Publication note if it helps reviewers, then select Publish.",
        control: {
          label: "Publish",
          role: "button",
          availability: "required",
          source: [DETAIL],
        },
        route: "/processes/[definitionId]",
        where: "Process Definition, below the form and in the Publication panel",
        result:
          "When every Publication check passes, the message reads Validated process version published and active, the status reads Active and the Publication panel names the new Active immutable version. When a check refuses, the message names it and no version becomes Active.",
        effect: "saves-in-app",
        note: "Publish uses the saved definition; with unsaved edits it says Save and read back your reviewed changes before publishing. When the Space's policy covers one exact process, an Admin reviews the changed content with Review changed process bytes under Trusted Publication Policies on the Admin page before Publish passes.",
      },
      {
        id: "read-active-version",
        scene: "process-publication",
        action: "Read the Publication panel.",
        control: {
          label: "Publication",
          role: "heading",
          availability: "required",
          source: [DETAIL],
        },
        route: "/processes/[definitionId]",
        where: "Process Definition, Publication panel",
        result:
          "Active immutable version: names the version every new run records as its Definition version. Only a validated version becomes Active, and publication grants no external action or role.",
        effect: "reads",
      },
      {
        id: "read-version-line",
        action:
          "Select Back to Processes and find the definition under Process Definitions.",
        control: {
          label: "Back to Processes",
          role: "link",
          availability: "required",
          source: ["app/processes/[definitionId]/page.tsx"],
        },
        route: "/processes/[definitionId]",
        where: "Process Definition, top of the page",
        result:
          "Processes lists the definition with its status, its Owner and Approver, and the line Immutable version: with the same version reference.",
        effect: "reads",
      },
    ],
    result:
      "The definition reads Active, the Publication panel names its Active immutable version, and every run started from it records that version.",
    doesNotDo: [
      "Publishing never sends a message, starts a run or changes RentVine, the operating Sheet or Dotloop.",
      "Publication grants no external action and no role; only a validated version becomes Active.",
      "Saving does not publish: saved changes are not Active until Publish passes the Publication checks.",
      "Runs already started keep the version they recorded; a new version does not change them.",
    ],
    relatedGuides: ["outreach-checklist"],
    relatedScreens: ["spaces", "space", "process-definition", "processes"],
    lastUpdated: "2026-11-04",
    navItems: ["internal-processes"],
  },
];
