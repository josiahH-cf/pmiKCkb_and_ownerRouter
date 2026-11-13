import type { HelpGuide } from "@/lib/help/types";

export const HOME_AND_ASK_GUIDES: readonly HelpGuide[] = [
  {
    id: "find-your-way",
    section: "home-and-ask",
    title: "Sign in and find your way around",
    audience: "All staff",
    purpose:
      "Start on the Dashboard after you sign in, ask a question, see what is waiting on you and reach every part of the app from the top bar.",
    prerequisites: ["Your managed PMI KC Google account has staff access to the app."],
    steps: [
      {
        id: "open-the-dashboard",
        scene: "home-dashboard",
        action: "Sign in with your managed Google account and wait for the Dashboard.",
        control: {
          label: "Dashboard",
          role: "heading",
          availability: "required",
          source: ["components/console/ConsoleView.tsx"],
        },
        route: "/",
        where: "The first page after you sign in, also at /ask",
        result:
          "The Dashboard opens with Ask a question, your conversations and Waiting on you. If you signed in from a link to another page, that page opens instead.",
        effect: "reads",
      },
      {
        id: "read-environment-badge",
        action:
          "Read the environment badge beside the wordmark, if one shows, and choose its About button.",
        control: {
          label: "About Practice environment",
          role: "button",
          availability: "conditional",
          source: ["components/layout/EnvironmentBadge.tsx", "components/ui/InfoTip.tsx"],
          sourceText: "About ${label}",
        },
        route: "/",
        where: "Top bar, beside the wordmark",
        result:
          "The badge names the environment, for example Practice environment or Live data, read only, and its About panel explains it. Practice environment means the records are made up and no real client data shows. Live data, read only means you see real records and nothing you do changes them. Ordinary live Production shows no badge at all.",
        effect: "reads",
        note: "Environment not confirmed means the deployment did not report its environment, so treat what you see as unverified. The About panel ends with Open the guide, which opens this step.",
      },
      {
        id: "ask-a-question",
        action:
          "Type a question in Question, or choose one of the Example questions, then choose Get answer.",
        control: {
          label: "Get answer",
          role: "button",
          availability: "required",
          source: ["components/ask/AskForm.tsx"],
        },
        route: "/",
        where: "Dashboard, Ask a question",
        result:
          "The answer appears under your question in one of three read-only forms: an Answer listing the records it found, each linked to its own page and read from its source; One more detail, when the question needs a little more; or a knowledge answer with its Sources. Each answer is saved to your History.",
        effect: "saves-in-app",
        note: "Choosing an example question only fills the box, and Dictate adds your spoken words to Question for you to review. Save question keeps a question under Saved questions so you can run it again for current results.",
      },
      {
        id: "check-waiting-on-you",
        action: "Read Waiting on you beside your conversations.",
        control: {
          label: "Waiting on you",
          role: "region",
          availability: "required",
          source: ["components/console/DashboardAttentionQueue.tsx"],
        },
        route: "/",
        where: "Dashboard, beside Ask a question",
        result:
          "Up to five approvals and other items waiting on you are listed, each linked to its own page, with a link to the full list. Nothing is waiting on you right now shows when the list is empty, and Try again reads the list again after a read that failed or was incomplete.",
        effect: "reads",
        note: "An Approver or Admin may see Approve on an eligible app item. It records the approval in the app only, sends nothing and changes no provider; other items open on their own review page. From your renewal messages lists the renewal work your own sent messages call for, each as the lease and its step, such as record the owner's decision, review the held offer, update the out-of-date owner message or check whether the offer went out, followed by Because you sent this message. A renewal difference row names its lease and field. A line under the list counts the renewals with a next action for the team and links Open the Renewal Desk. When the renewal data is past its freshness limit, the rows stay with Renewal data last read and its time, and Refresh reads them again.",
      },
      {
        id: "search-records",
        action: "Type part of a name, address or reference into Search records.",
        control: {
          label: "Search records",
          role: "combobox",
          availability: "required",
          source: ["components/search/GlobalEntitySearch.tsx"],
        },
        route: "/",
        where: "Top bar, on every page",
        result:
          "Matching leases, owners, residents, properties and units list under the box as you type. The Search guide covers the rest.",
        effect: "reads",
      },
      {
        id: "open-a-menu",
        scene: "home-operations-menu",
        action: "Choose Operations in the top bar to open its menu.",
        control: {
          label: "Operations",
          role: "button",
          region: "navigation:Primary",
          availability: "required",
          source: ["lib/navigation/primary-navigation.ts"],
        },
        route: "/",
        where: "Top bar, the navigation menus",
        result:
          "The Operations menu opens with Lease Renewal, Communications and Internal Processes, each with a short description. Choose a destination to open it; Escape closes the menu.",
        effect: "reads",
        note: "The My Work menu holds My Work, Dashboard and Approval Queue. The Admin menu holds Admin, Connections and Help; for staff who are not Admins, Admin opens your access page, where you request the permissions you need. On a phone the three menus sit under Menu, and a menu that holds the page you are on tells screen readers Contains current page.",
      },
      {
        id: "open-help",
        scene: "help-contents-narrow",
        action: "Open the Admin menu and choose Help.",
        control: {
          label: "Help",
          role: "link",
          region: "navigation:Primary",
          availability: "required",
          source: ["lib/navigation/primary-navigation.ts"],
          actions: ["click-button:Admin"],
        },
        route: "/",
        where: "Top bar, Admin menu",
        result:
          "Help opens at Start here. Help contents lists every area of the app with its guides, then Reference, Glossary and What changed.",
        effect: "reads",
      },
      {
        id: "check-notifications",
        action: "Choose Notifications to see what changed for you.",
        control: {
          label: "Notifications",
          role: "button",
          availability: "required",
          source: ["components/layout/NotificationMenu.tsx"],
        },
        route: "/",
        where: "Top bar",
        result:
          "The Notifications panel opens with your notifications. See all notifications opens the full page, and Mark all read clears the unread ones. When you have unread notifications, the button shows how many.",
        effect: "reads",
      },
      {
        id: "set-appearance",
        action: "Choose Appearance, then pick Use device setting, Light or Dark.",
        control: {
          label: "Appearance: Use device setting",
          role: "button",
          availability: "required",
          source: ["components/layout/Appearance.tsx"],
          sourceText: "Appearance: {LABELS[setting]}",
        },
        route: "/",
        where: "Top bar",
        result:
          "The app switches to that look right away and the button shows your choice. This browser remembers it; other devices keep their own setting.",
        effect: "saves-in-app",
      },
      {
        id: "send-feedback",
        action:
          "Choose Feedback, describe an idea, a question or what happened in Your feedback, then choose Send feedback.",
        control: {
          label: "Send feedback",
          role: "button",
          region: "dialog:Feedback",
          availability: "conditional",
          source: ["components/feedback/ReportIssueButton.tsx"],
          actions: ["click-button:Feedback"],
        },
        route: "/",
        where: "Top bar, Feedback dialog",
        result:
          "The dialog says your feedback was filed to the support queue for review. The page you were on is included automatically.",
        effect: "explicit-send",
        note: "Record feedback adds spoken words to Your feedback for you to review before you choose Send feedback. Feedback shows only where the environment allows changes.",
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
        route: "/",
        where: "Top bar, the link that shows your role",
        result:
          "My business profile opens with your sign-in email and the business profile and sender signature your messages use. The Use My Work and your Profile guide explains it.",
        effect: "reads",
      },
      {
        id: "sign-out",
        action: "Choose Sign out when you finish.",
        control: {
          label: "Sign out",
          role: "button",
          availability: "required",
          source: ["components/auth/SignOutButton.tsx"],
        },
        route: "/",
        where: "Top bar, at the end",
        result: "Your session ends and the sign-in page opens.",
        effect: "reads",
        note: "After about twenty-eight minutes without activity, Are you still active? appears with a two-minute countdown. Choose Stay signed in to keep working; otherwise you are signed out at thirty minutes.",
      },
    ],
    result:
      "You can reach every area of the app from the top bar, ask the Dashboard a question and open Help from any page. Nothing in RentVine, the operating Sheet or Dotloop changed.",
    doesNotDo: [
      "Answers on the Dashboard only read: they never send a message, create a draft, start a run or change RentVine, the operating Sheet or Dotloop.",
      "Waiting on you decides nothing for you; Approve records an app approval only and sends nothing.",
      "No badge shows in ordinary live Production; the badge appears only in a practice, read-only or unconfirmed environment.",
      "Feedback goes only to the Admin-reviewed support queue; it never reaches an owner, tenant or vendor.",
      "Appearance changes only how the app looks in this browser.",
    ],
    relatedGuides: ["my-work-and-profile", "search", "approve-or-deny", "work-a-renewal"],
    relatedScreens: ["dashboard", "top-bar", "help"],
    lastUpdated: "2026-11-13",
    navItems: ["dashboard", "help", "my-work"],
  },
];
