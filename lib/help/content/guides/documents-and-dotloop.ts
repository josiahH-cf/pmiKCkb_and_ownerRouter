import type { HelpGuide } from "@/lib/help/types";

const WORKSPACE = "/lease-renewal/live/desk/lease/[leaseId]";
const FULL_VIEW = ["click-button:Full view"] as const;
const HANDOFF = "region:Document preparation and signature handoff";

export const DOCUMENTS_AND_DOTLOOP_GUIDES: readonly HelpGuide[] = [
  {
    id: "prepare-documents",
    section: "documents-and-dotloop",
    title: "Prepare documents and hand off to Dotloop",
    audience: "Renewal staff",
    purpose:
      "Check which renewal forms this lease needs, save the packet inputs and evaluate the packet, read the Dotloop handoff readiness, prepare the documents and send them for signature from Dotloop, and record the documents, signatures and completion as staff work.",
    prerequisites: [
      "You are signed in with edit access to Renewals.",
      "The owner's approval of the current Working renewal terms is recorded under Owner response.",
      "The tenant's response is recorded and calls for renewal documents.",
    ],
    steps: [
      {
        id: "open-documents",
        action: "In Full view, choose Documents and completion in the section links.",
        control: {
          label: "Documents and completion",
          role: "link",
          region: "navigation:Renewal dashboard sections",
          availability: "required",
          source: ["lib/lease-renewal/dashboard-sections.ts"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Lease workspace, Full view, section links under the view switch",
        result:
          "The page moves to Documents and completion: Work recorded by staff, Renewal resource links, Document preparation, Notice timing and Completion checks.",
        effect: "reads",
        note: "About Documents and completion, beside the section heading, gives the order: confirm the resource links and packet truth, prepare or hand off the packet, then record documents, signatures and completion as staff work.",
      },
      {
        id: "read-document-preparation",
        action:
          "Open About Document preparation for what the card brings together, then read the card from the top: Document packet truth, Form families for this lease, Document preparation and signature handoff, then Returned documents and signatures.",
        control: {
          label: "About Document preparation",
          role: "button",
          region: "region:Documents and completion",
          availability: "required",
          source: ["lib/lease-renewal/section-help.ts"],
          aboutId: "document-preparation",
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Documents and completion, Document preparation",
        result:
          "The card brings together the packet truth, the Dotloop handoff and the existing build-out checks, and its last lines say whether the build-out checks are clear or how many items remain. Clear build-out checks alone do not make the packet ready; the packet truth decides.",
        effect: "reads",
      },
      {
        id: "check-resource-links",
        action:
          "Check Renewal resource links, with About Renewal resource links for what the entries mean: each shared flyer, information form and approved form location reads Checked by staff, Pending team input or Destination needs review.",
        control: {
          label: "About Renewal resource links",
          role: "button",
          region: "region:Renewal resource links",
          availability: "required",
          source: ["lib/lease-renewal/section-help.ts"],
          aboutId: "resource-links",
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Documents and completion, Renewal resource links",
        result:
          "Only staff-verified entries are usable, and a checked entry offers Open checked destination. A blank entry reads Pending team input; it is waiting for the team, not an error.",
        effect: "reads",
        note: "An Admin sees Manage shared resource links in Connections and Manage beside each entry. Other staff see View setting and ask an Admin to change a link.",
      },
      {
        id: "enter-packet-inputs",
        action:
          "Choose Open packet inputs and save each lease fact, person and signer role, animal and charge the packet needs.",
        control: {
          label: "Open packet inputs",
          role: "button",
          region: "region:Documents and completion",
          availability: "required",
          source: ["components/lease-renewal/PacketInputsEditor.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Document preparation, Document packet truth, Packet inputs",
        result:
          "Packet inputs opens with Lease facts, People and signer roles, Animals and Charges, each saved with its own Save button. The packet, filled files and the Dotloop handoff use the saved values.",
        effect: "saves-in-app",
        note: "Use the RentVine value takes the source value for a fact; a different value needs Why this corrects the RentVine value. The top line says whether the owner's recorded approval covers the current Working terms and charges.",
      },
      {
        id: "evaluate-packet",
        action:
          "Choose Evaluate packet to check the current sources and record a packet snapshot.",
        control: {
          label: "Evaluate packet",
          role: "button",
          region: "region:Documents and completion",
          availability: "conditional",
          source: ["components/lease-renewal/PacketTruthPanel.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Document preparation, Document packet truth",
        result:
          "The State line, the Next action, any Blockers, and the Included artifacts and Excluded / undecided artifacts show for the new snapshot, which is stored with this lease for review and for the handoff.",
        effect: "saves-in-app",
        note: "After the first evaluation the button reads Evaluate current truth. Evaluating contacts no provider and creates no document. Manage location beside each form opens its shared location in Connections.",
      },
      {
        id: "read-form-families",
        action:
          "Read Form families for this lease to see each form family's use, whether the family applies, its approved original and map, and what is missing.",
        control: {
          label: "Form families for this lease",
          role: "region",
          region: "region:Documents and completion",
          availability: "required",
          source: ["components/lease-renewal/LeasePacketReadiness.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Document preparation, below Document packet truth",
        result:
          "The table lists every family with Use, Applies, Original and map, and Missing. A family without an approved original reads No approved original received, one without a reviewed map reads No reviewed field and signer map, and Missing names who supplies each piece.",
        effect: "reads",
        note: "The table is read-only: Evaluate packet records a snapshot, and nothing here writes one or sends anything. Dotloop selection, below the table, compares the saved Dotloop selection with its latest observation.",
      },
      {
        id: "reload-readiness",
        scene: "document-handoff",
        action:
          "Under Document preparation and signature handoff, check Current facts for this packet, then choose Reload document readiness and attempts.",
        control: {
          label: "Reload document readiness and attempts",
          role: "button",
          region: HANDOFF,
          availability: "required",
          source: ["components/lease-renewal/RenewalDocumentHandoff.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Document preparation, Document preparation and signature handoff",
        result:
          "The Dotloop line, any blockers, and the Loop creation readiness and Document upload readiness rows read again from current sources. Each readiness row lists App capability, Content and approval, Connection and selected resource, Target and Exact action authority.",
        effect: "reads",
        note: "Current facts for this packet lists Property, Owners, Tenants, Current lease end, Approved terms and Source updates, each with the link that corrects that fact. Review Dotloop connection and selection opens Connections.",
      },
      {
        id: "preview-packet-creation",
        action:
          "When the Loop creation readiness row allows it, choose Preview exact Dotloop packet creation, enter a Confirmation reason, choose Review packet confirmation and confirm the exact packet action once.",
        control: {
          label: "Preview exact Dotloop packet creation",
          role: "button",
          region: HANDOFF,
          availability: "conditional",
          source: ["components/lease-renewal/RenewalDocumentHandoff.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Document preparation and signature handoff, Dotloop loop for this lease",
        result:
          "Both Dotloop write actions, loop creation and document upload, are closed. Exact action authority in Loop creation readiness and Document upload readiness reads Exact-key activation remains a separate authority hold, Loop creation needs says the loop creation action is not currently executable, and Preview exact Dotloop packet creation stays unavailable, so the packet preview stops before anything is created in Dotloop.",
        effect: "exact-confirmation",
        note: "A renewal staff member with edit access confirms a supported packet action through its exact preview with a Confirmation reason; no Admin approval is involved. While both actions are closed, create the loop and prepare the documents in Dotloop by hand, then link the loop with Review existing loop. Signing happens in Dotloop by hand: a person sends for signature from Dotloop.",
      },
      {
        id: "link-existing-loop",
        action:
          "Type the loop number or address in Existing Dotloop loop number or address, choose Review existing loop, then enter Why this loop belongs to this lease and choose Link this loop to the lease.",
        control: {
          label: "Review existing loop",
          role: "button",
          region: HANDOFF,
          availability: "conditional",
          source: ["components/lease-renewal/RenewalDocumentHandoff.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Document preparation and signature handoff, Dotloop loop for this lease",
        result:
          "Existing loop review shows the loop's name, status and participants, read through the company connection. After Link this loop to the lease, the status line reads Loop linked to this lease, and nothing changes in Dotloop.",
        effect: "saves-in-app",
        note: "A matching name or address is a hint only; confirm it is the loop for this lease. An archived loop or one recorded for a different lease cannot be linked. Refresh from Dotloop then reads the linked loop again.",
      },
      {
        id: "record-documents-and-signatures",
        action:
          "Record the document work done in Dotloop or outside the app under Work recorded by staff, with About Work recorded by staff: documents for what each record means, and each signer's result under Returned documents and signatures when that panel lists the packet documents.",
        control: {
          label: "About Work recorded by staff: documents",
          role: "button",
          region: "region:Documents and completion",
          availability: "required",
          source: ["lib/lease-renewal/section-help.ts"],
          aboutId: "staff-work-documents",
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where:
          "Documents and completion, Work recorded by staff, and Document preparation, Returned documents and signatures",
        result:
          "Each outcome saves at once with who recorded it and when, and each returned-document entry reads Recorded by staff, not provider-verified.",
        effect: "saves-in-app",
        note: "Open Required documents prepared, Required documents delivered and Required signatures complete, and choose Waiting or Done: recorded by staff; a follow-up that does not apply takes Not applicable to this lease. Under Returned documents and signatures, staff use Record sent for signature with Sent for signature on and How it was sent, and Record signer result with Signer, Result, When you observed it and Based on. When no current app packet exists, record Required signatures complete with its source under Work recorded by staff.",
      },
      {
        id: "record-staff-completion",
        action: "When the applicable checklist is done, choose Record staff completion.",
        control: {
          label: "Record staff completion",
          role: "button",
          region: "region:Documents and completion",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalManualWorkspace.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Documents and completion, Work recorded by staff, below the follow-ups",
        result:
          "The renewal reads as recorded complete by staff, with who recorded it and when, separately from verified completion in RentVine, Gmail or Dotloop. Reopen recorded completion reopens it when work resumes.",
        effect: "saves-in-app",
        note: "The checklist is guidance: record completion when the renewal is actually complete.",
      },
      {
        id: "read-completion-checks",
        action:
          "Read Completion checks, with About Completion checks, for whether provider-verified document completion exists for this lease.",
        control: {
          label: "About Completion checks",
          role: "button",
          region: "region:Documents and completion",
          availability: "required",
          source: ["lib/lease-renewal/section-help.ts"],
          aboutId: "completion-checks",
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Documents and completion, Completion checks, at the end of the section",
        result:
          "The card reads Provider-verified document completion: not established. Staff completion shows under Work recorded by staff, as staff evidence separate from provider completion.",
        effect: "reads",
      },
    ],
    result:
      "The packet inputs and the packet evaluation are saved with the lease, the documents are prepared and sent for signature from Dotloop by hand, and the documents, signatures and staff completion are recorded as staff work under Documents and completion.",
    doesNotDo: [
      "The app does not sign documents: signing happens in Dotloop by hand, and a person sends for signature from Dotloop.",
      "Nothing is created or uploaded in Dotloop while both write actions, loop creation and document upload, are closed; the readiness rows say so, and the packet preview stops before anything is created.",
      "No Admin approval is involved: a renewal staff member with edit access confirms a supported packet action through its exact preview with a Confirmation reason.",
      "Evaluating the packet, saving packet inputs or linking a reviewed loop changes no file in Dotloop.",
      "A recorded document, signature or completion is staff evidence, not a Dotloop signature or provider-verified completion, and a saved resource location is not approved legal content.",
    ],
    relatedGuides: ["owner-message", "work-a-renewal", "manage-connections"],
    relatedScreens: ["lease-workspace", "connections"],
    lastUpdated: "2026-11-04",
  },
];
