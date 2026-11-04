import type { HelpGuide } from "@/lib/help/types";

const WORKSPACE = "/lease-renewal/live/desk/lease/[leaseId]";
const COMMUNICATIONS = "/gmail-hub";
const FULL_VIEW = ["click-button:Full view"] as const;

export const COMMUNICATIONS_GUIDES: readonly HelpGuide[] = [
  {
    id: "owner-message",
    section: "communications",
    title: "Prepare, send or schedule an owner message and record the answer",
    audience: "Renewal staff",
    purpose:
      "Prepare the owner renewal message from the lease, send or schedule the message yourself through Communications or your own channel, follow what happened to the message, and record the owner's actual answer, with who approved, how and when for an approval.",
    prerequisites: [
      "You are signed in with edit access to Renewals.",
      "The lease is open in the lease workspace from the renewal desk.",
      "The market comparison and the Working renewal terms are saved, or you know which values the message still marks.",
    ],
    steps: [
      {
        id: "open-owner-approval",
        action:
          "Open the lease from the renewal desk, choose Full view, then choose Owner approval in the section links.",
        control: {
          label: "Owner approval",
          role: "link",
          region: "navigation:Renewal dashboard sections",
          availability: "required",
          source: ["lib/lease-renewal/dashboard-sections.ts"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Lease workspace, Full view, section links under the view switch",
        result:
          "The page moves to the Owner approval section: Owner message preparation, then Work recorded by staff with Owner outreach, Owner response and Working renewal terms.",
        effect: "reads",
        note: "About Owner approval, beside the section heading, gives the order of the work: prepare the message, get the owner's actual answer, then record that answer.",
      },
      {
        id: "read-owner-decision",
        action:
          "Open Prior owner decision and provider evidence to read the owner email facts and their sources before you write to the owner.",
        control: {
          label: "Prior owner decision and provider evidence",
          role: "summary",
          region: "region:Owner approval",
          availability: "required",
          source: ["components/lease-renewal/RenewalWorkspace.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Owner approval, at the end of the section",
        result:
          "Property, Current rent and the comparison facts show with their sources, followed by an owner email subject and body built from them. Current rent proposals are chosen under Recommendation and working offer in Market rent comparison, not here.",
        effect: "reads",
        note: "Use these facts to check the owner message, and correct a wrong fact in Lease details before you send the message.",
      },
      {
        id: "prepare-owner-message",
        scene: "owner-message-preparation",
        action:
          "Review the owner message under Owner message preparation, with About Owner message preparation for how the message is built: edit the Subject and Email body where needed, and resolve each entry under Marked values.",
        control: {
          label: "About Owner message preparation",
          role: "button",
          region: "region:Owner message preparation",
          availability: "required",
          source: ["lib/lease-renewal/section-help.ts"],
          aboutId: "message-preparation-owner",
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Owner approval, Owner message preparation",
        result:
          "The subject and body show the message built from the lease facts, the saved market comparison and your sender signature, and your edits save by themselves. Each value still missing reads Needs Verification in the message and is listed under Marked values with a link to the control that fills it.",
        effect: "saves-in-app",
        note: "Formatted preview shows the body with its formatting. The Managed sender signature fields hold your signature, which is shared across leases for your managed mailbox.",
      },
      {
        id: "copy-owner-message",
        action:
          "To send the message yourself, choose Copy subject and Copy formatted body or Copy plain text, then Copy recipients, and paste them into your own email.",
        control: {
          label: "Copy formatted body",
          role: "button",
          region: "region:Owner message preparation",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalMessagePreparation.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Owner message preparation, Copy the message",
        result:
          "The clipboard holds the subject, body or recipients exactly as shown, including any Needs Verification marker. Copy recipients stays unavailable until the owner email address is verified.",
        effect: "copies",
        note: "Copying records no delivery. After you send the message from your own email, record the outreach under Work recorded by staff.",
      },
      {
        id: "create-unsent-gmail-draft",
        action:
          "To send from Gmail, choose Preview unsent Gmail draft, check the sender, recipients and wording, choose Review creation confirmation, then Create this unsent draft.",
        control: {
          label: "Preview unsent Gmail draft",
          role: "button",
          region: "region:Owner message preparation",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalMessagePreparation.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Owner message preparation, Unsent Gmail draft",
        result:
          "An unsent draft with the exact recipients and wording waits in the Drafts folder of your managed Gmail mailbox, and Open the Drafts folder to find this draft opens it. Nothing is sent.",
        effect: "unsent-draft",
        note: "Review the draft in Gmail, then send the draft from Gmail yourself. While the message template is not approved the button is unavailable, and the card says why.",
      },
      {
        id: "save-communications-draft",
        action:
          "To send or schedule through Communications, choose Compose owner message in Communications, review the sender, recipients, message and files in the new tab, then choose Save draft.",
        control: {
          label: "Save draft",
          role: "button",
          region: "region:Workflow communication composer",
          availability: "conditional",
          source: ["components/gmail-hub/CommunicationComposer.tsx"],
        },
        route: COMMUNICATIONS,
        where: "Communications, workflow communication composer opened from the lease",
        result:
          "The status line reads Saved and the communication reads Draft in app. Your wording also saves by itself a moment after each edit.",
        effect: "saves-in-app",
        note: "Responsible sender names the managed mailbox the message goes out from, and To lists the current verified recipients. Add PDF or image (5 MiB combined) attaches a file, and Add follow-up message adds a separate reviewed follow-up.",
      },
      {
        id: "send-or-schedule",
        scene: "owner-composer",
        action:
          "Choose Send to send the reviewed message now, or choose Schedule, set First date, Local time and Timezone, and choose Schedule messages.",
        control: {
          label: "Send",
          role: "button",
          region: "region:Workflow communication composer",
          availability: "conditional",
          source: ["components/gmail-hub/CommunicationComposer.tsx"],
        },
        route: COMMUNICATIONS,
        where: "Communications, workflow communication composer, below the message",
        result:
          "After Send the reviewed message goes out from the responsible sender's mailbox, and the communication reads Sent once Gmail accepts the message, or Needs verification when the outcome is unclear. Before you choose Schedule messages, First send states the exact first time and time zone, and the communication then reads Scheduled.",
        effect: "explicit-send",
        note: "Send and Schedule stay unavailable until the subject and message are complete, the recipients are verified and every file is checked, and only the responsible sender can choose them. A reply or a failed delivery pauses the follow-ups.",
      },
      {
        id: "record-owner-outreach",
        action:
          "After the message goes out, or after you reach the owner another way, choose the Owner outreach outcome under Work recorded by staff.",
        control: {
          label: "Owner outreach outcome",
          role: "label",
          region: "region:Owner approval",
          availability: "conditional",
          source: [
            "components/lease-renewal/RenewalManualWorkspace.tsx",
            "lib/lease-renewal/workspace-state.ts",
          ],
          sourceText: "${definition.label} outcome",
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Owner approval, Work recorded by staff, Owner outreach",
        result:
          "The outcome saves at once with who recorded it and when. Source or channel (optional), Comment (optional) and When the work happened (optional) save when you leave each box.",
        effect: "saves-in-app",
        note: "Choose Waiting while you wait on the owner, or Done: recorded by staff once the outreach happened. Owner outreach opens by itself when it is the next item; open it yourself otherwise.",
      },
      {
        id: "check-message-status",
        action:
          "Open the communication in Communications and choose Check recorded status to see what happened to each message and whether a reply arrived.",
        control: {
          label: "Check recorded status",
          role: "button",
          region: "region:Workflow communication composer",
          availability: "conditional",
          source: ["components/gmail-hub/CommunicationComposer.tsx"],
        },
        route: COMMUNICATIONS,
        where: "Communications, Outgoing or Scheduled view, Open communication",
        result:
          "What happened to each message lists every attempt as Accepted by Gmail, Failed delivery, Not confirmed, checking or Not sent, and each incoming message as Reply received or Automatic response. Linked history lists each confirmed send; Read linked thread shows the conversation, and Reply in Communications starts a reply from it.",
        effect: "reads",
        note: "Accepted by Gmail means Gmail took the message; Gmail shows neither delivery nor reading. Refresh linked incoming checks the linked threads for new replies.",
      },
      {
        id: "watch-follow-up",
        action:
          "While you wait for the owner, read who the renewal is waiting on in Waiting and follow-up, with About Waiting and follow-up for what the card records, and link the Gmail thread you are watching when it is missing.",
        control: {
          label: "About Waiting and follow-up",
          role: "button",
          region: "region:Tenant offer and response",
          availability: "conditional",
          source: ["lib/lease-renewal/section-help.ts"],
          aboutId: "waiting-follow-up",
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Tenant offer and response, Waiting and follow-up card",
        result:
          "The card shows who the renewal is waiting on, the last verified contact and when follow-up is due. A linked thread or a dismissed due item is stored with this lease for staff.",
        effect: "saves-in-app",
        note: "Link or refresh exact Gmail evidence holds Exact Gmail thread ID, Reason for linking and Link exact thread. Linking or refreshing reads the thread only, and follow-up timing sets no reminder.",
      },
      {
        id: "resume-reviewed-sequence",
        action:
          "When a reply or a failed delivery pauses the follow-ups, read the linked conversation, review the message again, then choose Resume reviewed sequence if the follow-ups still apply.",
        control: {
          label: "Resume reviewed sequence",
          role: "button",
          region: "region:Workflow communication composer",
          availability: "conditional",
          source: ["components/gmail-hub/CommunicationComposer.tsx"],
        },
        route: COMMUNICATIONS,
        where: "Communications, Incoming view, Open communication",
        result:
          "The paused communication says why it paused, such as A reply was received or Failed delivery reported. After a fresh review, Resume reviewed sequence restarts the reviewed follow-ups on their schedule.",
        effect: "explicit-send",
        note: "When the reply is the owner's answer, record it under Owner response instead of resuming. Resume needs a fresh review of the current message and recipients.",
      },
      {
        id: "record-owner-answer",
        action:
          "When the owner answers, choose the answer in Owner response; for Approved, fill Who approved, How they approved and When they approved, then choose Record approval.",
        control: {
          label: "Owner response",
          role: "label",
          region: "region:Owner approval",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalManualWorkspace.tsx"],
          actions: FULL_VIEW,
        },
        route: WORKSPACE,
        where: "Owner approval, Work recorded by staff, Owner response",
        result:
          "No response, Revision requested and Declined / non-renewal save when you choose them. Approved saves only through Record approval, and the recorded approval then reads who approved, how and when, with a line naming the Working terms it covers.",
        effect: "saves-in-app",
        note: "How they approved offers Reply in this lease's renewal thread when a linked reply exists, Another written channel or Conversation. If the Working terms or charges change later, the line reads Owner approval no longer covers and names what changed; ask the owner again, then choose Record a new approval. Revision requested also asks What the owner asked to change.",
      },
    ],
    result:
      "The owner message is sent or scheduled by your own Send, Schedule or channel, the outreach is recorded under Work recorded by staff, and the owner's actual answer is recorded under Owner response, with who approved, how and when for an approval.",
    doesNotDo: [
      "The app sends nothing on its own, and Gmail shows neither delivery nor reading; Accepted by Gmail means only that Gmail took the message.",
      "Copying the message, saving a draft or creating an unsent Gmail draft sends nothing and records no delivery.",
      "Recording an owner response approves nothing on the owner's behalf and writes nothing to RentVine or the Sheet.",
      "A recorded approval covers only the Working terms and charges it names; after they change, the owner's approval needs recording again.",
      "Follow-up timing sets no reminder or deadline, and paused follow-ups send nothing until a fresh review and Resume reviewed sequence.",
    ],
    relatedGuides: ["compare-rent", "tenant-offer", "work-a-renewal"],
    relatedScreens: ["communications"],
    lastUpdated: "2026-11-04",
    navItems: ["communications"],
  },
];
