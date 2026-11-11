import type { HelpGuide } from "@/lib/help/types";

// S243 R-S243-1 and S252 R-S252-6: the lease renewal process guides. Every control label below is
// the exact text or accessible name the interface renders, and each `source` file contains it
// literally. Ordinary renewal staff (Editor and above) record their own work and confirm their own
// Sheet and RentVine updates through the exact preview and confirmation; no second person approves
// them. The desk opens on the working batch and a lease opens in Guided view (S246, S247); the
// first steps of "Work a renewal" are the kickoff of a prepared lease, in order, up to its Send.
// S269 and S270 (help V4.0): each outcome leads with the one field or fix it needs now, and its
// optional work and read-only verification sit in named groups, closed on arrival, with the same
// names in Guided and Full view (lib/lease-renewal/guided-priority.ts).

const DESK = "/lease-renewal/live/desk";
const LEASE = "/lease-renewal/live/desk/lease/[leaseId]";
const FULL_VIEW = ["click-button:Full view"];
const FULL_CORRECTIONS = [...FULL_VIEW, "open-summary:Correct other lease facts"];
const FULL_NUMBERS_EVIDENCE = [...FULL_VIEW, "open-summary:Verify lease numbers"];
const FULL_COMPARISON_INPUTS = [
  ...FULL_VIEW,
  "open-summary:Comparison inputs and deliberate rerun",
];
const FULL_OWNER_OPTIONS = [
  ...FULL_VIEW,
  "open-summary:Owner message options and outreach record",
];
const FULL_TENANT_OPTIONS = [
  ...FULL_VIEW,
  "open-summary:Tenant offer options and record of contact",
];
const FULL_FOLLOW_UP_EVIDENCE = [
  ...FULL_VIEW,
  "open-summary:Verify follow-up and source updates",
];
const ALL_LEASES = ["click-link:All leases and filters"];
const GUIDED_PRIORITY = ["lib/lease-renewal/guided-priority.ts"];
const OWNER_ANSWER = ["components/lease-renewal/RenewalOwnerAnswer.tsx"];
const OFFER_CHARGES = ["components/lease-renewal/RenewalOfferCharges.tsx"];

const SECTIONS = ["lib/lease-renewal/dashboard-sections.ts"];
const BATCH = ["components/lease-renewal/RenewalWorkingBatch.tsx"];
const GUIDED = ["components/lease-renewal/RenewalGuidedView.tsx"];
const PATH = ["lib/lease-renewal/renewal-path.ts"];
const KICKOFF = ["lib/lease-renewal/renewal-preparation.ts"];
const PREPARED_MESSAGE = ["components/lease-renewal/RenewalPreparedMessage.tsx"];
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
      "Open the working batch, take a lease along its guided path from Check the numbers to Complete on the Now card, and record what happened as it happens. A prepared lease starts in three actions: open it, Review owner message, and confirm. Each step leads with the one field or fix it needs now. Use Full view for the lease's detailed sections and return to Guided for the current step.",
    prerequisites: [
      "You are signed in with access to the Renewals Space.",
      "Anyone with Renewals access can read the desk and a lease. Recording work and sending a message need Editor access or higher.",
    ],
    steps: [
      {
        id: "open-renewals",
        scene: "renewal-batch",
        action:
          "Open Lease Renewal. The desk opens on the working batch, with the working month and lease count above Monthly renewals.",
        control: {
          label: "Working batch",
          role: "region",
          availability: "required",
          source: BATCH,
        },
        route: DESK,
        where: "Renewals desk, at the top",
        result:
          "The table lists the selected month's targets first and unfinished earlier leases after them. Sort by stage, date or rent. Each row distinguishes staff action, a scheduled send, waiting and an unconfirmed result.",
        effect: "reads",
        note: "Previous month and Next month change the month shown. Choose a count above the table, such as Renewed in RentVine, confirm and close or Not renewal targets, to list its leases. Choose the button that names the month to prepare its eligible leases. The app reuses stored comparisons, follows the RentCast allowance and keeps owner drafts in the app. Changing the month or opening the desk starts no preparation.",
      },
      {
        id: "open-a-lease",
        scene: "renewal-batch-narrow",
        action: "In Monthly renewals, choose the lease's address or next step link.",
        control: {
          label: "Monthly renewals",
          role: "region",
          availability: "required",
          source: BATCH,
        },
        route: DESK,
        where: "Renewals desk, Monthly renewals",
        result:
          "The lease opens in this tab in Guided view at its current step: the stage line says who it waits on and since when, the Renewal path names each step, and the Now card shows its primary action after the heading and any alert, followed by the supporting next-step and detail text. ← Back to renewals returns to the same month, group and place.",
        effect: "reads",
        note: "Each row shows the address and unit, the tenant names, the end date, one stage line, one next step link and at most three tags, such as Standing agreement or Housing assistance. A missing input is named on the row and opens the lease where it is fixed.",
      },
      {
        id: "read-the-path",
        scene: "lease-guided-view",
        action:
          "Read the Renewal path: Check the numbers, Compare market rent, Ask the owner, Offer the tenant, Documents and signatures, Finish up and Complete, each marked Done, Now, Open, Waiting or Covered.",
        control: {
          label: "Renewal path",
          role: "navigation",
          region: "region:Guided view",
          availability: "required",
          source: GUIDED,
        },
        route: LEASE,
        where: "Lease page, Guided view, under the stage line",
        result:
          "On a prepared lease Check the numbers and Compare market rent read Done and the Now card is on Ask the owner. Choosing a step shows it in the Now card, and any step can be worked while an earlier one is open. Choosing a step saves nothing. While you inspect another step, Next step names the current work and Show current step takes you there.",
        effect: "reads",
        note: "Each step leads with the one field or exact fix it needs now, such as Correct the current base rent, Verify current lease end, Rent to recommend, Record the owner's answer, Set renewal base rent, Enter renewal start date or Review offer charges, and the field it names is the one that takes focus. A fix that belongs to another step opens there and offers the way back, such as Return to tenant offer. Check the numbers shows Current base rent, the monthly base rent with where it comes from, and names a separate charge such as pet rent apart from it. It states Numbers agree on RentVine, or names the one difference to settle with its fix; an operating Sheet value shows there only when it differs.",
      },
      {
        id: "open-verification",
        action:
          "To see where a step's numbers come from, open its Verification group below the work, such as Verify lease numbers on Check the numbers.",
        control: {
          label: "Verify lease numbers",
          role: "summary",
          region: "region:Lease details",
          availability: "required",
          source: GUIDED_PRIORITY,
          actions: ["click-button:Check the numbers"],
        },
        route: LEASE,
        where: "Guided view, under each step's work; Full view, under each section",
        result:
          "The group opens in place with the step's read-only evidence, such as the lease term, the rent and charge evidence, Update status by destination and Data check with a link to each source record. Reading it saves nothing, and the work above it stays as you left it.",
        effect: "reads",
        note: "Every step has one Verification group, closed when you arrive: Verify lease numbers, Verify market comparison, Verify owner terms and outreach, Verify offer facts and delivery, Verify forms and signing evidence, Verify follow-up and source updates and Verify completion. Optional work has its own named group beside it, such as Correct other lease facts or Owner message options and outreach record. A group opens by itself when it holds a failed or waiting save, an entry to fix, a note that governs the step or the step's current lead. Full view shows the same groups with the same names under its sections.",
      },
      {
        id: "read-the-prepared-message",
        scene: "lease-now-card",
        action:
          "Read the Now card: Reason to include, What sending needs and the owner message preview with the stored comparison. Under it, Owner approval shows Current base rent and Rent to recommend, your recommendation to the owner, with Edit rent to recommend.",
        control: {
          label: "Owner message",
          role: "region",
          region: "region:Now",
          availability: "conditional",
          source: PREPARED_MESSAGE,
        },
        route: LEASE,
        where: "Guided view, the Now card on Ask the owner",
        result:
          "The preview is the message exactly as the owner receives it, and What sending needs lists each input as Ready or names what is missing with its fix. A stored comparison is reused, so reaching the message needs no second comparison.",
        effect: "reads",
        note: "Rent to recommend is your recommendation, not the owner's answer. Edit rent to recommend opens its one editor on Compare market rent, and changing it or Reason to include is optional and updates the same preview. Rent to recommend shows its save state and offers Try again after a failed save. Retry keeps keyboard focus while saving and becomes available again if saving fails. Review, Schedule, Create Gmail draft instead and Open in Communications wait for their entered working figures to save. A failure keeps the entry and brings its field and nearby retry into view; its refusal clears when that field is confirmed. A Gmail preview that needs an entered figure closes its empty dialog before returning focus to that field. A loading preview keeps focus inside its dialog. A long review opens at its message details. Cancel or Escape closes a ready review and returns focus to its action. If figures change while the review loads, your entries are kept; open the review again to see the current message. Copy keeps the displayed bytes and says when working figures were unconfirmed. A lease with no rent to recommend leads with Rent to recommend before Send. A missing owner recipient's fix shows its reasons and source record links; when only the lease record is available, open its owner record there and refresh this lease after saving. A missing template's fix shows its publication status for the Approver handoff. Set up your signature opens your own signature form. Its fields are optional. Save blank signature completes setup without adding signature text. Full view keeps the same setup and message editor.",
      },
      {
        id: "review-and-send",
        scene: "lease-review-and-send",
        action: "Choose Review owner message.",
        control: {
          label: "Review owner message",
          role: "button",
          region: "region:Now",
          availability: "conditional",
          source: GUIDED_PRIORITY,
        },
        route: LEASE,
        where: "Guided view, the Now card's primary action",
        result:
          "Review and send opens with the exact message, the recipients and the sender. Nothing is sent until you confirm.",
        effect: "reads",
        note: "Full view opens the same review from Review and send under Owner message preparation. When something is missing, the primary action names the fix instead, such as Set up your signature or Review the marked values.",
      },
      {
        id: "send-the-message",
        action: "Read the exact review, then choose Send this message.",
        control: {
          label: "Send this message",
          role: "button",
          region: "dialog:Review and send",
          availability: "conditional",
          source: PREPARED_MESSAGE,
        },
        route: LEASE,
        where: "Review and send, below the exact message",
        result:
          "Once Gmail accepts the message, the lease reads Waiting on owner response on its page and its desk row with nothing more to enter, and its outreach record names the message, the time and the sender it came from.",
        effect: "explicit-send",
        note: "Schedule opens Review and schedule. Check the required Date and Time (Central), then choose Schedule this message. Create Gmail draft instead makes an unsent draft that you send from Gmail; choose I sent it from Gmail once you have. If creation is uncertain, use the one Recover exact Gmail attempt beside the preview on Now. Full view keeps this check in Unsent Gmail draft. Your authored wording stays as written when inputs change. The Now card names that change and offers Return to the standard wording to rebuild from current inputs, with Undo the last refinement to recover your wording.",
      },
      {
        id: "wait-for-the-owner",
        action:
          "While the owner has the message, read the Now card: who the lease waits on, since when, the last contact and what the app is watching.",
        control: {
          label: "Now",
          role: "region",
          region: "region:Guided view",
          availability: "required",
          source: GUIDED,
        },
        route: LEASE,
        where: "Guided view, the Now card",
        result:
          "An owner reply shows here as Owner replied with its date and the reply, and Record the owner's answer becomes the next step. A message Gmail has not confirmed reads Check whether the message went out, and a failed delivery reads Delivery failed with Check the address and send again.",
        effect: "reads",
        note: "Record what happened, Send again and Work a later step now stay available while the lease waits. This was not the renewal outreach asks for a reason. Remove the derived record reopens the step and brings focus to Now. Keep it returns to the correction action.",
      },
      {
        id: "record-the-owner-decision",
        action:
          "Choose Record the owner's answer and read Owner reply. Choose the Approved in the reply received option that names the reply's time and mailbox, Asked for a change or Declined / non-renewal. For an approval, enter Amount approved exactly as the owner gave it, choose what the answer covers and Who approved in this reply, then choose Review the owner's answer, check it and choose Save the owner's answer. For a change or a decline, choose Record this decision.",
        control: {
          label: "Review the owner's answer",
          role: "button",
          region: "region:Now",
          availability: "conditional",
          source: OWNER_ANSWER,
        },
        route: LEASE,
        where: "Guided view, the Now card on Ask the owner, once the owner replies",
        result:
          "The answer saves with your name and time. An approval records Amount approved as the offer amount for this renewal, what the answer covers, who approved, the reply it came in and the time that reply was received, and Continue to Offer the tenant appears. Record the owner's answer starts with no choice made, and a reply records an answer only when you choose one.",
        effect: "saves-in-app",
        note: "What the owner's answer covers is Base rent only, or Base rent and the renewal dates once both dates are saved; other charges are reviewed with the tenant offer. The review lists Recommended base rent beside Amount approved, and Change the answer returns to your entries. Rent to recommend stays your recommendation: the approved amount never replaces it, and when no earlier recommendation exists the lease says so. Owner reply reads the observed message from the linked conversation. A failed read offers Try again and keeps your entries. Retry keeps keyboard focus while reading and leads into the reply when ready. If you already moved to an answer, focus stays there. A partial reply says to read the full conversation. Owner response in Full view records an approval from an authorized representative, another written channel or a conversation: choose Approved, enter Amount approved and what it covers, then Who approved, How they approved and When they approved, and choose Review the owner's answer and Save the owner's answer. Record a new approval starts a new answer after one is saved.",
      },
      {
        id: "offer-the-tenant",
        action:
          "On Offer the tenant, settle what the Now card leads with, such as Set renewal base rent, Enter renewal start date or Review offer charges, read the tenant offer prepared from the working terms, choose Review tenant offer, read the exact review and choose Send this message.",
        control: {
          label: "Send this message",
          role: "button",
          region: "dialog:Review and send",
          availability: "conditional",
          source: PREPARED_MESSAGE,
        },
        route: LEASE,
        where: "Guided view, the Now card on Offer the tenant",
        result:
          "Once Gmail accepts the offer, the lease reads Waiting on tenant response. Prepare the tenant offer and record the response covers copying the offer, a Gmail draft and Communications.",
        note: "Review offer charges lists each charge line for this offer with its source and the exact totals; Prepare the tenant offer and record the response explains each choice. When the offer needs a shared flyer or form that is not ready for tenants, the Now card leads with Shared resource link and the resource's name. In the exact review, you can authorize follow-ups after the tenant offer. Enter their wording, interval, time, timezone and stopping bound. The next follow-up is due after confirmed acceptance. A verified tenant reply pauses unsent follow-ups. Record the decision separately.",
        effect: "explicit-send",
      },
      {
        id: "record-the-tenant-answer",
        action:
          "When the tenant answers, choose Record what happened, then choose the answer in Tenant response: Accepted, Counter / change requested, Declined / not renewing or Needs verification.",
        control: {
          label: "Tenant response",
          role: "label",
          availability: "conditional",
          source: MANUAL,
        },
        route: LEASE,
        where: "Guided view, under the Now card on Offer the tenant",
        result:
          "The answer saves when you choose it. After Accepted, a lease that still needs the renewal information form names Send the renewal information form and then Record the returned information form, each recorded as Information form sent and Information form returned, before Documents and signatures; Declined / not renewing goes to the non-renewal handoff. Recording it accepts nothing for the tenant.",
        effect: "saves-in-app",
      },
      {
        id: "prepare-the-documents",
        action:
          "On Documents and signatures, choose Prepare the required documents, and follow Prepare documents and hand off to Dotloop.",
        control: {
          label: "Prepare the required documents",
          role: "button",
          region: "region:Now",
          availability: "conditional",
          source: PATH,
        },
        route: LEASE,
        where: "Guided view, the Now card on Documents and signatures",
        result:
          "The document packet controls for this lease show under the Now card. Signing happens in Dotloop, and you record the documents, their delivery and the signatures as staff work.",
        effect: "reads",
        note: "Next for this packet names the one thing the packet needs first: a packet input with Enter it in Packet inputs, a form that waits on a named difference, a form whose source is pending with what is missing and who supplies it, or the signatures still awaited. Each other form keeps its own readiness, and the manual handoff stays available.",
      },
      {
        id: "finish-up",
        action:
          "On Finish up, read Finish up items and the RentVine and operating Sheet update previews prepared from the final terms.",
        control: {
          label: "Finish up items",
          role: "list",
          region: "region:Now",
          availability: "conditional",
          source: GUIDED,
        },
        route: LEASE,
        where: "Guided view, the Now card on Finish up",
        result:
          "Each item reads as recorded by staff or as verified by its receipt. Showing a preview changes nothing; each update applies only after its own exact confirmation, as Update RentVine and the operating Sheet describes.",
        effect: "reads",
        note: "Finish up shows the first open follow-up when you arrive, and it stays in place while you record it, with anything you typed. The next one takes its place when you come back to Finish up; the rest wait in Other follow-ups.",
      },
      {
        id: "record-staff-completion",
        action:
          "When the work for this cycle is done, choose Record staff completion on the Now card at Complete, or near the end of Documents and completion in Full view.",
        control: {
          label: "Record staff completion",
          role: "button",
          region: "region:Documents and completion",
          availability: "conditional",
          source: MANUAL,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Complete, or Documents and completion, Completion recorded by staff",
        result:
          "The completion saves with your name and time, and the button changes to Reopen recorded completion for when work resumes.",
        effect: "saves-in-app",
        note: "A lease whose RentVine end date moved later than its recorded cycle is listed under Renewed in RentVine, confirm and close. Record staff completion there, or Confirm this renewal is finished on the lease, asks you to confirm with the RentVine lease end as the evidence; Keep working leaves the lease in its group.",
      },
      {
        id: "work-a-covered-lease",
        action:
          "Open Ask the owner and read Pricing basis. When a verified standing agreement covers this renewal, the owner step shows the rule and the rent it gives.",
        control: {
          label: "Pricing basis",
          role: "group",
          region: "region:Renewal pricing policy",
          availability: "conditional",
          source: ["lib/lease-renewal/standing-agreement.ts"],
          actions: ["click-button:Ask the owner"],
        },
        route: LEASE,
        where: "Ask the owner in Guided view or Owner approval in Full view",
        result:
          "Coverage lets you continue to Offer the tenant. When saving a pricing basis, choose This lease only or Every lease in this owner's portfolio. A recommendation outside the rule returns the lease to Ask the owner with the reason shown.",
        effect: "saves-in-app",
        note: "The desk row carries the Standing agreement tag. Choose Owner decides each renewal when an owner decision is needed each cycle.",
      },
      {
        id: "work-an-assisted-lease",
        action:
          "On Check the numbers, set Housing assistance to Yes and enter the Program name when a housing program pays part of the rent. Add Program contact (optional) when you have it.",
        control: {
          label: "Housing assistance",
          role: "group",
          region: "region:Now",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalHousingAssistance.tsx"],
        },
        route: LEASE,
        where: "Guided view, the Now card on Check the numbers",
        result:
          "Once the numbers agree, Continue names and opens the program-contact step. The path asks you to contact the named program about the renewal process, then Ask the owner whether to renew this tenant (Renew, Do not renew or No answer yet), then Rent for this renewal (Keep the current rent or Propose a change), with nothing chosen for you. Keep the current rent leaves the comparison and the owner's rent decision out of the path, Propose a change brings them in, and Do not renew moves the lease to the non-renewal handoff.",
        effect: "saves-in-app",
        note: "The program-contact step names the program and its saved contact, or says no program contact is saved yet, with Enter the program contact or Edit the program contact. Either one takes you to the contact box in Housing assistance, the one place the contact is edited: on Check the numbers in Guided view, or in Lease information in Full view. After Yes is chosen, Program name is required. An empty name shows what to enter, and the choice saves when the name is complete. Saving is visible; a failed save keeps your entry and offers Try again. Newer typing stays in its field while an earlier save finishes. The desk row carries the Housing assistance tag. Animal follow-up records the outside work staff actually did. Animal charges and agreement in Readiness opens Packet inputs. Charges and agreements for an assistance animal wait for the approved rule. When RentVine wording mentions housing assistance and the field is unset, the lease reads RentVine mentions housing assistance. Set the field? and nothing changes until you set it.",
      },
      {
        id: "choose-full-view",
        scene: "lease-full-view",
        action:
          "Turn on Full view to see all five sections. Turn it off to return to the Guided path.",
        control: {
          label: "Full view",
          role: "button",
          region: "group:Lease view",
          availability: "required",
          source: ["components/lease-renewal/RenewalFocusViewContext.tsx"],
        },
        route: LEASE,
        where: "Lease page, the Lease view switch under the address",
        result:
          "Full view shows every section, with section links for Lease details, Market rent comparison, Owner approval, Tenant offer and response, and Documents and completion. Switching views saves nothing, and the next lease you open starts in Guided view.",
        effect: "reads",
        note: "Full view opens at the Guided outcome you were viewing. Use the section links to move to another section.",
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
        where: "Full view, section links",
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
        where: "Lease page, beside the address at the top",
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
          actions: FULL_CORRECTIONS,
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
          actions: FULL_NUMBERS_EVIDENCE,
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
          "Open Work status beside Lease information to select a status, add a note or open History.",
        control: {
          label: "Work status (recorded by staff)",
          role: "label",
          region: "region:Staff status and Status log",
          actions: ["open-summary:Work status"],
          availability: "required",
          source: ["lib/lease-renewal/work-status.ts"],
        },
        route: LEASE,
        where: "Sticky lease header, Work status",
        result:
          "Your annotation or note saves with your name and time in History. The stage beside the lease identity follows the actual work and evidence.",
        effect: "saves-in-app",
      },
      {
        id: "record-renewal-work",
        action:
          "Choose Record work beside the current stage and open the actual event, such as Owner outreach. Record its outcome in the existing staff form.",
        control: {
          label: "Owner outreach outcome",
          role: "label",
          region: "region:Owner approval",
          availability: "conditional",
          source: ACTIVITIES,
          sourceText: "{definition.label} outcome",
          actions: FULL_OWNER_OPTIONS,
        },
        route: LEASE,
        where:
          "Owner approval, Owner message options and outreach record, Work recorded by staff",
        result:
          "The entry saves at once with your name and time, and the first entry starts the work record. Recorded renewal work at the top of the lease shows the summary and the suggested next activity.",
        effect: "saves-in-app",
        note: "Add the source or channel when you have one; it saves when you leave the box. Reload records and history reads the latest entries.",
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
        where: "Lease page, top left",
        result: "The desk opens with the same month, group and place you left.",
        effect: "reads",
      },
      {
        id: "all-leases-and-filters",
        scene: "renewal-desk",
        action:
          "To work from the full lease table with its views, filters and sorting, choose All leases and filters above the batch.",
        control: {
          label: "All leases and filters",
          role: "link",
          region: "navigation:Renewal desk view",
          availability: "required",
          source: ["components/lease-renewal/RenewalDeskSurfaceSwitch.tsx"],
        },
        route: DESK,
        where: "Renewals desk, in the count filters above the table",
        result:
          "The Renewal worklist opens with Worklist views, the column filters, the sort and the Renewal table. Open my saved view, when you have one, opens your saved worklist view; the Renewals address on its own always opens the working batch.",
        effect: "reads",
        note: "Shared lease collections and Renewal run readiness open from the links at the top of the desk. A shared collection link opens the table filtered to that collection.",
      },
      {
        id: "choose-a-worklist-view",
        action:
          "In the Renewal worklist, choose a view under Worklist views: Active / upcoming, All leases or Completed.",
        control: {
          label: "Worklist views",
          role: "navigation",
          region: "region:Renewal worklist",
          availability: "required",
          source: ["lib/lease-renewal/desk-worklist-views.ts"],
          actions: ALL_LEASES,
        },
        route: DESK,
        where: "All leases and filters, above the Renewal table",
        result:
          "The Renewal table shows one row per lease in that view, with a count of matching leases. Choosing a view changes nothing on any lease.",
        effect: "reads",
        note: "When your account remembers views, the view you choose becomes your saved worklist view, and Reset view returns to the default. Save reviewed leases as a shared collection keeps the leases this view shows as a team group.",
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
          actions: ALL_LEASES,
        },
        route: DESK,
        where: "All leases and filters, the filter row under the column headings",
        result:
          "The table narrows to the matching leases and each active filter shows as a chip you can remove. Clear filters returns the whole view, and choosing a lease's address opens it in this tab.",
        effect: "reads",
        note: "Filter lease/location, Filter status, Filter verification and Filter blocked work the same way. Nonrenewals first, the default sort, puts leases with a move-out notice or a recorded non-renewal at the top.",
      },
    ],
    result:
      "The lease moved along its path on the Now card to a recorded outcome: the owner message and the tenant offer went out by your own confirmed Send, the answers are recorded, and staff completion is recorded for the cycle. RentVine and the operating Sheet change only through updates you confirm yourself.",
    doesNotDo: [
      "Opening the batch, a lease or a step, choosing a view and filtering change nothing in RentVine or the operating Sheet.",
      "The app sends a message only after your own Send this message or Schedule this message in the exact review.",
      "Recording a status, a note, a term, an answer or staff work saves only in the app; it never sends a message or changes a source.",
      "Staff completion is your own record for this cycle and never stands for verified completion in RentVine, Gmail or Dotloop.",
      "No step is locked by the suggested next step, and the app approves and signs nothing for you.",
    ],
    relatedGuides: [
      "train-and-review",
      "compare-rent",
      "owner-message",
      "tenant-offer",
      "update-sources",
      "prepare-documents",
    ],
    relatedScreens: ["renewal-desk", "lease-workspace", "live-renewal-review"],
    lastUpdated: "2026-11-10",
    navItems: ["lease-renewal"],
    spaces: ["lease-renewals"],
  },
  {
    // S267 R-S267-1..3: the staff training and internal review path on existing roles and scoped
    // surfaces. It grants nothing and adds no recipient, routing or approval step.
    id: "train-and-review",
    section: "lease-renewals",
    title: "Prepare a renewal as a teammate and review it as the lead",
    audience: "Renewal staff",
    purpose:
      "Learn the renewal work your role allows on the Guided path, hand off what is not yours, and let the lead follow and review the work inside the app. A staff recommendation, the team's own review, the owner's verified answer, the tenant offer you confirm, the tenant's response and the signatures stay separate records.",
    prerequisites: [
      "You use your own managed sign-in and your current Renewals access. This guide grants no role, Space, member or recipient; when your work needs more access, ask in My access and requests.",
      "Who does what: anyone with Renewals access reads the desk, a lease, its Verification groups and its Work status history. An Editor or higher also saves working values and notes, records the owner's and tenant's answers, and sends a message through its exact review. An Admin keeps the shared settings in Admin and Connections.",
      "The pictures in these guides come from synthetic rehearsal leases. Practice on the lease your lead chooses for you.",
    ],
    steps: [
      {
        id: "find-the-work",
        action:
          "Open Lease Renewal and find the lease in Monthly renewals, or choose All leases and filters to search the full table. Choose the address to open it.",
        control: {
          label: "Monthly renewals",
          role: "region",
          availability: "required",
          source: BATCH,
        },
        route: DESK,
        where: "Renewals desk, Monthly renewals",
        result:
          "The lease opens in Guided view at its current step. The stage line says who the lease waits on and since when, and the Renewal path marks each step Done, Now, Open, Waiting or Covered.",
        effect: "reads",
        note: "The desk and every lease open only with Renewals access, so a teammate without it cannot open a lease link you share.",
      },
      {
        id: "work-the-lead",
        action:
          "Work what the Now card leads with: the one field or exact fix the step needs now, such as Correct the current base rent, Rent to recommend or Record the owner's answer. Choosing its action takes you to that field.",
        control: {
          label: "Now",
          role: "region",
          region: "region:Guided view",
          availability: "required",
          source: GUIDED,
        },
        route: LEASE,
        where: "Guided view, the Now card",
        result:
          "Each field saves on its own and shows its save state. When the step is settled, the Now card leads with the next field or the step's primary action, and Show current step returns you to the current work from any other step.",
        effect: "saves-in-app",
        note: "A fix that belongs to another step opens there and offers the way back, such as Return to tenant offer. When a control is unavailable to your role, the card says who does it, for example An Editor enters it in Packet inputs, or An Admin records the tenant audience check in Connections.",
      },
      {
        id: "explain-the-source",
        action:
          "To explain where a number comes from, open the step's Verification group, such as Verify lease numbers, read its sources, then close it to return to the same work. Turn on Full view to see the same group under its section.",
        control: {
          label: "Verify lease numbers",
          role: "summary",
          region: "region:Lease details",
          availability: "required",
          source: GUIDED_PRIORITY,
          actions: ["click-button:Check the numbers"],
        },
        route: LEASE,
        where: "Guided view, under the step's work; Full view, under each section",
        result:
          "The group shows the read-only evidence with a link to each source record. Opening and closing it saves nothing, and turning Full view off returns to the Guided step you left.",
        effect: "reads",
        note: "A missing source reads Needs verification or Source pending with its reason; it is a fact to check or hand off, not a step to skip.",
      },
      {
        id: "prepare-the-recommendation",
        action:
          "On Compare market rent, read the stored comparison and set Rent to recommend, the rent you recommend to the owner, with its basis in words.",
        control: {
          label: "Rent to recommend",
          role: "label",
          region: "region:Now",
          availability: "conditional",
          source: KICKOFF,
          actions: ["click-button:Compare market rent"],
        },
        route: LEASE,
        where: "Guided view, the Now card on Compare market rent",
        result:
          "The amount saves as your recommendation and fills the owner message on Ask the owner. It stays a staff recommendation: the owner's answer is recorded separately and never replaces it.",
        effect: "saves-in-app",
      },
      {
        id: "leave-a-note-for-the-lead",
        action:
          "Open Work status in the lease header and use Add a note to tell the lead what you prepared and what is waiting.",
        control: {
          label: "Add a note",
          role: "label",
          region: "region:Staff status and Status log",
          availability: "required",
          source: ["lib/lease-renewal/work-status-notes.ts"],
          actions: ["open-summary:Work status"],
        },
        route: LEASE,
        where: "Lease header, Work status",
        result:
          "The note saves with your name and time in History, on this lease's one Work status entry. The stage beside the address still follows the recorded work and evidence.",
        effect: "saves-in-app",
        note: "A note or a staff status does not assign the lease, record an approval or mark a message delivered.",
      },
      {
        id: "lead-reviews-progress",
        action:
          "As the lead, open the same lease from the desk, from Shared lease collections, or from the lease link your teammate shares. Open Work status and read the staff status, the notes and History.",
        control: {
          label: "Work status",
          role: "summary",
          region: "group:Lease workspace panels",
          availability: "required",
          source: ["components/lease-renewal/RenewalWorkStatusControl.tsx"],
        },
        route: LEASE,
        where: "Lease header, beside Lease information",
        result:
          "You see the current stage, what was recorded and by whom, and the notes in order. Reply with your own note. Reading changes nothing, and the lease link opens only for people with Renewals access.",
        effect: "reads",
        note: "Lease follow-up tasks creates a task in your own My Work. To keep a group of leases together for the team, choose All leases and filters, then Save reviewed leases as a shared collection.",
      },
      {
        id: "lead-reviews-the-work",
        action:
          "Review the prepared work with your teammate: Rent to recommend and its basis, the owner message preview with What sending needs, and the Verification groups. Choose Review owner message to read the exact message, the recipients and the sender.",
        control: {
          label: "Owner message",
          role: "region",
          region: "region:Now",
          availability: "conditional",
          source: PREPARED_MESSAGE,
          actions: ["click-button:Ask the owner"],
        },
        route: LEASE,
        where: "Guided view, the Now card on Ask the owner",
        result:
          "The review shows the exact recipients and the responsible sender, with no added copy recipient. Reading it sends nothing: only Send this message in the exact review sends, and Cancel closes it.",
        effect: "reads",
        note: "The team's own review happens here and in your conversation; the app records no separate review or approval step for it. Whoever sends uses the same exact review, which names that person's own managed mailbox as the sender.",
      },
      {
        id: "keep-decisions-apart",
        action:
          "Read Owner approval and Tenant offer and response in Full view to tell each decision apart: Rent to recommend, the owner's answer with Amount approved and what it covers, the tenant offer you confirm, the Tenant response and the signatures.",
        control: {
          label: "Owner approval",
          role: "link",
          region: "navigation:Renewal dashboard sections",
          availability: "required",
          source: ["lib/lease-renewal/dashboard-sections.ts"],
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Full view, section links",
        result:
          "Rent to recommend is the staff recommendation. Record the owner's answer saves the owner's verified answer: Amount approved, Base rent only or Base rent and the renewal dates, and who approved, how and when. Send this message in the exact review sends the tenant offer, Tenant response records what the tenant said, and signatures happen in Dotloop by hand.",
        effect: "reads",
        note: "Each record keeps its own meaning: a recommendation is not the owner's approval, an approval covers only what it names, a sent offer is not the tenant's acceptance, and a recorded signature is staff evidence, not a Dotloop receipt.",
      },
      {
        id: "find-the-shared-settings",
        action:
          "When a fix needs a shared setting, find where it lives and hand it to an Admin: Connections, Renewal resource links, for the shared flyers, the information form and the form locations; Admin, Renewal packet configuration, Offer charge mappings, for what each RentVine account means in a tenant offer.",
        control: {
          label: "Insurance flyer",
          role: "label",
          region: "region:Renewal resource links",
          availability: "required",
          source: ["lib/lease-renewal/resource-locations.ts"],
        },
        route: "/connections#renewal-resource-locations",
        where: "Connections, Renewal resource links",
        result:
          "Every role reads the shared links and their state; only an Admin changes them. Offer charge mappings opens for an Admin only.",
        effect: "reads",
        note: "Who owns the Owner Renewal Outreach process and who receives its work by default is a team decision that is still open. While the published process keeps placeholder owner and approver assignments, Start run creates no run and says so. Hand work to a person directly and note it in Work status; an Admin records the responsible staff on the process only after the team names them.",
      },
    ],
    result:
      "The teammate prepared the work their role allows, explained its sources and handed off the rest; the lead followed the lease's Work status and reviewed the work inside the app. The owner's answer, the tenant offer, the tenant's response and the signatures stay separate, each recorded or sent only by its own action.",
    doesNotDo: [
      "This guide grants no role, Space, member or recipient, and changes no routing, approval rule or provider action.",
      "A note, a staff status or a team review is not the owner's approval, a sent message or a signature.",
      "Sharing a lease link gives no access; the lease opens only for people with Renewals access.",
      "Opening a Verification group, Full view or the exact review saves and sends nothing.",
    ],
    relatedGuides: [
      "work-a-renewal",
      "compare-rent",
      "owner-message",
      "tenant-offer",
      "prepare-documents",
      "my-work-and-profile",
    ],
    relatedScreens: ["renewal-desk", "lease-workspace"],
    lastUpdated: "2026-11-10",
    navItems: ["lease-renewal"],
    spaces: ["lease-renewals"],
  },
  {
    id: "compare-rent",
    section: "lease-renewals",
    title: "Compare rent and record market evidence",
    audience: "Renewal staff",
    purpose:
      "Read the comparison the app prepared for this lease and cycle on the Now card, or run the one comparison or enter your own sourced figures, then set the rent to recommend and the working renewal terms. Full view keeps the starting range, the RentCast reports and the PMI recommendation.",
    prerequisites: [
      "The lease is open from the working batch.",
      "Saving figures and working terms needs Editor access or higher.",
      "Paid RentCast lookups come from a monthly allowance; a comparison stored for this cycle is reused everywhere.",
    ],
    steps: [
      {
        id: "open-market-comparison",
        scene: "market-rent-comparison",
        action: "Choose Compare market rent in the Renewal path.",
        control: {
          label: "Compare market rent",
          role: "button",
          region: "navigation:Renewal path",
          availability: "required",
          source: PATH,
        },
        route: LEASE,
        where: "Guided view, Renewal path",
        result:
          "The Now card shows Compare market rent with the stored comparison and Rent to recommend, or Prepare this lease when none is stored. Choosing the step spends no paid lookup.",
        effect: "reads",
        note: "In Full view, Market rent comparison opens the same working rent. Comparison inputs and deliberate rerun holds additional controls.",
      },
      {
        id: "read-the-stored-comparison",
        action:
          "Read the stored comparison: its range, the comparables and its recorded Central date and time. Rent to recommend is filled from it, with its basis in words; type a different figure when you want one.",
        control: {
          label: "Rent to recommend",
          role: "label",
          region: "region:Now",
          availability: "conditional",
          source: KICKOFF,
        },
        route: LEASE,
        where: "Ask the owner in Guided or Full view",
        result:
          "A comparison stored for this lease and cycle is reused by the owner message, so it never needs a second run. A figure you type saves with this lease and always wins over the suggestion.",
        effect: "saves-in-app",
        note: "On a lease under a standing agreement, Rent to recommend is the agreement's rule applied to the current rent, with the rule shown as its basis. A saved rent from an earlier rule keeps its value and reads Built on the earlier rule. Choose Rebuild with the current rule to adopt the new proposal.",
      },
      {
        id: "prepare-this-lease",
        action:
          "When no comparison is stored, choose Prepare this lease to run the one comparison for this cycle, or enter your own figures.",
        control: {
          label: "Prepare this lease",
          role: "button",
          region: "region:Now",
          availability: "conditional",
          source: KICKOFF,
        },
        route: LEASE,
        where: "Guided view, the Now card on Compare market rent",
        result:
          "The comparison is kept with this renewal cycle and counted against the month's allowance. At the allowance the card reads Comparison not run: monthly allowance reached and offers Enter your own comparison figures.",
        effect: "saves-in-app",
      },
      {
        id: "check-starting-range",
        action:
          "In Full view, read the starting range line, which is labeled as a starting range and not market evidence, and check Maximum comp search radius (miles).",
        control: {
          label: "Maximum comp search radius (miles)",
          role: "label",
          region: "region:Market rent comparison",
          availability: "required",
          source: COMPS,
          actions: FULL_COMPARISON_INPUTS,
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
          "Choose Look up market comps (reference only) once for this unit when you want RentCast's comparison and none is stored.",
        control: {
          label: "Look up market comps (reference only)",
          role: "button",
          region: "region:Market rent comparison",
          availability: "required",
          source: COMPS,
          actions: FULL_COMPARISON_INPUTS,
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
          actions: FULL_COMPARISON_INPUTS,
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
          actions: FULL_COMPARISON_INPUTS,
        },
        route: LEASE,
        where: "Market rent comparison, Market evidence",
        result:
          "RentCast's report opens in a new tab. It is RentCast's own page, and the saved result stays in the app.",
        effect: "copies",
      },
      {
        id: "set-pmi-recommendation",
        action: "In Compare market rent, edit Rent to recommend.",
        control: {
          label: "Rent to recommend",
          role: "label",
          region: "region:Market rent comparison",
          availability: "required",
          source: KICKOFF,
          actions: FULL_VIEW,
        },
        route: LEASE,
        where: "Market rent comparison, Work",
        result:
          "The amount saves in the app. Ask the owner shows this same amount and links back to its editor.",
        effect: "saves-in-app",
        note: "Preparation can fill an empty amount using a verified basis. Your saved amount takes precedence. Rent to recommend stays your recommendation to the owner: the amount the owner approves is recorded with the owner's answer and never replaces it. The offer uses this amount until the owner's answer is saved; after that, Use this amount for the offer adopts a changed recommendation for the offer deliberately, and it is not an owner approval.",
      },
      {
        id: "enter-working-terms",
        action:
          "Under Owner approval, open Working renewal terms, then enter Working effective date and Working term end date, or choose Use the day after the current lease ends for the start.",
        control: {
          label: "Working effective date",
          role: "label",
          region: "region:Owner approval",
          availability: "required",
          source: MANUAL,
          actions: [...FULL_VIEW, "open-summary:Working renewal terms"],
        },
        route: LEASE,
        where: "Owner approval, Working renewal terms",
        result:
          "Each value saves on its own with your name and time and stays until you change it. Tenant messages, the RentVine renewal rent preview and the Sheet and RentVine update previews use the saved values.",
        effect: "saves-in-app",
        note: "Working renewal terms is its own group on Ask the owner, closed until the dates are the current work; Enter renewal start date or Enter renewal end date opens it at that field. Current lease ends shows the verified lease end. When it is verified and no start is saved, Use the day after the current lease ends saves that date as the Working effective date with its basis. The end date is always yours to enter, and an end that is not after the start is shown for review. A date fix that began on Offer the tenant offers Return to tenant offer. Record the owner's actual answer separately in Owner response; working terms are the rent and dates you are working with.",
      },
    ],
    result:
      "This renewal cycle has one stored comparison, a rent to recommend with its basis and working renewal terms that the owner message, the tenant offer and the update previews use.",
    doesNotDo: [
      "A comparison, a lookup or a saved figure never sets the renewal rent and sends nothing.",
      "The starting range is only a starting point; market evidence comes from a comparison or your own sourced figures.",
      "Opening a step or a section, typing and saving spend no paid lookup; only Prepare this lease, the selected month's preparation button and Look up market comps (reference only) can use one.",
      "Saving the PMI recommendation or the working terms does not change the Sheet or RentVine; each update needs its own exact confirmation.",
      "Working renewal terms record no owner approval and no tenant acceptance.",
    ],
    relatedGuides: ["work-a-renewal", "owner-message", "tenant-offer", "update-sources"],
    relatedScreens: ["lease-workspace"],
    lastUpdated: "2026-11-09",
  },
  {
    id: "tenant-offer",
    section: "lease-renewals",
    title: "Prepare the tenant offer and record the response",
    audience: "Renewal staff",
    purpose:
      "Prepare the tenant renewal offer from the working renewal terms, decide which charges apply in Review offer charges, deliver the offer with Review tenant offer on the Now card, by copy, an unsent Gmail draft or your own Send or Schedule in Communications, and record delivery and the tenant's actual response.",
    prerequisites: [
      "The working renewal terms are entered, because the tenant message is built from them.",
      "The lease is open from the working batch. Offer the tenant on the Now card holds the prepared offer; the steps that name a section use Full view.",
      "Saving edits and records needs Editor access or higher.",
    ],
    steps: [
      {
        id: "open-offer-the-tenant",
        action:
          "Choose Offer the tenant in the Renewal path, read the tenant offer prepared from the working terms, then choose Review tenant offer and Send this message when it is ready.",
        control: {
          label: "Offer the tenant",
          role: "button",
          region: "navigation:Renewal path",
          availability: "required",
          source: PATH,
        },
        route: LEASE,
        where: "Guided view, Renewal path and the Now card",
        result:
          "The Now card shows the tenant offer, What sending needs and the same delivery actions as the owner message. Once Gmail accepts the offer, the lease reads Waiting on tenant response with nothing more to enter.",
        effect: "explicit-send",
        note: "Choosing the step saves nothing. When a value is missing, the Now card leads with its fix, such as Set renewal base rent, Enter renewal start date or Review offer charges, and Review the marked values opens Marked values and its links. When the offer needs the insurance flyer or the resident benefits package flyer and that link is not verified for tenants, the Now card leads with Shared resource link and the flyer's name, which opens its entry in Connections; a role that does not keep the links also reads that an Admin records the tenant audience check there. A renewal information form link that is not verified for tenants is left out of the offer with no placeholder. Send this message in the exact review is the one action that sends the offer, and the review shows the exact recipients and the sender.",
      },
      {
        id: "review-offer-charges",
        action:
          "In Review offer charges, decide each charge line: answer its question, such as Does pet rent apply to this offer?, with Include in this offer or Leave out of this offer, and give Why it applies (its source) or Why it does not apply (its evidence). Open Correct the renewal amount or date when a line's renewal amount or date differs, with Source of the correction, and answer the insurance and Resident Benefits Package questions with their sources.",
        control: {
          label: "Review offer charges",
          role: "region",
          region: "region:Now",
          availability: "conditional",
          source: OFFER_CHARGES,
          actions: ["click-button:Offer the tenant"],
        },
        route: LEASE,
        where:
          "Offer the tenant, Review offer charges, on the Now card or under Tenant message preparation in Full view",
        result:
          "Each choice saves with the tenant message, and the totals show Renewal base rent, Monthly and One time. What the totals still need names each missing amount, date or source, and First names the line to settle next until every line is decided.",
        effect: "saves-in-app",
        note: "Each RentVine line and each case entry is its own row with its source. A line no mapping names is decided for this lease with What this charge is for this lease and its source. Confirm this line again appears when the meaning or source of a decided line changed. Lines that ended before the renewal, start after it, belong to the rent account or are a separate requirement are listed under Charge lines that do not apply, for review only. Add a charge for this lease only, in Tenant offer options and record of contact, adds a charge with its amount, date, trigger and Authorized case source or approved policy, and Remove this charge takes it out. No one-time fee is selected unless its approved policy or an authorized case source supports it. An Admin keeps the shared meaning of each RentVine account in Offer charge mappings.",
      },
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
          actions: FULL_TENANT_OPTIONS,
        },
        route: LEASE,
        where: "Tenant offer and response, Tenant message preparation",
        result:
          "Your edits save by themselves with this lease, and the formatted preview shows the message as the tenant reads it.",
        effect: "saves-in-app",
        note: "Response request (optional wording edit) replaces one named paragraph; a blank box keeps the approved wording. Lease origin (optional detail) records Current lease origin. On the Now card, Check tenant email addresses in RentVine opens the recipient reasons and the existing lease record link. Ask an Approver to publish the tenant template shows its publication status for that handoff.",
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
          actions: FULL_TENANT_OPTIONS,
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
          actions: FULL_TENANT_OPTIONS,
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
          actions: FULL_TENANT_OPTIONS,
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
          actions: FULL_TENANT_OPTIONS,
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
        note: "For the first tenant offer, you can authorize follow-ups in the same review. Enter the follow-up wording, interval, local time, timezone and an end date or total send limit. The next follow-up becomes due after Gmail confirms the offer. A verified tenant reply pauses unsent follow-ups. Record the actual decision under Tenant response. If the communication could not be read, choose Try again or Close. Resume requires a fresh review.",
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
          actions: FULL_TENANT_OPTIONS,
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
          actions: FULL_TENANT_OPTIONS,
        },
        route: LEASE,
        where: "Tenant offer and response, Tenant response",
        result:
          "The answer saves when you choose it. After Accepted, a lease that still needs the renewal information form records Information form sent and Information form returned under Work recorded by staff before documents; Declined / not renewing goes to the non-renewal handoff. Recording it accepts nothing for the tenant.",
        effect: "saves-in-app",
      },
      {
        id: "read-notice-timing",
        action:
          "Open Verify follow-up and source updates on Finish up and read the Notice timing card: each notice date the app derived, with where it came from.",
        control: {
          label: "Notice timing",
          role: "heading",
          region: "region:Documents and completion",
          availability: "conditional",
          source: WORKSPACE,
          actions: FULL_FOLLOW_UP_EVIDENCE,
        },
        route: LEASE,
        where: "Finish up, Verify follow-up and source updates, Notice timing",
        result:
          "A Needs Verification line means a source did not confirm that date. The card only reads, and the app sets no reminder or deadline from it.",
        effect: "reads",
      },
    ],
    result:
      "The tenant has the offer, delivery and the tenant's actual response are recorded with this lease, and the recorded response decides whether documents or the non-renewal handoff come next.",
    doesNotDo: [
      "The app sends nothing on its own; only your explicit Send this message in the exact review, or Send or Schedule in Communications, sends the offer.",
      "Copying, drafting and recording deliver nothing and accept nothing for the tenant.",
      "An unsent Gmail draft is not delivery, and a recorded delivery or response is staff evidence, not a provider receipt.",
      "Recording the tenant response does not write to RentVine or the Sheet.",
      "Review offer charges decides the offer's lines only; no RentVine charge changes, and a mapping or a policy sets no fee for a lease.",
    ],
    relatedGuides: [
      "compare-rent",
      "owner-message",
      "work-a-renewal",
      "prepare-documents",
    ],
    relatedScreens: ["lease-workspace", "communications"],
    lastUpdated: "2026-11-09",
  },
  {
    id: "update-sources",
    section: "lease-renewals",
    title: "Update RentVine and the operating Sheet",
    audience: "Renewal staff",
    purpose:
      "Keep RentVine and the operating Sheet right for this lease: save working values in the app, prepare each change as an exact preview, apply it yourself with its exact confirmation, and read the receipt and readback.",
    prerequisites: [
      "The lease is open in Full view and its facts are current; refresh the lease first when the page says they are out of date. Finish up on the Now card shows the RentVine and operating Sheet update previews that the final terms call for; each one still applies only here, after its exact confirmation.",
      "Preparing and confirming an update needs Editor access or higher. You confirm your own update; no second person approves it.",
    ],
    steps: [
      {
        id: "enter-working-rent",
        action:
          "In Rent and charges, type the current monthly base rent in Working current rent when it differs from what the sources show. Correct the current base rent on Check the numbers brings you here.",
        control: {
          label: "Working current rent",
          role: "label",
          region: "region:Rent and charges working area",
          availability: "required",
          source: ["lib/lease-renewal/working-record.ts", ...CURRENT_RENT],
          actions: FULL_CORRECTIONS,
        },
        route: LEASE,
        where: "Lease details, Rent and charges",
        result:
          "The working value saves on its own and stays until you change it. Each source value and any difference stay visible beside it.",
        effect: "saves-in-app",
        note: "Current base rent, on Check the numbers and Ask the owner, reads this same value once it is saved. A separate recurring charge such as pet rent is named apart from the base rent. Contractual lease rent, Lease total (RentVine) and Unit listed rent keep their own meanings and are never added to the rent.",
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
          actions: FULL_CORRECTIONS,
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
          actions: FULL_CORRECTIONS,
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
          actions: FULL_CORRECTIONS,
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
          actions: FULL_CORRECTIONS,
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
          actions: FULL_CORRECTIONS,
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
          actions: FULL_CORRECTIONS,
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
          actions: FULL_CORRECTIONS,
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
          region: "region:Lease details",
          availability: "required",
          source: CURRENT_RENT,
          actions: FULL_NUMBERS_EVIDENCE,
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
    lastUpdated: "2026-11-09",
  },
];
