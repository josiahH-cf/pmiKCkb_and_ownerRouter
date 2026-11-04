import type { HelpGuide } from "@/lib/help/types";

// S243 R-S243-1: the lease renewal process guides. Every control label below is the exact text or
// accessible name the interface renders, and each `source` file contains it literally. Ordinary
// renewal staff (Editor and above) record their own work and confirm their own Sheet and RentVine
// updates through the exact preview and confirmation; no second person approves them.

const DESK = "/lease-renewal/live/desk";
const LEASE = "/lease-renewal/live/desk/lease/[leaseId]";
const FULL_VIEW = ["click-button:Full view"];

const SECTIONS = ["lib/lease-renewal/dashboard-sections.ts"];
const DESK_TABLE = ["components/lease-renewal/RenewalDeskTable.tsx"];
const WORKSPACE = ["components/lease-renewal/RenewalWorkspace.tsx"];
const MANUAL = ["components/lease-renewal/RenewalManualWorkspace.tsx"];
const ACTIVITIES = [
  "components/lease-renewal/RenewalManualWorkspace.tsx",
  "lib/lease-renewal/workspace-state.ts",
];
const COMPS = ["components/lease-renewal/RenewalProgressControls.tsx"];
const MESSAGE = ["components/lease-renewal/RenewalMessagePreparation.tsx"];
const SHEET = ["components/lease-renewal/OperatingSheetPanel.tsx"];
const RENTVINE = ["components/lease-renewal/RentvineUpdatesPanel.tsx"];
const CURRENT_RENT = ["components/lease-renewal/RenewalCurrentRent.tsx"];

export const LEASE_RENEWALS_GUIDES: readonly HelpGuide[] = [
  {
    id: "work-a-renewal",
    section: "lease-renewals",
    title: "Work a renewal from the desk to a recorded outcome",
    audience: "Renewal staff",
    purpose:
      "Find a lease on the renewal desk, read its facts and how fresh they are, check where RentVine and the operating Sheet differ, and record the lease term, your work status, notes, staff work and staff completion as the renewal moves along.",
    prerequisites: [
      "You are signed in with access to the Renewals Space.",
      "Anyone with Renewals access can read the desk and a lease. Recording work needs Editor access or higher.",
    ],
    steps: [
      {
        id: "choose-a-worklist-view",
        scene: "renewal-desk",
        action:
          "Open Lease Renewal and choose a view under Worklist views: Active / upcoming, All leases or Completed.",
        control: {
          label: "Worklist views",
          role: "navigation",
          region: "region:Renewal worklist",
          availability: "required",
          source: ["lib/lease-renewal/desk-worklist-views.ts"],
        },
        route: DESK,
        where: "Renewal desk, above the Renewal table",
        result:
          "The Renewal table shows one row per lease in that view, with a count of matching leases. Choosing a view changes nothing on any lease.",
        effect: "reads",
        note: "When your account remembers views, the view you choose becomes your saved worklist view, and Reset view returns to the default. Shared lease collections and Renewal run readiness open from the links at the top of the desk, and Save reviewed leases as a shared collection keeps the leases this view shows as a team group.",
      },
      {
        id: "filter-the-desk",
        scene: "renewal-desk-narrow",
        action:
          "Open a column filter, such as Filter renewal date, choose the dates or values you want and apply them.",
        control: {
          label: "Filter renewal date",
          role: "summary",
          availability: "required",
          source: DESK_TABLE,
        },
        route: DESK,
        where: "Renewal desk, the filter row under the column headings",
        result:
          "The table narrows to the matching leases and each active filter shows as a chip you can remove. Clear filters returns the whole view.",
        effect: "reads",
        note: "Filter lease/location, Filter status, Filter verification and Filter blocked work the same way. Nonrenewals first, the default sort, puts leases with a move-out notice or a recorded non-renewal at the top.",
      },
      {
        id: "open-a-lease",
        action:
          "In the Renewal table, choose the lease's address in the Lease / location column.",
        control: {
          label: "Renewal table",
          role: "region",
          availability: "required",
          source: DESK_TABLE,
        },
        route: DESK,
        where: "Renewal desk, Renewal table",
        result:
          "The lease workspace opens in Focus view, showing the one task that needs you now.",
        effect: "reads",
        note: "The Action column link opens the lease at the step it names.",
      },
      {
        id: "choose-full-view",
        scene: "lease-full-view",
        action:
          "Choose Full view to see every section of the lease, or stay in Focus view to work one task at a time.",
        control: {
          label: "Full view",
          role: "button",
          region: "group:Lease view",
          availability: "required",
          source: ["components/lease-renewal/RenewalFocusViewContext.tsx"],
        },
        route: LEASE,
        where: "Lease workspace, the Lease view switch under the address",
        result:
          "Every section shows, with section links for Lease details, Market rent comparison, Owner approval, Tenant offer and response, and Documents and completion. Switching views saves nothing.",
        effect: "reads",
        note: "In Focus view, Show this task in Full view jumps to the controls for the current task.",
      },
      {
        id: "read-lease-details",
        scene: "lease-details",
        action:
          "Choose Lease details in the section links and read the unit, people, dates and contractual base rent.",
        control: {
          label: "Lease details",
          role: "link",
          region: "navigation:Renewal dashboard sections",
          availability: "required",
          source: SECTIONS,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Lease workspace, section links",
        result:
          "The page moves to Lease details, which shows the facts the app read from RentVine and the operating Sheet. Reading or moving between sections changes nothing in RentVine, the Sheet or renewal progress.",
        effect: "reads",
        note: "Lease information opens a side panel with the address, parties, contact details and source records for this lease.",
      },
      {
        id: "refresh-the-lease",
        action:
          "Check when the facts were read and choose Refresh data when they are old or a supporting read did not complete.",
        control: {
          label: "Refresh data",
          role: "button",
          availability: "required",
          source: ["components/lease-renewal/RenewalDeskRefresh.tsx"],
        },
        route: LEASE,
        where: "Lease workspace, beside the address at the top",
        result:
          "The app reads the lease facts again and the page shows the new read. Your saved work stays as it is.",
        effect: "reads",
        note: "When the page says the lease data is out of date, recording and composing wait until a refresh completes.",
      },
      {
        id: "record-lease-term",
        action:
          "Under Lease term, check the term and dates, then choose Fixed-term or Month-to-month in the Lease term box. For month-to-month, enter the date it became month-to-month.",
        control: {
          label: "Lease term",
          role: "label",
          region: "region:Lease details",
          availability: "required",
          source: ["components/lease-renewal/LeaseTermReviewControl.tsx"],
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Lease details, Lease term",
        result:
          "The choice saves by itself as the term review for these exact lease facts. Renewal eligibility, the renewal window and the review date use it, and a context note is optional.",
        effect: "saves-in-app",
        note: "If the lease facts change, the page says the recorded term belongs to an earlier version; record the term again.",
      },
      {
        id: "compare-sources",
        action:
          "Read Data check: each fact shows Agrees, One source, Needs input or Needs your decision, with a source badge that opens the exact RentVine record or Sheet cell.",
        control: {
          label: "Data check",
          role: "heading",
          region: "region:Lease details",
          availability: "required",
          source: WORKSPACE,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Lease details, Data check",
        result:
          "You see where each value was read and where the two sources differ. Opening a source badge changes nothing.",
        effect: "reads",
        note: "For a difference, Review and resolve this source item opens the live renewal review, and Correct a lease fact prepares a change you confirm separately.",
      },
      {
        id: "record-work-status",
        action:
          "In Staff status and Status log, choose where the work stands in Work status (recorded by staff), and type context in Add a note when it helps.",
        control: {
          label: "Work status (recorded by staff)",
          role: "label",
          region: "region:Staff status and Status log",
          availability: "required",
          source: ["lib/lease-renewal/work-status.ts"],
        },
        route: LEASE,
        where: "Lease workspace, Staff status and Status log",
        result:
          "Each choice and each note saves by itself with your name and time and appears in the Status log, newest first. The desk shows the same staff status.",
        effect: "saves-in-app",
      },
      {
        id: "record-renewal-work",
        action:
          "Record each piece of work you did outside the app as it happens: under Work recorded by staff in the section where it belongs, choose its outcome, for example Owner outreach outcome.",
        control: {
          label: "Owner outreach outcome",
          role: "label",
          region: "region:Owner approval",
          availability: "conditional",
          source: ACTIVITIES,
          sourceText: "{definition.label} outcome",
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Owner approval, Work recorded by staff",
        result:
          "The entry saves at once with your name and time, and the first entry starts the work record. Recorded renewal work at the top of the lease shows the summary and the suggested next activity.",
        effect: "saves-in-app",
        note: "Add the source or channel when you have one; it saves when you leave the box. Reload records and history reads the latest entries.",
      },
      {
        id: "record-staff-completion",
        action:
          "When the applicable checklist is done, choose Record staff completion near the end of Documents and completion.",
        control: {
          label: "Record staff completion",
          role: "button",
          region: "region:Documents and completion",
          availability: "conditional",
          source: MANUAL,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Documents and completion, Staff completion",
        result:
          "The completion saves with your name and time, and the button changes to Reopen recorded completion for when work resumes.",
        effect: "saves-in-app",
      },
      {
        id: "back-to-renewals",
        action: "Choose ← Back to renewals to return to the desk.",
        control: {
          label: "← Back to renewals",
          role: "link",
          availability: "required",
          source: ["components/lease-renewal/RenewalDeskReturnLink.tsx"],
        },
        route: LEASE,
        where: "Lease workspace, top left",
        result: "The desk opens with the same view and filters you left.",
        effect: "reads",
      },
    ],
    result:
      "The lease shows your recorded term, work status, notes and staff work, and staff completion is recorded for the cycle. RentVine and the operating Sheet are unchanged by any of these steps.",
    doesNotDo: [
      "Reading, filtering and opening a lease change nothing in RentVine or the operating Sheet.",
      "Recording a status, a note, a term or staff work saves only in the app; it never sends a message or changes a source.",
      "Staff completion is not verified completion in RentVine, Gmail or Dotloop.",
      "The app does not approve, sign or send anything for you.",
    ],
    relatedGuides: [
      "compare-rent",
      "owner-message",
      "tenant-offer",
      "update-sources",
      "prepare-documents",
    ],
    relatedScreens: ["renewal-desk", "lease-workspace", "live-renewal-review"],
    lastUpdated: "2026-11-04",
    navItems: ["lease-renewal"],
    spaces: ["lease-renewals"],
  },
  {
    id: "compare-rent",
    section: "lease-renewals",
    title: "Compare rent and record market evidence",
    audience: "Renewal staff",
    purpose:
      "Build the market comparison for the owner conversation: start from the labeled starting range, run one deliberate RentCast lookup or enter your own sourced figures, read the RentCast reports, set the PMI recommendation and enter the working renewal terms.",
    prerequisites: [
      "The lease is open in Full view.",
      "Saving figures and working terms needs Editor access or higher.",
      "Paid RentCast lookups come from a monthly allowance, so run a lookup only when you need one.",
    ],
    steps: [
      {
        id: "open-market-comparison",
        scene: "market-rent-comparison",
        action: "Choose Market rent comparison in the section links.",
        control: {
          label: "Market rent comparison",
          role: "link",
          region: "navigation:Renewal dashboard sections",
          availability: "required",
          source: SECTIONS,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Lease workspace, section links",
        result:
          "The page moves to Market rent comparison, with Market evidence and Recommendation and working offer. Opening the section, typing or saving spends no paid lookup.",
        effect: "reads",
      },
      {
        id: "check-starting-range",
        action:
          "Read the starting range line, which is labeled as a starting range and not market evidence, and check Maximum comp search radius (miles).",
        control: {
          label: "Maximum comp search radius (miles)",
          role: "label",
          region: "region:Market rent comparison",
          availability: "required",
          source: COMPS,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Market rent comparison, Market evidence",
        result:
          "You see the range the comparison starts from, around the current contractual base rent, and how far a lookup searches. The default radius is five miles.",
        effect: "reads",
        note: "When the lease has no complete address, the line says why there is no starting range and no report link.",
      },
      {
        id: "run-one-lookup",
        action:
          "Choose Look up market comps (reference only) once for this unit when you want RentCast's comparison.",
        control: {
          label: "Look up market comps (reference only)",
          role: "button",
          region: "region:Market rent comparison",
          availability: "required",
          source: COMPS,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Market rent comparison, Market evidence",
        result:
          "The result shows the comparable range, the query basis, the retained comps and how many lookups are left this month. It fills only the figures you have not edited, and the lookup is kept with this renewal cycle.",
        effect: "saves-in-app",
        note: "Lookups come from the month's paid allowance. The result says whether it was a cache hit or a provider lookup, and a result that cannot be used says why and is marked Needs verification.",
      },
      {
        id: "enter-own-figures",
        action:
          "Type or edit Market rent: low estimate and Market rent: high estimate from your review, and name where they came from in Source of the comparison and review notes (optional).",
        control: {
          label: "Market rent: low estimate",
          role: "label",
          region: "region:Market rent comparison",
          availability: "required",
          source: COMPS,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Market rent comparison, Market evidence",
        result:
          "The preparation saves by itself with each figure's origin. Your own sourced figures always win over a lookup.",
        effect: "saves-in-app",
        note: "The owner message that uses the comparison needs a sourced low and high and reviewed comps or a reviewed attachment; the starting range alone is not enough.",
      },
      {
        id: "open-rentcast-report",
        action:
          "Choose Open the RentCast property report, or Open this lookup's RentCast property report after a lookup, to read RentCast's own report.",
        control: {
          label: "Open the RentCast property report",
          role: "link",
          region: "region:Market rent comparison",
          availability: "conditional",
          source: COMPS,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Market rent comparison, Market evidence",
        result:
          "RentCast's report opens in a new tab. It is RentCast's own page, not a receipt of the saved result.",
        effect: "copies",
      },
      {
        id: "set-pmi-recommendation",
        action: "Enter the reviewed rent you recommend in PMI recommended monthly rent.",
        control: {
          label: "PMI recommended monthly rent",
          role: "label",
          region: "region:Market rent comparison",
          availability: "required",
          source: COMPS,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Market rent comparison, Market evidence",
        result:
          "The recommendation saves with the comparison. The saved PMI recommendation prepares the Sheet Market value update, which you review and confirm separately under Review Sheet updates.",
        effect: "saves-in-app",
        note: "A recommendation that is still the RentCast point estimate enters a message only after staff accept that exact number or enter their own.",
      },
      {
        id: "enter-working-terms",
        action:
          "Under Working renewal terms in Owner approval, enter Working monthly rent, Working effective date and Working term end date as you know them.",
        control: {
          label: "Working monthly rent",
          role: "label",
          region: "region:Owner approval",
          availability: "required",
          source: MANUAL,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Owner approval, Working renewal terms",
        result:
          "Each value saves on its own with your name and time and stays until you change it. Tenant messages, the RentVine renewal rent preview and the Sheet and RentVine update previews use the saved values.",
        effect: "saves-in-app",
        note: "Record the owner's actual answer separately in Owner response; working terms are the rent and dates you are working with.",
      },
    ],
    result:
      "This renewal cycle has a sourced comparison, a PMI recommendation and working renewal terms that the owner message, the tenant message and the update previews use.",
    doesNotDo: [
      "A lookup or a saved figure never sets the renewal rent and sends nothing.",
      "The starting range is not market evidence.",
      "Opening the section, typing or saving spends no paid lookup; only Look up market comps (reference only) uses one.",
      "Saving the PMI recommendation or the working terms does not change the Sheet or RentVine; each update needs its own exact confirmation.",
      "Working renewal terms record no owner approval and no tenant acceptance.",
    ],
    relatedGuides: ["work-a-renewal", "owner-message", "tenant-offer", "update-sources"],
    relatedScreens: ["lease-workspace"],
    lastUpdated: "2026-11-04",
  },
  {
    id: "tenant-offer",
    section: "lease-renewals",
    title: "Prepare the tenant offer and record the response",
    audience: "Renewal staff",
    purpose:
      "Prepare the tenant renewal offer from the working renewal terms, deliver the offer by copy, an unsent Gmail draft or your own Send or Schedule in Communications, and record delivery and the tenant's actual response.",
    prerequisites: [
      "The working renewal terms are entered, because the tenant message is built from them.",
      "The lease is open in Full view.",
      "Saving edits and records needs Editor access or higher.",
    ],
    steps: [
      {
        id: "open-tenant-section",
        scene: "tenant-offer",
        action: "Choose Tenant offer and response in the section links.",
        control: {
          label: "Tenant offer and response",
          role: "link",
          region: "navigation:Renewal dashboard sections",
          availability: "required",
          source: SECTIONS,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Lease workspace, section links",
        result:
          "The page moves to Tenant offer and response, with Tenant message preparation, Work recorded by staff and Tenant response.",
        effect: "reads",
      },
      {
        id: "prepare-tenant-message",
        action:
          "Review the tenant message built from the working terms, applicable charges, insurance wording and resource links, and edit the Subject or the Email body where needed.",
        control: {
          label: "Email body",
          role: "label",
          region: "region:Tenant message preparation",
          availability: "conditional",
          source: MESSAGE,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Tenant offer and response, Tenant message preparation",
        result:
          "Your edits save by themselves with this lease, and the formatted preview shows the message as the tenant reads it.",
        effect: "saves-in-app",
        note: "Response request (optional wording edit) replaces one named paragraph; a blank box keeps the approved wording.",
      },
      {
        id: "resolve-marked-values",
        action:
          "Read Marked values: each value the app could not fill shows as a Needs Verification marker with a link to the control that fills it.",
        control: {
          label: "Marked values",
          role: "list",
          region: "region:Tenant message preparation",
          availability: "conditional",
          source: MESSAGE,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Tenant message preparation, below the message",
        result:
          "Each link opens the control to complete, such as Working renewal terms or a shared resource link. A marker stays visible in the message until its value is filled.",
        effect: "reads",
      },
      {
        id: "copy-the-message",
        action:
          "To deliver the offer yourself by email, the portal or a text, choose Copy subject and Copy plain text, or Copy formatted body.",
        control: {
          label: "Copy plain text",
          role: "button",
          region: "region:Tenant message preparation",
          availability: "conditional",
          source: MESSAGE,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Tenant message preparation, Copy the message",
        result:
          "The exact wording shown, markers included, is on your clipboard. Copying records no delivery.",
        effect: "copies",
      },
      {
        id: "review-tenant-drafts",
        action:
          "To use Gmail, choose Preview unsent Gmail draft, read the sender, recipients and wording, then choose Review creation confirmation and Create this unsent draft.",
        control: {
          label: "Preview unsent Gmail draft",
          role: "button",
          region: "region:Tenant message preparation",
          availability: "conditional",
          source: MESSAGE,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Tenant message preparation, Unsent Gmail draft",
        result:
          "An unsent draft is created in the displayed managed mailbox. Nothing is sent; a person reviews the draft in Gmail and sends it from there.",
        effect: "unsent-draft",
        note: "When the draft is unavailable, the panel says why; copying and Communications stay available. Earlier email, portal chat and text drafts stay under Earlier tenant offer evidence; they are evidence, and the current message preparation governs.",
      },
      {
        id: "open-renewal-notice",
        action:
          "To send through Communications, choose Compose tenant message in Communications.",
        control: {
          label: "Compose tenant message in Communications",
          role: "link",
          region: "region:Tenant message preparation",
          availability: "required",
          source: MESSAGE,
          sourceText: "Compose {channel} message in Communications",
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Tenant message preparation, at the top",
        result:
          "Communications opens in a new tab with this lease's tenant message, linked to the renewal. Opening it sends nothing.",
        effect: "copies",
      },
      {
        id: "send-or-schedule",
        action:
          "In Communications, review the sender, recipients, message and files, then choose Send, or Schedule with a date and time.",
        control: {
          label: "Send",
          role: "button",
          region: "region:Workflow communication composer",
          availability: "conditional",
          source: ["components/gmail-hub/CommunicationComposer.tsx"],
        },
        route: "/gmail-hub",
        where: "Communications, the composer opened for this lease",
        result:
          "The message goes out, or waits for the time you chose, once its current checks pass, and Communications shows its delivery state.",
        effect: "explicit-send",
        note: "A reply or a failed delivery pauses follow-ups, and Resume requires a fresh review.",
      },
      {
        id: "record-tenant-delivery",
        action:
          "After the offer goes out, open Tenant offer delivered under Work recorded by staff, choose its outcome and add the source or channel.",
        control: {
          label: "Tenant offer delivered outcome",
          role: "label",
          region: "region:Tenant offer and response",
          availability: "conditional",
          source: ACTIVITIES,
          sourceText: "{definition.label} outcome",
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Tenant offer and response, Work recorded by staff",
        result:
          "The outcome saves at once with your name and time, and the source saves when you leave the box. The entry is your record of delivery, not a provider receipt.",
        effect: "saves-in-app",
      },
      {
        id: "record-tenant-response",
        action:
          "When the tenant answers, choose Accepted, Counter / change requested, Declined / not renewing or Needs verification in Tenant response, and add the response source or channel.",
        control: {
          label: "Tenant response",
          role: "label",
          region: "region:Tenant offer and response",
          availability: "conditional",
          source: MANUAL,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Tenant offer and response, Tenant response",
        result:
          "The answer saves when you choose it and decides whether documents or the non-renewal handoff come next. Recording it accepts nothing for the tenant.",
        effect: "saves-in-app",
      },
      {
        id: "read-notice-timing",
        action:
          "Read the Notice timing card in Documents and completion: each notice date the app derived, with where it came from.",
        control: {
          label: "Notice timing",
          role: "heading",
          region: "region:Documents and completion",
          availability: "conditional",
          source: WORKSPACE,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Documents and completion, Notice timing",
        result:
          "A Needs Verification line means a source did not confirm that date. The card only reads, and the app sets no reminder or deadline from it.",
        effect: "reads",
      },
    ],
    result:
      "The tenant has the offer, delivery and the tenant's actual response are recorded with this lease, and the recorded response decides whether documents or the non-renewal handoff come next.",
    doesNotDo: [
      "The app sends nothing on its own; only your explicit Send or Schedule in Communications sends the message.",
      "Copying, drafting and recording deliver nothing and accept nothing for the tenant.",
      "An unsent Gmail draft is not delivery, and a recorded delivery or response is staff evidence, not a provider receipt.",
      "Recording the tenant response does not write to RentVine or the Sheet.",
    ],
    relatedGuides: [
      "compare-rent",
      "owner-message",
      "work-a-renewal",
      "prepare-documents",
    ],
    relatedScreens: ["lease-workspace", "communications"],
    lastUpdated: "2026-11-04",
  },
  {
    id: "update-sources",
    section: "lease-renewals",
    title: "Update RentVine and the operating Sheet",
    audience: "Renewal staff",
    purpose:
      "Keep RentVine and the operating Sheet right for this lease: save working values in the app, prepare each change as an exact preview, apply it yourself with its exact confirmation, and read the receipt and readback.",
    prerequisites: [
      "The lease is open in Full view and its facts are current; refresh the lease first when the page says they are out of date.",
      "Preparing and confirming an update needs Editor access or higher. You confirm your own update; no second person approves it.",
    ],
    steps: [
      {
        id: "enter-working-rent",
        action:
          "In Rent and charges, type the amount the tenant is billed today in Working current rent when it differs from what the sources show.",
        control: {
          label: "Working current rent",
          role: "label",
          region: "region:Rent and charges working area",
          availability: "required",
          source: ["lib/lease-renewal/working-record.ts", ...CURRENT_RENT],
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Lease details, Rent and charges",
        result:
          "The working value saves on its own and stays until you change it. Each source value and any difference stay visible beside it.",
        effect: "saves-in-app",
        note: "Contractual lease rent, Lease total (RentVine) and Unit listed rent keep their own meanings and are never added to the rent.",
      },
      {
        id: "prepare-rent-charge-update",
        action:
          "When the one current rent charge in RentVine differs from the working value, choose Prepare RentVine rent charge update.",
        control: {
          label: "Prepare RentVine rent charge update",
          role: "button",
          region: "region:Rent and charges working area",
          availability: "conditional",
          source: CURRENT_RENT,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Rent and charges, beside the working current rent",
        result:
          "A rent charge update from the current charge to the working value is prepared. Nothing changes in RentVine until you apply it under Review RentVine updates.",
        effect: "saves-in-app",
      },
      {
        id: "correct-a-fact",
        action:
          "For another fact that is wrong today, such as the renewal date, choose it in Fact to correct, use an observed source value or type the reviewed value, choose Destinations, then choose Prepare selected destination previews.",
        control: {
          label: "Fact to correct",
          role: "label",
          region: "region:Correct a lease fact",
          availability: "required",
          source: ["components/lease-renewal/RenewalCorrections.tsx"],
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Rent and charges, Correct a lease fact",
        result:
          "A proposal saves for each destination with the exact before and after values. Nothing changes in the Sheet or RentVine until you confirm each one under Review Sheet updates or Review RentVine updates.",
        effect: "saves-in-app",
        note: "For the current rent, Correct a lease fact points to the working current rent instead; no request or review is needed. A source or context note is optional.",
      },
      {
        id: "prepare-renewal-rent",
        action:
          "With the working renewal terms entered, choose Prepare future renewal rent, check the billing schedule shown and choose Prepare this future-rent preview.",
        control: {
          label: "Prepare this future-rent preview",
          role: "button",
          region: "region:Rent and charges working area",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalFutureRent.tsx"],
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Rent and charges, Prepare future renewal rent in RentVine",
        result:
          "A preview of the later billing schedule saves in the app. Today's billing and the Sheet current rent stay as they are.",
        effect: "saves-in-app",
      },
      {
        id: "apply-sheet-update",
        action:
          "Under Review Sheet updates, read the target row, the current value and the proposed value, then choose Apply Sheet update to confirm that one change.",
        control: {
          label: "Apply Sheet update",
          role: "button",
          region: "article:Review Sheet updates",
          availability: "conditional",
          source: SHEET,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Rent and charges, Review Sheet updates",
        result:
          "The app writes that one cell or row once after your confirmation, reads it back and shows the receipt.",
        effect: "exact-confirmation",
        note: "When the panel says Sheet updates are off by policy, the update waits and your working values still save in the app. A proposal whose confirmation window has expired needs a fresh proposal.",
      },
      {
        id: "reconcile-sheet-attempt",
        action:
          "If an attempt says its Sheet outcome is unproven, choose Reconcile from Sheet state before anything else.",
        control: {
          label: "Reconcile from Sheet state",
          role: "button",
          region: "article:Review Sheet updates",
          availability: "conditional",
          source: SHEET,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Rent and charges, Review Sheet updates",
        result:
          "The app reads the fresh Sheet state and records what it finds. Nothing is retried, and new Sheet previews for this lease stay locked while the attempt is uncertain.",
        effect: "saves-in-app",
      },
      {
        id: "apply-rentvine-update",
        action:
          "Under Review RentVine updates, read the exact source lease, the current values and each proposed effect, then choose Apply RentVine update to confirm that effect.",
        control: {
          label: "Apply RentVine update",
          role: "button",
          region: "article:Review RentVine updates",
          availability: "conditional",
          source: RENTVINE,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Rent and charges, Review RentVine updates",
        result:
          "The app applies the reviewed change once after your confirmation, reads the lease and charge back and shows the receipt. A remaining difference from the lease rent shows as a mismatch, not as a completed rent change.",
        effect: "exact-confirmation",
      },
      {
        id: "reconcile-rentvine-attempt",
        action:
          "If a RentVine attempt is uncertain, choose Reconcile from provider state, or Check effect statuses to read each effect again, before trying anything else.",
        control: {
          label: "Reconcile from provider state",
          role: "button",
          region: "article:Review RentVine updates",
          availability: "conditional",
          source: RENTVINE,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Rent and charges, Review RentVine updates",
        result:
          "The app reads the current RentVine state and records the outcome of the existing attempt. Nothing is applied again.",
        effect: "saves-in-app",
      },
      {
        id: "read-update-status",
        scene: "update-status",
        action: "Read Update status by destination in Rent and charges.",
        control: {
          label: "Update status by destination",
          role: "region",
          region: "region:Rent and charges working area",
          availability: "required",
          source: CURRENT_RENT,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Rent and charges, Update status by destination",
        result:
          "For each destination you see what is saved in the app, what is prepared, what applied with a receipt and read back, and what still needs attention.",
        effect: "reads",
      },
      {
        id: "offered-source-updates",
        action:
          "Under Source updates in Documents and completion, read each update your staff records offered and its state, then prepare its exact Sheet preview from there and confirm it under Review Sheet updates.",
        control: {
          label: "Source updates",
          role: "heading",
          region: "region:Documents and completion",
          availability: "required",
          source: MANUAL,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Documents and completion, Source updates",
        result:
          "Each offered update becomes an exact proposal that needs its own preview, your exact confirmation and readback. An offered update is not an applied one.",
        effect: "reads",
      },
    ],
    result:
      "Each confirmed change shows its receipt and readback under Review Sheet updates or Review RentVine updates, and Update status by destination shows what applied and what still needs attention.",
    doesNotDo: [
      "A saved working value or a prepared proposal does not change RentVine or the Sheet.",
      "The app never applies a Sheet or RentVine update without your exact confirmation, and each confirmed change applies only once.",
      "Reconciling reads fresh state and retries nothing.",
      "Nothing here sends a message to the owner or tenant.",
      "A confirmed charge change does not prove the contractual lease rent changed; a remaining difference shows as a mismatch.",
    ],
    relatedGuides: ["work-a-renewal", "compare-rent", "tenant-offer"],
    relatedScreens: ["lease-workspace"],
    lastUpdated: "2026-11-04",
  },
];
