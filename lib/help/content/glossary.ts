import type { HelpGlossaryTerm } from "@/lib/help/types";

// S243 R-S243-3: the terms a new staff member meets, in alphabetical order. Each definition says
// what the term means on the screen today; related guides open where the term is used.
export const HELP_GLOSSARY: readonly HelpGlossaryTerm[] = [
  {
    id: "about-panel",
    term: "About panel",
    definition:
      "The help panel behind an About button on a renewal section. It says what the section is for, the steps, what it saves and what it does not do, and links to the guide step that covers it.",
    relatedGuides: ["work-a-renewal"],
  },
  {
    id: "active-version",
    term: "Active version",
    definition:
      "The validated, immutable version a published process definition runs on. A new run of an Active process records it as its Definition version; a run started from a Draft definition reads Not pinned (draft).",
    relatedGuides: ["publish-a-process"],
  },
  {
    id: "admitted-source-read",
    term: "Admitted source read",
    definition:
      "A read of RentVine or the operating Sheet that the app starts for a desk or workspace and accepts as current. Panels that depend on it say when their source could not be read. A source read never changes RentVine or the Sheet.",
    relatedGuides: ["work-a-renewal", "update-sources"],
  },
  {
    id: "amount-approved",
    term: "Amount approved",
    definition:
      "The monthly base rent the owner approved, entered exactly as the owner gave it when you record the owner's answer. Once saved it is the offer amount for this renewal; the staff recommendation stays as it was.",
    relatedGuides: ["owner-message", "work-a-renewal"],
  },
  {
    id: "approval-queue",
    term: "Approval Queue",
    definition:
      "The list of items waiting for an Approver or Admin decision. Each item shows what it asks for, and your Approve or Deny decision is recorded with it.",
    relatedGuides: ["approve-or-deny"],
  },
  {
    id: "current-base-rent",
    term: "Current base rent",
    definition:
      "The lease's monthly base rent today, with where it comes from: your working current rent, the one RentVine rent charge or the contractual lease rent. A separate recurring charge such as pet rent is named apart and never added to it.",
    relatedGuides: ["work-a-renewal", "update-sources"],
  },
  {
    id: "exact-confirmation",
    term: "Exact confirmation",
    definition:
      "Your final confirm on a preview that shows one exact change, such as the before and after values of a RentVine or Sheet update or one Dotloop packet action. The change happens only after it, and only once.",
    relatedGuides: ["update-sources", "prepare-documents"],
  },
  {
    id: "family-use",
    term: "Family use",
    definition:
      "The Admin setting that records how each form family is used in a renewal packet. Renewal packets read it when staff prepare documents, and Form families for this lease shows each family's use.",
    relatedGuides: ["prepare-documents", "admin-tasks"],
  },
  {
    id: "guided-view",
    term: "Guided view",
    definition:
      "The view a lease opens in: the stage line, the Renewal path with every step of this lease and one Now card with the next action. Guided and Full show the same lease; choosing a view or a step saves nothing.",
    relatedGuides: ["work-a-renewal"],
  },
  {
    id: "housing-assistance",
    term: "Housing assistance",
    definition:
      "The lease fact, set on Check the numbers, that a housing program pays part of the rent. With it set to Yes, the path contacts the named program and asks the owner whether to renew before any rent decision.",
    relatedGuides: ["work-a-renewal"],
  },
  {
    id: "now-card",
    term: "Now card",
    definition:
      "The card in Guided view that holds the step you are working. It leads with the one field or fix the step needs now, such as Review owner message, and shows the step's own controls in place, with optional work and the Verification group below.",
    relatedGuides: ["work-a-renewal", "owner-message"],
  },
  {
    id: "offer-charge-mapping",
    term: "Offer charge mapping",
    definition:
      "An Admin's record of what one RentVine account means in a tenant offer: its verified label, offer family, cadence and when it applies, with who approved that meaning. It gives meaning only; each lease's amounts and whether a charge applies are decided in Review offer charges.",
    relatedGuides: ["tenant-offer", "admin-tasks"],
  },
  {
    id: "operating-sheet",
    term: "Operating Sheet",
    definition:
      "The team's renewal spreadsheet in Google Sheets. The desk reads it, and a Sheet update changes it only after your exact confirmation.",
    relatedGuides: ["update-sources"],
  },
  {
    id: "packet-context",
    term: "Packet context",
    definition:
      "The audience a document packet is prepared for, tenant or owner. Each packet context keeps its own documents and instructions, so an owner acknowledgment never mixes with tenant signature instructions.",
    relatedGuides: ["prepare-documents"],
  },
  {
    id: "readback",
    term: "Readback",
    definition:
      "A fresh read of RentVine, the Sheet or Dotloop after a confirmed change that shows whether the change landed. The effect status shows its result.",
    relatedGuides: ["update-sources"],
  },
  {
    id: "ready-for-your-review",
    term: "Ready for your review",
    definition:
      "Leases with a prepared comparison and owner message, so the owner step offers Review owner message and its confirmation.",
    relatedGuides: ["work-a-renewal"],
  },
  {
    id: "receipt",
    term: "Receipt",
    definition:
      "The record the app keeps when a confirmed change applies: what changed, who confirmed it and when. Update status by destination lists what applied with a receipt.",
    relatedGuides: ["update-sources"],
  },
  {
    id: "renewal-path",
    term: "Renewal path",
    definition:
      "The strip of steps in Guided view, from Check the numbers to Complete, each marked Done, Now, Open, Waiting or Covered. Any step can be chosen and worked at any time.",
    relatedGuides: ["work-a-renewal"],
  },
  {
    id: "rent-to-recommend",
    term: "Rent to recommend",
    definition:
      "The renewal rent staff recommend to the owner, set on Compare market rent with its basis in words. It is a staff recommendation: the owner's answer is recorded separately and never replaces it. Until a saved owner's answer sets the amount approved, the offer uses the same amount.",
    relatedGuides: ["compare-rent", "train-and-review"],
  },
  {
    id: "retained-history",
    term: "Retained history",
    definition:
      "Maintenance records the app keeps for reading only. Maintenance work itself happens in Vendoroo; nothing in the retained history creates or changes a work order.",
  },
  {
    id: "reviewed-revision",
    term: "Reviewed revision",
    definition:
      "The saved revision of a process definition you loaded and reviewed. Save and Publish name that revision, so when someone saved a newer one first, the app refuses instead of overwriting it.",
    relatedGuides: ["publish-a-process"],
  },
  {
    id: "space",
    term: "Space",
    definition:
      "A work area of the app for one kind of work, such as lease renewals or a process. Internal Processes, in the Operations menu, lists every Space with a card.",
    relatedGuides: ["find-your-way"],
  },
  {
    id: "standing-agreement",
    term: "Standing agreement",
    definition:
      "An owner's recorded rule for renewal rent, applied to this lease or every lease in the owner's portfolio. A lease it covers needs no owner message, and its rent to recommend is the rule applied to the current rent.",
    relatedGuides: ["work-a-renewal"],
  },
  {
    id: "tenant-audience-check",
    term: "Tenant audience check",
    definition:
      "An Admin's record, in Connections, that tenants can open a shared flyer or the renewal information form: who can open it, how and when it was checked, what opened and how long the check stays valid. Only a resource verified for tenants reaches a tenant offer.",
    relatedGuides: ["manage-connections", "tenant-offer"],
  },
  {
    id: "unsent-draft",
    term: "Unsent draft",
    definition:
      "Message text the app prepares for you to review. Nothing is sent until you choose Send or Schedule in Communications; you can also copy it and send it yourself.",
    relatedGuides: ["owner-message", "tenant-offer"],
  },
  {
    id: "verification-group",
    term: "Verification group",
    definition:
      "The read-only evidence for one step, such as Verify lease numbers, closed when you arrive and opened when you want to see where a value comes from. Guided and Full view show the same group under the same name.",
    relatedGuides: ["work-a-renewal", "train-and-review"],
  },
  {
    id: "work-status",
    term: "Work status",
    definition:
      "The lease's one staff status and note history, opened from the lease header. A note saves with your name and time; it does not assign the lease, record an approval or mark a message delivered.",
    relatedGuides: ["train-and-review", "work-a-renewal"],
  },
  {
    id: "working-batch",
    term: "Working batch",
    definition:
      "The desk's monthly table. The selected month's targets appear first and unfinished earlier leases follow. The counts filter this same table.",
    relatedGuides: ["work-a-renewal"],
  },
  {
    id: "working-renewal-terms",
    term: "Working renewal terms",
    definition:
      "The renewal base rent and dates you are working with for one lease. Messages and update previews read them. The base rent follows Rent to recommend until a saved owner's answer sets the amount approved, and the dates are entered in Working renewal terms.",
    relatedGuides: ["compare-rent", "owner-message"],
  },
  {
    id: "working-value",
    term: "Working value",
    definition:
      "A value you enter in the app for one lease, such as the current base rent you confirmed on a call. It is saved in the app beside the RentVine and Sheet values, and it changes neither until you confirm an exact update.",
    relatedGuides: ["update-sources"],
  },
];
