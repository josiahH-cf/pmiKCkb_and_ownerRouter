import type { HelpGuide } from "@/lib/help/types";

// S243 R-S243-1: the Admin tasks guide. Every control label is the exact accessible name the
// interface renders, and `source` names the repository file that contains it.
export const ADMIN_GUIDES: readonly HelpGuide[] = [
  {
    id: "admin-tasks",
    section: "admin",
    title: "Admin tasks",
    audience: "Admin",
    adminOnly: true,
    purpose:
      "Complete the Admin tasks from one page: people and access, the shared notice timing basis, form family use and the renewal charge policy, operational pages, the re-index handoff, presentation, team work, migration readiness, Gmail settings and Space requests.",
    prerequisites: [
      "You are signed in with the Admin role. Every other role opens My access and requests from the Admin item instead of this page.",
      "Find an Admin task, at the top of Admin, groups the links into People and access, Operational safety, Renewal policy, Connected services and migration, and Content and publishing. The links only open pages; they change no role, connection or action authority.",
    ],
    steps: [
      {
        id: "open-my-access",
        action:
          "Open Admin from the Admin group of the primary navigation, then select My access and requests under People and access in Find an Admin task.",
        control: {
          label: "My access and requests",
          role: "link",
          region: "region:Find an Admin task",
          availability: "required",
          source: ["lib/navigation/admin-connections.ts"],
        },
        route: "/admin",
        where: "Admin, Find an Admin task, People and access",
        result:
          "Understand and request my access opens with My access (your role, Spaces and inherited capabilities), Request access, My requests and Connections. As an Admin you read that you already have every role and Space available through this request workflow.",
        effect: "reads",
        note: "Editors and Approvers open this page from the Admin item. They choose A staff task, A higher role or Space access, describe the staff duty, select Preview access request and then Submit access request. Their access changes only after a different Admin approves the request from Review access requests.",
      },
      {
        id: "change-a-role",
        action:
          "Select Manage users and roles, choose the person's new Role, type the reason, select Save role, check the summary in the dialog and select Confirm role change.",
        control: {
          label: "Confirm role change",
          role: "button",
          region: "dialog:Confirm role change",
          availability: "conditional",
          source: ["components/admin/UserManagementPanel.tsx"],
        },
        route: "/admin/users",
        where: "People and Access, Users, the person's row",
        result:
          "The dialog closes and the status line names the person's new role. The change applies the next time they sign in.",
        effect: "saves-in-app",
        note: "Every staff account has every internal Space, so the role sets what a person can do; exact action keys, provider readiness and confirmation stay separate checks. The roster lists people only when the user directory can be read in the session.",
      },
      {
        id: "select-notice-timing-basis",
        action:
          "In Notice Timing Basis, choose the documented option in Documented notice basis.",
        control: {
          label: "Documented notice basis",
          role: "combobox",
          availability: "required",
          source: ["components/lease-renewal/NoticeTimingBasisSelection.tsx"],
        },
        route: "/admin",
        where: "Admin, App Info and Readiness, Notice Timing Basis",
        result:
          "The choice saves at once as the shared basis for every renewal notice comparison, and the panel shows the saved version, who recorded it and when. A lease with missing or stale dates can still read Cannot determine.",
        effect: "saves-in-app",
        note: "Renewal staff select the same documented basis once from the lease workspace. It is one shared setting, so once anyone saves it, this panel shows it as chosen. No message, schedule or provider record is created.",
      },
      {
        id: "set-family-use",
        action:
          "In Renewal packet configuration, under Form families, set each form family to Required, When it applies or Not used.",
        control: {
          label: "Approved standard lease",
          role: "combobox",
          region: "article:Renewal packet configuration",
          availability: "required",
          source: ["lib/lease-documents/artifact-catalog.ts"],
        },
        route: "/admin",
        where: "Admin, Renewal packet configuration, Form families",
        result:
          "Each change saves at once as a new configuration version, and a status line names the family and its new use. Renewal packets read the family use when staff prepare documents.",
        effect: "saves-in-app",
        note: "Each family has its own box, from Approved standard lease to Approved insurance program addendum. Family use does not approve a form file: forms show no approved original or map, so packets read Pending materials for each family.",
      },
      {
        id: "publish-charge-policy",
        action:
          "Under Renewal charge policy, enter the monthly amounts the company offers, set Effective from and an optional note, and select Publish a new policy version.",
        control: {
          label: "Publish a new policy version",
          role: "button",
          region: "article:Renewal packet configuration",
          availability: "required",
          source: ["components/admin/RenewalPacketPolicyAdminPanel.tsx"],
        },
        route: "/admin",
        where: "Admin, Renewal packet configuration, Renewal charge policy",
        result:
          "The status line reads Published charge policy version with its number, and renewal packets calculate their charges from that version. Earlier versions stay as they were.",
        effect: "saves-in-app",
        note: "Leave Resident Benefit Package, monthly or Insurance program, monthly empty when the company does not offer it. Animal charges use published tiers opens the tier rows. These amounts are company policy you enter; they are never read from a form.",
      },
      {
        id: "build-operational-page",
        action:
          "In Read-only Operational Page Builder, choose the Existing Space, type the Page address slug, Page title and Reason for this version, add components, and select Save immutable draft and preview.",
        control: {
          label: "Save immutable draft and preview",
          role: "button",
          region: "group:Operational page controls",
          availability: "required",
          source: ["components/admin/OperationalPageBuilderPanel.tsx"],
        },
        route: "/admin",
        where: "Admin, Read-only Operational Page Builder",
        result:
          "The draft is saved as an unchangeable version and its exact preview appears, with Approve exact version below it.",
        effect: "saves-in-app",
        note: "A page holds only headings, text, callouts, checklists and approved internal links. Add heading, Add text, Add callout, Add checklist and Add internal link each add one component, and Reload page history reads the saved versions again.",
      },
      {
        id: "publish-operational-page",
        action:
          "Check the approval box below the preview and select Approve exact version, then check the publication box and select Publish approved version.",
        control: {
          label: "Publish approved version",
          role: "button",
          region: "group:Operational page controls",
          availability: "conditional",
          source: ["components/admin/OperationalPageBuilderPanel.tsx"],
        },
        route: "/admin",
        where: "Read-only Operational Page Builder, below the exact preview",
        result:
          "Open published page appears with the publication receipt, and the page reads in its Space for every staff member.",
        effect: "saves-in-app",
        note: "To go back to an earlier page, choose it in Exact prior version under Restore a prior approved version, check its box and select Restore exact prior version.",
      },
      {
        id: "request-reindex",
        action:
          "In Re-index Sources, choose the Space to re-index, check the box that confirms the cost and that you run the command yourself, and select Request re-index and show command.",
        control: {
          label: "Request re-index and show command",
          role: "button",
          availability: "required",
          source: ["components/admin/ReindexPanel.tsx"],
        },
        route: "/admin",
        where: "Admin, App Info and Readiness, Re-index Sources",
        result:
          "The request is saved and no import runs. For an existing Space the plan reads Re-index not ready and shows no command, because the app cannot list that Space's source bucket; its notes say what is missing and that you run the re-index yourself.",
        effect: "saves-in-app",
        note: "Next, hand the saved request to the person who holds access to the Space's source bucket; they run the re-index outside the app. Review current handoff under Recent re-index requests reads the plan again at any time. Nothing is ingested from this page.",
      },
      {
        id: "save-display-name",
        action:
          "Open Business profiles and application name, type the Display name and a Change reason, and select Save display name.",
        control: {
          label: "Save display name",
          role: "button",
          region: "region:Application display name",
          availability: "required",
          source: ["components/admin/PresentationSettingsPanel.tsx"],
          sourceText: 'Save {kind === "profile" ? "business profile" : "display name"}',
        },
        route: "/admin/presentation",
        where: "Business profiles and application name, Application display name",
        result:
          "The status line confirms the save, and the preview under Display name shows the name staff see. A blank name restores the default name.",
        effect: "saves-in-app",
        note: "Under Existing staff profiles, choose an enabled staff account in Staff account to edit that person's business title and signature, then select Save business profile. Business titles describe work and grant no access.",
      },
      {
        id: "assign-team-task",
        action:
          "Select Assign and review team work, open Assign a task, fill in Space, Task type, Title, Next action and Assignee, and select Assign task.",
        control: {
          label: "Assign task",
          role: "button",
          availability: "required",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
          actions: ["open-summary:Assign a task"],
        },
        route: "/admin/team-work",
        where: "Team work, Assign a task",
        result:
          "The task appears under Team tasks for its assignee, and Factual work totals count it as Assigned and Open.",
        effect: "saves-in-app",
        note: "Filter team records narrows the list by Staff, Space, Task type, State and created dates. Completing a task changes this internal record only; linked renewal or process work keeps its own controls.",
      },
      {
        id: "read-migration-and-gmail-settings",
        action:
          "Under Connected services and migration, select Migration readiness, then return to Admin and select Communication governance for the Gmail settings.",
        control: {
          label: "Migration readiness",
          role: "link",
          region: "region:Find an Admin task",
          availability: "required",
          source: ["lib/navigation/admin-connections.ts"],
        },
        route: "/admin",
        where: "Admin, Find an Admin task, Connected services and migration",
        result:
          "Migration Readiness is a read-only report of cutover readiness, the environment, production values, the source corpus, budget and Away mode, the Action Registry and notification posture. Workflow Communications Governance lists the approved owner, tenant and maintenance base copy, links Verify my Gmail connection and shows Gemini Status.",
        effect: "reads",
        note: "Both pages only read. Composing, scheduling and sending happen in Communications.",
      },
      {
        id: "request-a-space",
        scene: "admin-space-request",
        action:
          "Select Request a Space, type the Space name and What is this Space for?, add any intended sources, and select Request Space and review fixed plan.",
        control: {
          label: "Request Space and review fixed plan",
          role: "button",
          availability: "required",
          source: ["components/admin/SpaceRequestPanel.tsx"],
        },
        route: "/admin/spaces/request",
        where: "Request a new Space",
        result:
          "The request is saved and the exact resource preview for the new Space appears with its resources, identity, cost boundary and notes. Anything the Space still needs is listed under Provisioning remains closed.",
        effect: "saves-in-app",
        note: "The page records the request only; you run the provisioning commands yourself outside the app.",
      },
    ],
    result:
      "Each Admin change is saved in the app with its version or receipt: a role, the notice timing basis, family use, the charge policy, a published operational page, a re-index or Space request, the display name and a team task. No provider record changes.",
    doesNotDo: [
      "Admin pages never send a message, sign a document or change RentVine, the operating Sheet or Dotloop.",
      "No role, Space or task index link grants action authority; closed actions, provider readiness and exact confirmation stay separate checks.",
      "The re-index handoff imports nothing: for an existing Space the plan shows no command, and the re-index runs outside the app.",
      "Request a Space records the request and its fixed plan only; nothing is provisioned from the page.",
      "Family use and the charge policy do not approve a form file or change a lease's saved inputs.",
      "The notice timing basis creates no message, schedule or provider record.",
      "Team work records internal tasks and time only; employment decisions stay with people.",
      "Migration readiness and Communication governance only read; they change no setting.",
    ],
    relatedGuides: [
      "manage-connections",
      "approve-or-deny",
      "tenant-offer",
      "prepare-documents",
    ],
    relatedScreens: [
      "admin",
      "admin-access",
      "admin-users",
      "admin-presentation",
      "admin-team-work",
      "admin-migration",
      "admin-gmail-settings",
      "admin-space-request",
    ],
    lastUpdated: "2026-11-04",
    navItems: ["admin"],
  },
];
