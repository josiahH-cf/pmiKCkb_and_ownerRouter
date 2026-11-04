import type { HelpGuide } from "@/lib/help/types";

const DETAIL = "components/approval/ApprovalQueueDetailPanel.tsx";
const MENU = "components/layout/NotificationMenu.tsx";
const OPEN_MENU = ["click-button:Notifications"];

export const APPROVAL_QUEUE_AND_NOTIFICATIONS_GUIDES: readonly HelpGuide[] = [
  {
    id: "approve-or-deny",
    section: "approval-queue-and-notifications",
    title: "Approve or deny in the Approval Queue",
    audience: "Approver or Admin",
    purpose:
      "Decide the Approval Queue items waiting on you: open an item, read what approval changes, then approve, deny, return or snooze each item with the reason the queue asks for. Admins also decide access requests here.",
    prerequisites: [
      "You are an Approver or an Admin. Approve and Deny work for an item's required approver or an Admin, and an Approver cannot approve an item assigned to them.",
      "Queue items shows the items assigned to you or waiting on your approval; an Admin sees every item.",
    ],
    steps: [
      {
        id: "open-approval-queue",
        action: "Open Approval Queue from the My Work menu in the top bar.",
        control: {
          label: "Approval Queue",
          role: "link",
          region: "navigation:Primary",
          availability: "required",
          source: ["lib/navigation/primary-navigation.ts"],
          actions: ["click-button:My Work Contains current page"],
        },
        route: "/",
        where: "Top bar, My Work menu, on every page",
        result:
          "The Approval Queue opens. Needs your decision lists what waits on you, most urgent first, and each row links to its own page; a row that can be approved right here also shows Approve.",
        effect: "reads",
        note: "A notification about a queue item opens the Approval Queue with that item selected.",
      },
      {
        id: "open-item",
        scene: "approval-queue-item",
        action:
          "Under Other views, keep All items selected and select the item in Queue items.",
        control: {
          label: "Queue items",
          role: "region",
          availability: "conditional",
          source: ["components/approval/ApprovalQueueListPanel.tsx"],
        },
        route: "/approval-queue",
        where: "Approval Queue, Other views, All items",
        result:
          "Queue item detail shows the item's Status, Risk, Audience, Assignee, Required approver, Due date, Affected action and Activity, with a line that says what approval changes.",
        effect: "reads",
        note: "Other views opens on arrival when an item is waiting. Status, Risk and Audience with Apply narrow the list, and Clear filters shows every item again.",
      },
      {
        id: "approve",
        action:
          "Select Approve when the item is Ready for Approval. When Approve is unavailable, open About Approve availability next to the button to read why.",
        control: {
          label: "Approve",
          role: "button",
          region: "Queue item detail",
          availability: "conditional",
          source: [DETAIL],
        },
        route: "/approval-queue",
        where: "Approval Queue, Queue item detail",
        result:
          "The status reads Approved and Activity adds an Approved entry. A High-risk item first asks for a Reason and Save, then Confirm High-risk approval with Approve High-risk item.",
        effect: "saves-in-app",
        note: "About Approve availability gives the reason, for example Only the required approver or an Admin can approve. An item linked to an execution reads Approve for execution and needs an Admin; the execution itself stays a separate action in its owning workflow.",
      },
      {
        id: "deny",
        action:
          "To refuse an item, select Deny, type the Reason and select Save. When Deny is unavailable, open About Deny availability next to the button to read why.",
        control: {
          label: "Deny",
          role: "button",
          region: "Queue item detail",
          availability: "conditional",
          source: [DETAIL],
        },
        route: "/approval-queue",
        where: "Approval Queue, Queue item detail",
        result:
          "The status reads Denied, the item closes and Activity records your reason. Without a reason the queue says Deny requires a reason.",
        effect: "saves-in-app",
        note: "An item linked to an execution has no Deny; About Deny availability says Use Disable Action to reject a linked execution.",
      },
      {
        id: "return-for-revision",
        action:
          "To send an item back for changes, select Return, type what to revise in Reason and select Save.",
        control: {
          label: "Return",
          role: "button",
          region: "Queue item detail",
          availability: "conditional",
          source: [DETAIL],
        },
        route: "/approval-queue",
        where: "Approval Queue, Queue item detail",
        result:
          "The status reads Returned and Activity records your reason. Without a reason the queue says Return for Revision requires a reason.",
        effect: "saves-in-app",
      },
      {
        id: "snooze",
        action:
          "To decide later, select Snooze, pick a Snooze until date, type a Reason and select Save.",
        control: {
          label: "Snooze",
          role: "button",
          region: "Queue item detail",
          availability: "conditional",
          source: [DETAIL],
        },
        route: "/approval-queue",
        where: "Approval Queue, Queue item detail",
        result:
          "The status reads Snoozed until that date and Activity records your reason. Without both the queue says Snooze requires a date and reason.",
        effect: "saves-in-app",
      },
      {
        id: "assign",
        action:
          "Admins: select Assign, enter the Assignee or Required approver and select Save Assignment.",
        control: {
          label: "Assign",
          role: "button",
          region: "Queue item detail",
          availability: "conditional",
          source: [DETAIL],
        },
        route: "/approval-queue",
        where: "Approval Queue, Queue item detail, Admin only",
        result:
          "The item shows the new assignee or required approver and Activity adds Assigned. Admins also see Disable Action, which closes an item as Disabled with a reason and is how an item linked to an execution is turned down.",
        effect: "saves-in-app",
      },
      {
        id: "bulk-action",
        action:
          "To act on several items, tick them in Queue items, choose the Action and its fields in Bulk actions and select Apply Bulk.",
        control: {
          label: "Apply Bulk",
          role: "button",
          region: "Bulk actions",
          availability: "conditional",
          source: ["components/approval/ApprovalQueueBulkPanel.tsx"],
        },
        route: "/approval-queue",
        where: "Approval Queue, All items, Bulk actions",
        result:
          "The queue reports how many items were updated, skipped and failed. The server checks every selected item again, and High-risk approvals ask for confirmation first.",
        effect: "saves-in-app",
        note: "Bulk actions handle at most 50 visible items per request.",
      },
      {
        id: "other-views",
        action:
          "Open Renewal reviews or Write-back proposals to see renewal flags and Sheet write-back proposals across runs.",
        control: {
          label: "Renewal reviews",
          role: "tab",
          availability: "conditional",
          source: ["components/approval/ApprovalQueue.tsx"],
        },
        route: "/approval-queue",
        where: "Approval Queue, Other views",
        result:
          "Both views only read. Each row and Review & resolve → open the run page, where each Sheet update has its own exact confirmation.",
        effect: "reads",
      },
      {
        id: "access-requests",
        action:
          "Admins: open Review access requests on the Admin page, select a request, then choose Preview exact access change or Deny request.",
        control: {
          label: "Preview exact access change",
          role: "button",
          availability: "conditional",
          source: ["components/approval/AccessRequestsLane.tsx"],
        },
        route: "/approval-queue",
        where: "Approval Queue, Access requests view, Admin only",
        result:
          "The preview shows the exact target access. Confirm exact access change applies that access and reads the result back. The requester then signs out and back in to use the new access. Deny request asks for a Plain-English denial reason and Confirm denial, and changes no access.",
        effect: "saves-in-app",
      },
    ],
    result:
      "Each decided item shows Approved, Denied, Returned or Snoozed with your reason in its Activity, and Needs your decision lists only what still waits on you.",
    doesNotDo: [
      "Approving an item changes only that app decision; external actions stay in their owning workflow with their own confirmation.",
      "The Approval Queue never sends a message and never writes to RentVine, the operating Sheet or Dotloop.",
      "Renewal reviews and Write-back proposals only read; their decisions happen on each run page.",
      "An access request changes no access until an Admin selects Confirm exact access change, and Deny request changes none.",
    ],
    relatedGuides: ["notifications", "update-sources"],
    relatedScreens: ["approval-queue", "notifications"],
    lastUpdated: "2026-11-04",
    navItems: ["approval-queue"],
  },
  {
    id: "notifications",
    section: "approval-queue-and-notifications",
    title: "Read and act on Notifications",
    audience: "All staff",
    purpose:
      "See what needs you and what changed: open the Notifications button for unread items, go straight to each one, choose which types you see, and use the Notifications page for decisions, recent activity and set-up gaps.",
    prerequisites: [
      "You are signed in. The Notifications button is in the top bar on every page.",
    ],
    steps: [
      {
        id: "open-notifications",
        scene: "notifications-panel",
        action: "Select Notifications in the top bar.",
        control: {
          label: "Notifications",
          role: "button",
          availability: "required",
          source: [MENU],
        },
        route: "/",
        where: "Top bar, on every page",
        result:
          "The Notifications panel opens with your unread event notifications, or says No unread event notifications. When something is unread, the button shows the count and the browser tab title starts with it.",
        effect: "reads",
        note: "The count refreshes about once a minute and when you come back to the tab; Refresh in the panel reads it again right away.",
      },
      {
        id: "open-a-notification",
        action: "Select a notification in the panel to open what it is about.",
        control: {
          label: "Notifications",
          role: "region",
          availability: "required",
          source: [MENU],
          actions: OPEN_MENU,
        },
        route: "/",
        where: "Top bar, Notifications panel",
        result:
          "The notification is marked read, and its linked page opens, such as an Approval Queue item.",
        effect: "saves-in-app",
      },
      {
        id: "mark-all-read",
        action: "Select Mark all read to clear every unread notification.",
        control: {
          label: "Mark all read",
          role: "button",
          region: "Notifications",
          availability: "conditional",
          source: [MENU],
          actions: OPEN_MENU,
        },
        route: "/",
        where: "Top bar, Notifications panel",
        result:
          "The message reads All notifications marked read and the unread count clears.",
        effect: "saves-in-app",
      },
      {
        id: "choose-notification-types",
        action:
          "Open Notification types and clear the checkbox of a type you do not want in the panel.",
        control: {
          label: "Notification types",
          role: "summary",
          region: "Notifications",
          availability: "conditional",
          source: [MENU],
          actions: OPEN_MENU,
        },
        route: "/",
        where: "Top bar, Notifications panel",
        result:
          "The message says that type's preference updated, and the type stops appearing for you. A type you cannot turn on says why.",
        effect: "saves-in-app",
      },
      {
        id: "open-approval-queue",
        action: "Select Open Approval Queue when approvals wait on you.",
        control: {
          label: "Open Approval Queue",
          role: "link",
          region: "Notifications",
          availability: "conditional",
          source: [MENU],
          actions: OPEN_MENU,
        },
        route: "/",
        where: "Top bar, Notifications panel",
        result: "The Approval Queue opens with Needs your decision at the top.",
        effect: "reads",
      },
      {
        id: "see-all-notifications",
        action: "Select See all notifications.",
        control: {
          label: "See all notifications",
          role: "link",
          region: "Notifications",
          availability: "required",
          source: [MENU],
          actions: OPEN_MENU,
        },
        route: "/",
        where: "Top bar, Notifications panel",
        result:
          "The Notifications page opens with Needs your decision, Recent activity and Set-up. Admins also see Feedback, and Team review when there is something to review.",
        effect: "reads",
      },
      {
        id: "decide-waiting-items",
        action: "Open an item under Needs your decision to decide it where it lives.",
        control: {
          label: "Needs your decision",
          role: "region",
          availability: "required",
          source: ["app/notifications/page.tsx"],
        },
        route: "/notifications",
        where: "Notifications page, Needs your decision",
        result:
          "Each item links to the page that holds its decision, and the count beside the heading shows how many wait. A status line says when a source could not be read and the list may be incomplete.",
        effect: "reads",
      },
      {
        id: "read-recent-activity",
        action: "Read Recent activity for the newest events.",
        control: {
          label: "Recent activity",
          role: "region",
          availability: "required",
          source: ["app/notifications/page.tsx"],
        },
        route: "/notifications",
        where: "Notifications page, Recent activity",
        result:
          "Each event shows its state, a link to what it is about and a short message, or the panel says No recent event notifications.",
        effect: "reads",
      },
      {
        id: "check-set-up",
        action: "Check Set-up for connections and Spaces that still need work.",
        control: {
          label: "Set-up",
          role: "region",
          availability: "required",
          source: ["app/notifications/page.tsx"],
        },
        route: "/notifications",
        where: "Notifications page, Set-up",
        result:
          "Connections to set up and Space coverage list each gap with a link to fix it, or say Every connection is set up and Every space has its process and connections.",
        effect: "reads",
      },
    ],
    result:
      "Unread notifications are opened or marked read, your notification types match what you want to see, and anything still waiting on you is one link away on the Notifications page.",
    doesNotDo: [
      "Notifications only point to work; opening one never approves, sends or changes the record it links to.",
      "Mark all read and Notification types change only your own read state and preferences.",
      "The Notifications page only reads; it has no approve, send or save control of its own.",
    ],
    relatedGuides: ["approve-or-deny"],
    relatedScreens: ["notifications", "approval-queue"],
    lastUpdated: "2026-11-04",
  },
];
