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
    id: "approval-queue",
    term: "Approval Queue",
    definition:
      "The list of items waiting for an Approver or Admin decision. Each item shows what it asks for, and your Approve or Deny decision is recorded with it.",
    relatedGuides: ["approve-or-deny"],
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
    id: "receipt",
    term: "Receipt",
    definition:
      "The record the app keeps when a confirmed change applies: what changed, who confirmed it and when. Update status by destination lists what applied with a receipt.",
    relatedGuides: ["update-sources"],
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
    id: "unsent-draft",
    term: "Unsent draft",
    definition:
      "Message text the app prepares for you to review. Nothing is sent until you choose Send or Schedule in Communications; you can also copy it and send it yourself.",
    relatedGuides: ["owner-message", "tenant-offer"],
  },
  {
    id: "working-renewal-terms",
    term: "Working renewal terms",
    definition:
      "The renewal rent and dates you are working with for one lease. Messages and update previews read them, and they change only when you edit them.",
    relatedGuides: ["compare-rent", "owner-message"],
  },
  {
    id: "working-value",
    term: "Working value",
    definition:
      "A value you enter in the app for one lease, such as the current rent you confirmed on a call. It is saved in the app beside the RentVine and Sheet values, and it changes neither until you confirm an exact update.",
    relatedGuides: ["update-sources"],
  },
];
