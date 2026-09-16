// S115: plain-language section help for the lease renewal workspace. Pure content over the
// existing owning operations: every entry says what a heading is for, the real steps when a
// sequence exists, what saving records and where it goes, and what does not happen. Nothing here
// grants, performs or implies a send, a provider write, an approval or a signature; the actual
// controls keep their exact confirmations. Operator wording only: no action keys, hashes or ids.

export const SECTION_HELP_IDS = [
  "section-lease-details",
  "section-comps",
  "section-owner",
  "section-tenant",
  "section-documents",
  "lease-term",
  "renewal-cycle",
  "rent-and-charges",
  "correct-a-fact",
  "future-rent",
  "data-check",
  "sheet-updates",
  "rentvine-updates",
  "source-updates",
  "market-evidence",
  "owner-decision",
  "tenant-offer",
  "waiting-follow-up",
  "staff-work-owner",
  "staff-work-tenant",
  "staff-work-documents",
  "owner-response",
  "tenant-response",
  "message-preparation-owner",
  "message-preparation-tenant",
  "renewal-notice-draft",
  "document-preparation",
  "packet-truth",
  "document-handoff",
  "resource-links",
  "notice-timing",
  "staff-completion",
  "completion-checks",
] as const;

export type SectionHelpId = (typeof SECTION_HELP_IDS)[number];

export interface SectionHelp {
  /** Stable accessible name; the trigger reads `About ${label}`. */
  readonly label: string;
  /** One or two plain sentences: what this heading is for and which input matters. */
  readonly purpose: string;
  /** Only when a real sequence exists; rendered as Step 1, Step 2... Never a single step. */
  readonly steps?: readonly string[];
  /** What saving or confirming records, and where it goes. */
  readonly saves: string;
  /** Explicit non-effects: no send, no source write, no approval, no signature, no progress. */
  readonly notDone: string;
  /** The real next control, optionally with an existing fragment target. */
  readonly next?: { readonly label: string; readonly targetId?: string };
}

export const SECTION_HELP: Readonly<Record<SectionHelpId, SectionHelp>> = {
  "section-lease-details": {
    label: "Lease details",
    purpose:
      "Start here. This section shows the unit, people, dates and contractual base rent the app read from RentVine and the operating Sheet, and where those two sources differ.",
    steps: [
      "Check the lease term and dates, and record the term when the app needs a review.",
      "Compare the Data check rows. Open the source link or Correct a lease fact for anything marked Needs your decision or Needs input.",
      "Confirm the reviewed renewal cycle in Recorded renewal work so later sections save against it.",
    ],
    saves:
      "Only the term review, a correction and the cycle choice save anything, each through its own control. Reading this section saves nothing.",
    notDone:
      "Viewing or navigating never changes RentVine, the Sheet or renewal progress.",
    next: { label: "Do this next, above, names the first unresolved item." },
  },
  "section-comps": {
    label: "Market rent comparison",
    purpose:
      "Optional preparation for the owner conversation: compare similar rentals or enter your own sourced analysis and save it with this renewal cycle.",
    steps: [
      "Select the reviewed cycle in Lease details so the comparison is retained.",
      "Run a deliberate lookup or type your own low and high figures with their source.",
      "Save the preparation; the owner message reuses it.",
    ],
    saves:
      "Saved comparison figures, their source and any retained lookup result are stored with this lease and cycle for the owner message.",
    notDone:
      "A comparison never sets the approved rent, changes a source or sends anything. Opening the section spends no paid lookup.",
    next: {
      label: "Prepare the owner message in Owner approval.",
      targetId: "renewal-section-owner",
    },
  },
  "section-owner": {
    label: "Owner approval",
    purpose:
      "Prepare the owner message, get the owner's actual answer outside the app, then record that answer with the exact approved rent and dates.",
    steps: [
      "Review and save the owner message preparation, then copy it or create an unsent Gmail draft.",
      "Send it yourself from your mailbox or channel and talk with the owner.",
      "Record the owner response with the exact approved rent, effective date and term end date.",
    ],
    saves:
      "Saved preparation and the recorded owner response are stored with this cycle; the approved terms supply the tenant offer.",
    notDone:
      "The app sends nothing and records no approval on its own. A saved message is not delivery, and a recorded response is staff evidence, not a provider receipt.",
    next: {
      label: "Continue with the tenant offer.",
      targetId: "renewal-section-tenant",
    },
  },
  "section-tenant": {
    label: "Tenant offer and response",
    purpose:
      "Use the owner's exact approved terms to prepare the tenant message, deliver it yourself, then record the tenant's actual response.",
    steps: [
      "Review the tenant message preparation built from the approved terms, charges and links; save your edits.",
      "Copy the message or create an unsent Gmail draft, then send it yourself in the right channel.",
      "Record delivery and the tenant's actual response with its source.",
    ],
    saves:
      "Saved preparation, recorded delivery and the tenant response are stored with this cycle and unlock the document work.",
    notDone:
      "Nothing is sent by the app. Recording a response does not accept terms for the tenant or write to RentVine or the Sheet.",
    next: {
      label: "Prepare documents and follow-ups.",
      targetId: "renewal-section-documents",
    },
  },
  "section-documents": {
    label: "Documents and completion",
    purpose:
      "Check the approved terms and required forms, prepare the document packet, record delivery and signatures done outside the app, then finish the remaining checks.",
    steps: [
      "Confirm the resource links and packet truth show what this lease needs.",
      "Prepare or hand off the packet, then record documents, signatures and follow-ups as staff work.",
      "Record staff completion when the applicable checklist is done.",
    ],
    saves:
      "Staff records, packet evaluations and any confirmed provider action are stored separately with this lease and cycle.",
    notDone:
      "A recorded step is not a signature or provider verification. Nothing here creates legal content or sends a document.",
  },
  "lease-term": {
    label: "Lease term",
    purpose:
      "Shows the term and dates read from RentVine and lets you record how the app treats this lease. Lease end is when the current lease ends; Month-to-month since is the anchor for the next annual review.",
    steps: [
      "Check the term, start and end dates above against the lease.",
      "Choose Fixed-term or Month-to-month. For month-to-month, enter the date it became month-to-month; the next review is 12 months later.",
      "Enter a short reason and choose Record lease term.",
    ],
    saves:
      "An app-owned term review tied to this exact version of the lease facts. Renewal eligibility, the renewal window and the review date use it; if the facts change, record it again.",
    notDone:
      "Nothing is written to RentVine or the Sheet, no message is drafted, and no owner approval or signature is implied.",
    next: {
      label: "Confirm the renewal cycle in Recorded renewal work.",
      targetId: "renewal-manual-cycle",
    },
  },
  "renewal-cycle": {
    label: "Recorded renewal work",
    purpose:
      "One renewal cycle groups everything staff record for this lease: the cycle date, comparisons, message inputs, responses and completion. Confirm the cycle before recording work.",
    steps: [
      "Check the cycle date and its source shown below.",
      "Tick the review box and confirm the cycle. Starting another cycle keeps the current one as history.",
      "Use Continue recorded work to reach the next open item.",
    ],
    saves:
      "The confirmed cycle and every later staff record are stored with this lease; the history disclosure lists each saved entry with who recorded it and when.",
    notDone:
      "Confirming a cycle changes no source and sends nothing. Provider evidence stays separate from these staff records.",
  },
  "rent-and-charges": {
    label: "Rent and charges",
    purpose:
      "The one working area for rent and charge facts. Current contractual base rent comes from the lease. Lease total (RentVine) adds the separate recurring charges. Unit listed rent is a reference figure, not a lease term. Each recurring charge is listed with its account classification and schedule.",
    steps: [
      "Choose the intent: Correct a current fact for a value that is wrong today, or Prepare future approved rent for the owner-approved terms already recorded.",
      "Enter or accept the prefilled value once and record its source or reason.",
      "Prepare the destination previews, then an Admin confirms each exact effect under Review RentVine updates or Review Sheet updates.",
      "Read Update status by destination: it shows what is saved in the app, what is prepared, what applied with a receipt and what still needs attention.",
    ],
    saves:
      "A correction or approved term is saved in the app first. Each Sheet or RentVine update is a separate prepared proposal that only an Admin confirmation applies; the app reads the result back afterwards.",
    notDone:
      "A saved value is not a source update. A future offer does not change today's rent or the Sheet current rent. A confirmed charge change does not prove the lease base rent changed; a remaining difference is shown as a mismatch, never hidden.",
    next: {
      label: "Start with Correct a current fact or Prepare future approved rent.",
      targetId: "renewal-correct-a-fact",
    },
  },
  "correct-a-fact": {
    label: "Correct a lease fact",
    purpose:
      "Fixes a fact that is wrong today, such as the current base rent or the renewal date, by preparing a change to the operating Sheet, RentVine or both.",
    steps: [
      "Choose the fact, then use an observed source value or type the reviewed value.",
      "Enter the value source or reason.",
      "Choose the destination. Current rent to the Sheet first needs the saved current-rent proposal and the Admin approval shown in this card.",
      "Prepare the destination previews, then review and confirm each one under Review Sheet updates or Review RentVine updates.",
    ],
    saves:
      "Preparing saves a proposal in the app with the exact before and after values. An Admin confirms each destination separately and the app reads the result back.",
    notDone:
      "A saved proposal or approval does not change the Sheet or RentVine. Nothing is sent to the owner or tenant.",
    next: {
      label: "Review the prepared change under Review Sheet updates.",
      targetId: "operating-sheet-title",
    },
  },
  "future-rent": {
    label: "Prepare future approved rent in RentVine",
    purpose:
      "Prepares the owner-approved future rent as a RentVine recurring-charge change that starts on the approved effective date, leaving today's billing in place until then.",
    steps: [
      "Record the owner's exact approved rent and dates in Owner response and exact terms.",
      "Review the reviewed billing schedule shown here and save the future schedule preview.",
      "Record the tenant's acceptance of those exact terms under Tenant offer and response.",
      "An Admin confirms the exact RentVine effect under Review RentVine updates.",
    ],
    saves:
      "A saved future-schedule preview in the app. Only the Admin confirmation changes RentVine, and the app reads the charge back afterwards.",
    notDone:
      "The current Sheet rent and today's charge are unchanged by a saved preview. No message or approval results from it.",
  },
  "data-check": {
    label: "Data check",
    purpose:
      "Compares each lease fact across RentVine and the operating Sheet. Agrees means both sources match; One source means only one source has it; Needs your decision means they differ.",
    steps: [
      "Open the source badge to see the exact RentVine record or Sheet cell.",
      "Resolve a difference with Correct a lease fact or the reconciliation decision below.",
    ],
    saves:
      "Your decision is recorded in the app with its reason. A source only changes through a separately confirmed update.",
    notDone:
      "A source badge shows where a value was read; it does not prove the two sources agree, and opening it changes nothing.",
  },
  "sheet-updates": {
    label: "Operating Sheet updates",
    purpose:
      "Shows the one Sheet change waiting for review, or none, and lets an Admin apply it exactly once to the operating renewal tab.",
    steps: [
      "Read the target row, the current value and the proposed value.",
      "An Admin chooses Review and confirm, then Confirm this exact effect once.",
      "The app writes that one cell or row, reads it back and shows the receipt. If the outcome is unproven, use Reconcile from Sheet state before anything else.",
    ],
    saves:
      "Only the confirmed effect changes the Sheet. Proposals, discards and receipts stay in the app.",
    notDone:
      "An Editor's preview writes nothing. No saved proposal means nothing is waiting; it is not a Sheet problem. An expired confirmation window needs a fresh proposal.",
    next: {
      label:
        "Prepare a change in Correct a lease fact or under Correct an operating Sheet field below.",
    },
  },
  "rentvine-updates": {
    label: "RentVine updates",
    purpose:
      "Shows the RentVine change waiting for review, or none, and lets an Admin apply each supported effect exactly once: renewal dates or a recurring charge.",
    steps: [
      "Read the exact source lease, the current values and each proposed effect.",
      "An Admin chooses Review and confirm, then confirms the exact effect once.",
      "The app applies it, reads the lease and charge back and shows the receipt. Recover an uncertain attempt before trying again.",
    ],
    saves:
      "Only the confirmed effect changes RentVine. Proposals, replacements and receipts stay in the app.",
    notDone:
      "A saved proposal writes nothing. RentVine exposes no general base-rent setter; a charge change is checked against the refreshed lease rent separately, and a remaining difference is shown as a mismatch, not as a completed rent change.",
  },
  "source-updates": {
    label: "Source updates",
    purpose:
      "Lists the Sheet or RentVine updates this cycle's staff records offered, with their current state.",
    saves:
      "Each offered update becomes an exact proposal that needs its own preview, Admin confirmation and readback in Lease details.",
    notDone:
      "An offered update is not an applied one. Recording staff work never writes to a source by itself.",
  },
  "market-evidence": {
    label: "Market evidence",
    purpose:
      "Holds the comparison for this cycle: an explicit RentCast lookup for this unit or your own low and high figures with their source.",
    steps: [
      "Choose the radius and run one deliberate lookup, or type sourced figures.",
      "Review the result and its source; keep or adjust the numbers.",
      "Save the preparation so the owner message can use it.",
    ],
    saves:
      "Saved figures, their source and the retained lookup result stay with this cycle. A provider-derived suggestion still needs Admin approval before it enters a draft.",
    notDone:
      "A lookup or a saved figure never sets the renewal rent, and nothing is sent. Opening the section spends no paid lookup.",
  },
  "owner-decision": {
    label: "Owner decision",
    purpose:
      "Records the owner's rent decision for this cycle and shows the owner email facts the app already knows.",
    steps: [
      "Enter the owner's decision and the offered rent once you actually have it.",
      "Review the listed facts and the preview of the owner email.",
    ],
    saves:
      "The decision is stored with this lease and unlocks the tenant offer. Asking for changes reopens the owner copy and every preview built from it.",
    notDone:
      "The preview is a draft and is never sent by the app. A recorded decision is not a provider effect.",
  },
  "tenant-offer": {
    label: "Tenant offer",
    purpose:
      "Shows the tenant offer drafts for email, portal chat and text built from the approved terms, and lets you record the tenant's actual response.",
    steps: [
      "Compose or review the tenant offer using the current message preparation.",
      "Deliver it yourself in the chosen channel.",
      "Record the tenant's actual response with its source.",
    ],
    saves:
      "The recorded response is stored with this cycle and drives the document work.",
    notDone:
      "Every draft here is unsent. Earlier retained drafts are evidence, not the current instruction.",
  },
  "waiting-follow-up": {
    label: "Waiting and follow-up",
    purpose:
      "Shows who the renewal is waiting on and lets you mark follow-up attention or link the thread you are watching.",
    saves:
      "Attention and thread links are stored with this lease for staff; they change no message and no source.",
    notDone: "Follow-up timing is not a reminder, a send or a deadline set by the app.",
  },
  "staff-work-owner": {
    label: "Work recorded by staff: owner",
    purpose:
      "Records the owner-side work you did in another channel or tool: outreach, the response and any approval conversation.",
    steps: [
      "Choose the outcome for each activity: Not started, Waiting, Done or Not applicable with its rule.",
      "Name the actual email, call or record that supports it.",
      "Save; the next open activity opens.",
    ],
    saves: "Each entry is stored with this cycle, with who recorded it and when.",
    notDone:
      "These records send nothing and verify no provider effect. Marking Done is your report, not a receipt.",
  },
  "staff-work-tenant": {
    label: "Work recorded by staff: tenant",
    purpose:
      "Records the tenant-side work you did outside the app: delivery of the offer, the response and any revised terms.",
    steps: [
      "Choose the outcome for each activity and name its source.",
      "Save; the next open activity opens.",
    ],
    saves: "Each entry is stored with this cycle, with who recorded it and when.",
    notDone:
      "These records send nothing and accept nothing for the tenant. Marking Done is your report, not a receipt.",
  },
  "staff-work-documents": {
    label: "Work recorded by staff: documents",
    purpose:
      "Records document preparation, delivery, returned signed artifacts and the applicable follow-ups done outside the app.",
    steps: [
      "Choose the outcome for each activity; use Not applicable only with the approved rule that permits it.",
      "Name the document or record that supports the entry and save.",
      "Record staff completion when the applicable checklist is done.",
    ],
    saves:
      "Each entry and the completion record are stored with this cycle, with who recorded them and when.",
    notDone:
      "A recorded signature or completion is staff evidence. It does not prove a signature in Dotloop or change any file bytes.",
  },
  "owner-response": {
    label: "Owner response and exact terms",
    purpose:
      "Records what the owner actually answered and, when approved, the exact monthly base rent, effective date and term end date.",
    steps: [
      "Choose the response the owner gave.",
      "For an approval, enter the exact rent and dates the owner approved.",
      "Name the response source or channel and save.",
    ],
    saves:
      "The response and terms are stored with this cycle. Approved terms supply the tenant message, the future RentVine rent and the document packet.",
    notDone:
      "Saving approves nothing on the owner's behalf and writes nothing to RentVine or the Sheet. Changed terms reopen later work for review.",
  },
  "tenant-response": {
    label: "Tenant response",
    purpose:
      "Records what the tenant actually answered: accepted, asked for changes, declined or still needs verification.",
    steps: [
      "Choose the response the tenant gave.",
      "Name the response source or channel and save.",
    ],
    saves:
      "The response is stored with this cycle and decides whether documents or the non-renewal handoff come next.",
    notDone:
      "Saving accepts nothing for the tenant and sends nothing. A recorded response is staff evidence.",
  },
  "message-preparation-owner": {
    label: "Owner message preparation",
    purpose:
      "Builds the owner email from the lease facts, the saved comparison and your signature. Review the inputs, save your edits, then copy the message or create an unsent Gmail draft.",
    steps: [
      "Check the listed inputs; resolve each item under inputs remain for final use.",
      "Edit the optional response request wording if needed and save the reviewed preparation.",
      "Copy the subject and body, or preview and confirm an unsent Gmail draft, then send it yourself.",
    ],
    saves:
      "Your edits and review are stored with this cycle. A confirmed Gmail draft is created unsent in the signed-in managed mailbox.",
    notDone:
      "The app never sends. Copying or drafting records no delivery, and attachments are separate files you add yourself.",
  },
  "message-preparation-tenant": {
    label: "Tenant message preparation",
    purpose:
      "Builds the tenant offer from the approved terms, applicable charges, insurance wording and resource links. Review the inputs, save your edits, then copy the message or create an unsent Gmail draft.",
    steps: [
      "Review lease origin and applicable charges; resolve each item under inputs remain for final use.",
      "Edit the optional response request wording if needed and save the reviewed preparation.",
      "Copy the formatted or plain text, or preview and confirm an unsent Gmail draft, then send it yourself in the chosen channel.",
    ],
    saves:
      "Your edits and review are stored with this cycle. A confirmed Gmail draft is created unsent in the signed-in managed mailbox.",
    notDone:
      "The app never sends. The plain text also serves portal or text work; copying records no delivery.",
  },
  "renewal-notice-draft": {
    label: "Renewal-notice draft",
    purpose:
      "Composes the tenant renewal notice from this lease's live RentVine record and the recorded owner decision, ending in an unsent Gmail draft.",
    steps: [
      "Review the offer facts and the recipients the app resolved.",
      "Preview the exact draft and confirm it once.",
      "Open Gmail and send it yourself.",
    ],
    saves:
      "The confirmed draft is created unsent in the signed-in managed mailbox and its receipt is stored with this lease.",
    notDone:
      "Nothing is sent by the app. A draft receipt is not delivery or a tenant response.",
  },
  "document-preparation": {
    label: "Document preparation",
    purpose:
      "Brings together the packet truth, the provider handoff and the existing build-out checks for this lease's documents.",
    steps: [
      "Evaluate the packet to see which approved forms apply and what is still missing.",
      "Resolve open check items and missing resource links.",
      "Use the handoff to prepare the packet, then record documents and signatures as staff work.",
    ],
    saves:
      "Packet evaluations, confirmed provider actions and staff records are stored separately with this lease.",
    notDone:
      "Clear build-out checks do not make the packet ready; the packet truth governs. No form is created or signed here.",
  },
  "packet-truth": {
    label: "Document packet truth",
    purpose:
      "Evaluates which approved document families this lease needs and whether each has an approved publication and mapping.",
    steps: [
      "Choose Evaluate packet to check current sources.",
      "Read the next action, the blockers and the included or excluded artifacts.",
    ],
    saves:
      "The evaluation snapshot is stored with this lease for review and for the handoff.",
    notDone:
      "Evaluation is local preparation only; it contacts no provider and creates no document. A pending location box provides no legal content.",
  },
  "document-handoff": {
    label: "Document preparation and signature handoff",
    purpose:
      "Prepares the approved packet for Dotloop and lets an Admin confirm each supported provider action; signatures are collected outside the app.",
    steps: [
      "Reload readiness and resolve the listed blockers.",
      "Preview the exact packet action, enter the Admin approval reason and confirm it once.",
      "Review and complete form fields in Dotloop, then a person sends for signature.",
    ],
    saves:
      "Confirmed provider actions and their receipts are stored with this lease. Uploaded files are the exact approved publications; mapped fields shown here do not edit those files.",
    notDone:
      "Returned signed artifacts and staff-recorded completion are separate from provider document-presence receipts. No signature happens in the app.",
  },
  "resource-links": {
    label: "Renewal resource links",
    purpose:
      "Holds the shared informational and legal-form locations the tenant message and packet use: flyers, the information form and the approved form locations.",
    saves:
      "An Admin saves each checked HTTPS location once; the lease reads the current shared value.",
    notDone:
      "A blank box is pending team input, not an error. A saved location is not approved legal content, a mapping or a signature.",
  },
  "notice-timing": {
    label: "Notice timing",
    purpose:
      "Shows the notice dates the app derived from the lease and its sources, with the provenance of each line.",
    saves: "Nothing is saved here; it is a read-only view.",
    notDone:
      "A Needs Verification line means a source did not confirm the date. The app sets no reminder or deadline from it.",
  },
  "staff-completion": {
    label: "Staff completion",
    purpose:
      "Records that staff finished the applicable checklist for this cycle, or reopens a recorded completion when work resumes.",
    saves:
      "The completion or reopening is stored with this cycle, with who recorded it and when.",
    notDone:
      "Staff completion does not establish verified completion in RentVine, Gmail or Dotloop and cannot be recorded until the applicable checklist and outcome branch are done.",
  },
  "completion-checks": {
    label: "Completion checks",
    purpose:
      "Shows whether provider-verified document completion exists for this lease, separately from staff-recorded completion.",
    saves: "Nothing is saved here; it reports existing evidence.",
    notDone:
      "A staff completion marker is not authenticated document execution proof and cannot unlock an owner acknowledgment. Provider completion comes only from provider readback for the exact packet.",
  },
};
