import type { HelpGuide } from "@/lib/help/types";

export const PROFILE_AND_MY_WORK_GUIDES: readonly HelpGuide[] = [
  {
    id: "my-work-and-profile",
    section: "profile-and-my-work",
    title: "Use My Work and your Profile",
    audience: "All staff",
    purpose:
      "Work through the tasks assigned to you on My Work, record your time with Start work, pause and correct that time, and check the business profile behind your sender signature.",
    prerequisites: [
      "You are signed in.",
      "Starting, timing and changing work needs an environment that allows changes. Where it does not, the board says so and stays read-only.",
    ],
    steps: [
      {
        id: "open-my-work",
        action: "Open the My Work menu and choose My Work.",
        control: {
          label: "My Work",
          role: "link",
          region: "navigation:Primary",
          availability: "required",
          source: ["lib/navigation/primary-navigation.ts"],
          actions: ["click-button:My Work Contains current page"],
        },
        route: "/",
        where: "Top bar, My Work menu",
        result: "My work opens with your work totals, Create my task and Assigned tasks.",
        effect: "reads",
      },
      {
        id: "read-work-totals",
        scene: "my-work",
        action: "Read the totals at the top of the board.",
        control: {
          label: "Factual work totals",
          role: "region",
          availability: "required",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
        },
        route: "/work",
        where: "My work, top of the board",
        result:
          "Assigned, Open, Blocked, Overdue, Completed and Recorded minutes count your own tasks and recorded time.",
        effect: "reads",
      },
      {
        id: "create-my-task",
        action:
          "Open Create my task, choose the Space, fill in Task type, Title and Next action, add a due date if you need one, then choose Create task.",
        control: {
          label: "Create task",
          role: "button",
          availability: "required",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
          actions: ["open-summary:Create my task"],
        },
        route: "/work",
        where: "My work, Create my task",
        result:
          "The task is saved in the app. For an Editor or Approver it is assigned to you and listed under Assigned tasks as Not started.",
        effect: "saves-in-app",
        note: "A task an Admin creates here has no assignee until it is assigned from Team work in Admin. Renewal follow-up tasks assigned to you also appear here, with the lease and its renewal cycle on the card.",
      },
      {
        id: "start-work",
        action: "On the task's card, choose Start work when you begin.",
        control: {
          label: "Start work",
          role: "button",
          availability: "conditional",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
        },
        route: "/work",
        where: "Assigned tasks, the task's card",
        result:
          "Current session shows the task and when it started. Time is recorded from this moment.",
        effect: "saves-in-app",
        note: "After thirteen minutes with no activity, Still working? offers Continue work or Pause now. At fifteen minutes, Session needs review appears; choose Reconcile session to end the session at that time, then confirm or correct it.",
      },
      {
        id: "pause-work",
        action:
          "Choose Pause when you stop for a while, and Resume work when you return.",
        control: {
          label: "Pause",
          role: "button",
          availability: "conditional",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
        },
        route: "/work",
        where: "Assigned tasks, the task's card",
        result:
          "The task shows Paused and its session ends. Resume work starts a new session on the same task.",
        effect: "saves-in-app",
      },
      {
        id: "complete-a-task",
        action: "Choose Complete when the task is done.",
        control: {
          label: "Complete",
          role: "button",
          availability: "conditional",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
        },
        route: "/work",
        where: "Assigned tasks, the task's card",
        result:
          "The task shows Completed and any open session ends. Only the internal work record changes; the linked lease, run or approval keeps its own controls.",
        effect: "saves-in-app",
      },
      {
        id: "block-a-task",
        action:
          "If something stops the work, open Block task, give the Reason and choose Confirm block task.",
        control: {
          label: "Confirm block task",
          role: "button",
          availability: "conditional",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
          sourceText: "Confirm {label.toLowerCase()}",
        },
        route: "/work",
        where: "Assigned tasks, the task's card, Block task",
        result:
          "The card shows Blocked with your reason. Cancel task works the same way with Confirm cancel task.",
        effect: "saves-in-app",
      },
      {
        id: "correct-a-session",
        action:
          "If a recorded time is wrong, open Session history on the card, choose Correct session, change Start, End or Task, give a Reason and choose Save correction.",
        control: {
          label: "Save correction",
          role: "button",
          availability: "conditional",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
        },
        route: "/work",
        where: "Assigned tasks, the task's card, Session history",
        result:
          "The session shows the corrected times, and the correction stays visible in the record. Only an ended session can be corrected.",
        effect: "saves-in-app",
      },
      {
        id: "reconcile-activity",
        action: "Choose Reconcile activity if a session was left open.",
        control: {
          label: "Reconcile activity",
          role: "button",
          region: "region:Assigned tasks",
          availability: "conditional",
          source: ["components/work/WorkAccountabilityBoard.tsx"],
        },
        route: "/work",
        where: "Assigned tasks, beside Refresh",
        result:
          "A session past the inactivity cutoff ends at the cutoff time and shows Needs review, and the board refreshes. Refresh reads the board again and saves nothing.",
        effect: "saves-in-app",
      },
      {
        id: "open-your-profile",
        action: "Choose your role name in the top bar to open My business profile.",
        control: {
          label: "My business profile",
          role: "link",
          availability: "required",
          source: ["components/layout/AppShell.tsx"],
        },
        route: "/work",
        where: "Top bar, the link that shows your role",
        result:
          "My business profile opens with your sign-in email, Current approved business profile and Prior retained sender signature.",
        effect: "reads",
      },
      {
        id: "read-your-signature",
        action:
          "Read Current approved business profile and Prior retained sender signature.",
        control: {
          label: "Current approved business profile",
          role: "heading",
          availability: "required",
          source: ["app/profile/page.tsx"],
        },
        route: "/profile",
        where: "My business profile",
        result:
          "The approved business profile fills the Managed sender signature on renewal messages you prepare. Prior retained sender signature shows the signature kept for your managed identity. Messages already saved keep the signature they were saved with.",
        effect: "reads",
        note: "Ask an Admin to change your business contact details. An Admin sees Manage approved business profiles, which opens Business profiles and application name in Admin.",
      },
    ],
    result:
      "Your tasks show their current state and recorded time, pauses and corrections stay visible, and you know which signature your renewal messages use.",
    doesNotDo: [
      "My Work changes only its own task and time records; it never sends a message or changes a lease, RentVine, the operating Sheet or Dotloop.",
      "Time is recorded only after Start work, and no time is added while a task is paused or a session has ended.",
      "Task records describe staff work only; employment decisions stay with people.",
      "Your profile page only reads; only an Admin changes an approved business profile.",
      "A newer approved profile does not change messages already saved.",
    ],
    relatedGuides: ["find-your-way", "owner-message", "admin-tasks"],
    relatedScreens: ["my-work", "profile"],
    lastUpdated: "2026-11-04",
    navItems: ["my-work"],
  },
];
