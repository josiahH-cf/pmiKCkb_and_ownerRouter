import type { HelpGuide } from "@/lib/help/types";

const WORKSPACE = "/lease-renewal/live/desk/lease/[leaseId]";
const COMMUNICATIONS = "/gmail-hub";
const FULL_VIEW = ["click-button:Full view"] as const;
const OWNER_OPTIONS = [
  ...FULL_VIEW,
  "open-summary:Owner message options and outreach record",
];
const TENANT_OPTIONS = [
  ...FULL_VIEW,
  "open-summary:Tenant offer options and record of contact",
];
const PREPARED_MESSAGE = ["components/lease-renewal/RenewalPreparedMessage.tsx"];
const KICKOFF = ["lib/lease-renewal/renewal-preparation.ts"];

export const COMMUNICATIONS_GUIDES: readonly HelpGuide[] = [
  {
    id: "owner-message",
    section: "communications",
    title: "Prepare, send or schedule an owner message and record the answer",
    audience: "Renewal staff",
    purpose:
      "Read the owner renewal message the app prepared on the lease's Now card, send or schedule it yourself with Review owner message, a Gmail draft, Communications or your own channel, follow what happened to the message, and record the owner's actual answer: for an approval, the amount the owner approved, what it covers and who approved, how and when.",
    prerequisites: [
      "You are signed in with edit access to Renewals.",
      "The lease is open from the working batch.",
      "The comparison and the rent to recommend are ready, or What sending needs names what is still missing.",
    ],
    steps: [
      {
        id: "open-owner-approval",
        action:
          "Open the lease from the working batch and choose Ask the owner in the Renewal path when the Now card is on another step.",
        control: {
          label: "Ask the owner",
          role: "button",
          region: "navigation:Renewal path",
          availability: "required",
          source: ["lib/lease-renewal/renewal-path.ts"],
        },
        route: WORKSPACE,
        where: "Lease page, Guided view, Renewal path",
        result:
          "The Now card shows the owner message prepared from the saved numbers and the working terms, with What sending needs and the delivery actions. Owner approval shows Current base rent and Rent to recommend, then Owner message preparation with the message, Working renewal terms and Owner message options and outreach record, which holds the delivery options and Work recorded by staff with Owner outreach and Owner response.",
        effect: "reads",
        note: "About Owner approval, beside the Full view section heading, gives the order of the work: prepare the message, get the owner's actual answer, then record that answer. On a lease under a standing agreement, Ask the owner reads Covered by the agreement: no owner message needed.",
      },
      {
        id: "review-and-send-owner-message",
        action:
          "On the Now card, read the message preview, choose Review owner message, read the exact message, recipients and sender, then choose Send this message.",
        control: {
          label: "Send this message",
          role: "button",
          region: "dialog:Review and send",
          availability: "conditional",
          source: PREPARED_MESSAGE,
        },
        route: WORKSPACE,
        where: "Guided view, the Now card on Ask the owner, then Review and send",
        result:
          "Once Gmail accepts the message, the lease reads Waiting on owner response on its page and its desk row with nothing more to enter. A send Gmail has not confirmed reads Check whether the message went out, and a failed delivery reads Delivery failed with Check the address and send again.",
        effect: "explicit-send",
        note: "Review owner message stays the Now card's primary action while the message is ready, and Full view opens the same review from Review and send. When an input is missing, What sending needs names it with its fix, for example Set up your signature.",
      },
      {
        id: "schedule-owner-message",
        action:
          "To send later, choose Schedule and check the required Date and Time (Central) in Review and schedule, then choose Schedule this message.",
        control: {
          label: "Schedule this message",
          role: "button",
          region: "dialog:Review and schedule",
          availability: "conditional",
          source: PREPARED_MESSAGE,
        },
        route: WORKSPACE,
        where: "Guided view, the Now card on Ask the owner, then Review and schedule",
        result:
          "The lease reads Owner message scheduled for its date, and the message counts as the owner outreach only once Gmail accepts it at that time.",
        effect: "explicit-send",
      },
      {
        id: "create-gmail-draft-instead",
        action:
          "To send from Gmail, choose Create Gmail draft instead, read the exact draft and choose Create this unsent draft.",
        control: {
          label: "Create Gmail draft instead",
          role: "button",
          region: "region:Now",
          availability: "conditional",
          source: KICKOFF,
        },
        route: WORKSPACE,
        where: "Guided view, the Now card on Ask the owner",
        result:
          "An unsent draft of this message revision waits in your managed Gmail drafts, and the lease reads Draft waiting in Gmail since its time. After you send it from Gmail, choose I sent it from Gmail to record the outreach as recorded by staff.",
        effect: "unsent-draft",
        note: "When the message changes after the draft was made, the card reads The Gmail draft is older than this message and offers Replace the Gmail draft. The earlier draft stays in Gmail until you delete it there.",
      },
      {
        id: "read-owner-decision",
        action:
          "Open Verify owner terms and outreach, then Prior owner decision and provider evidence, to read the owner email facts and their sources before you write to the owner.",
        control: {
          label: "Prior owner decision and provider evidence",
          role: "summary",
          region: "region:Owner approval",
          availability: "required",
          source: ["components/lease-renewal/RenewalWorkspace.tsx"],
          actions: [...FULL_VIEW, "open-summary:Verify owner terms and outreach"],
        },
        route: WORKSPACE,
        where:
          "Owner approval, Verify owner terms and outreach, at the end of the section",
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
        note: "Formatted preview shows the body with its formatting. The first time you send, set up the signature for your own managed mailbox. Save blank signature is a valid choice. If the message has wording from another sender, check Prior sender wording and rebuild or edit it before sending.",
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
          actions: OWNER_OPTIONS,
        },
        route: WORKSPACE,
        where: "Owner message options and outreach record, Copy the message",
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
          actions: OWNER_OPTIONS,
        },
        route: WORKSPACE,
        where: "Owner message options and outreach record, Unsent Gmail draft",
        result:
          "An unsent draft with the exact recipients and wording waits in the Drafts folder of your managed Gmail mailbox, and Open the Drafts folder to find this draft opens it. Nothing is sent.",
        effect: "unsent-draft",
        note: "Review the draft in Gmail, then send the draft from Gmail yourself. While the message template is not approved the button is unavailable, and the card says why.",
      },
      {
        id: "save-communications-draft",
        action:
          "To send or schedule through Communications, choose Open in Communications on the Now card, or Compose owner message in Communications in Full view, review the sender, recipients, message and files in the new tab, then choose Save draft.",
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
        note: "If the communication could not be read, choose Try again or Close. Responsible sender names the managed mailbox the message goes out from, and To lists the current verified recipients. Add PDF or image (5 MiB combined) attaches a file, and Add follow-up message adds a separate reviewed follow-up.",
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
        note: "Send and Schedule stay unavailable until the subject and message are complete, the recipients are verified and every file is checked, and only the responsible sender can choose them. Schedule messages also needs First date, Local time and Timezone. A reply or a failed delivery pauses the follow-ups.",
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
          actions: OWNER_OPTIONS,
        },
        route: WORKSPACE,
        where:
          "Owner approval, Owner message options and outreach record, Work recorded by staff, Owner outreach",
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
          actions: TENANT_OPTIONS,
        },
        route: WORKSPACE,
        where:
          "Tenant offer and response, Tenant offer options and record of contact, Waiting and follow-up card",
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
          "When the owner answers, choose the answer in Owner response. For Approved, enter Amount approved exactly as the owner gave it, choose What the owner's answer covers, fill Who approved, How they approved and When they approved, choose Review the owner's answer, check the review and choose Save the owner's answer.",
        control: {
          label: "Owner response",
          role: "label",
          region: "region:Owner approval",
          availability: "conditional",
          source: ["components/lease-renewal/RenewalManualWorkspace.tsx"],
          actions: OWNER_OPTIONS,
        },
        route: WORKSPACE,
        where:
          "Owner approval, Owner message options and outreach record, Work recorded by staff, Owner response",
        result:
          "No response, Revision requested and Declined / non-renewal save when you choose them. Approved saves only through Save the owner's answer: the recorded approval then reads who approved, how and when, with a line naming what it covers, Amount approved becomes the offer amount for this renewal, and Continue to Offer the tenant appears.",
        effect: "saves-in-app",
        note: "What the owner's answer covers is Base rent only, or Base rent and the renewal dates once both dates are saved in Working renewal terms; other charges are reviewed with the tenant offer. The review shows Recommended base rent beside Amount approved, with Change the answer to go back. Rent to recommend stays your recommendation and is never replaced by the approved amount. After an owner reply, the Now card on Ask the owner leads with Record the owner's answer: choose the Approved in the reply received option, enter the amount and coverage and Who approved in this reply, then review and save; Asked for a change and Declined / non-renewal use Record this decision. Owner response here covers an authorized representative, another written channel or a conversation. How they approved offers Reply in this lease's renewal thread when a linked reply exists, Another written channel or Conversation. If the amount, the dates or the charges change later, the line reads Owner approval no longer covers and names what changed; ask the owner again, then choose Record a new approval. Revision requested also asks What the owner asked to change.",
      },
    ],
    result:
      "The owner message is sent or scheduled by your own Send this message, Schedule this message, Send, Schedule or channel, the outreach is recorded from the send itself or by you under Work recorded by staff, and the owner's actual answer is recorded under Owner response, with who approved, how and when for an approval.",
    doesNotDo: [
      "The app sends nothing on its own, and Gmail shows neither delivery nor reading; Accepted by Gmail means only that Gmail took the message.",
      "An owner reply records no answer by itself; the answer is recorded only when you choose it.",
      "Copying the message, saving a draft or creating an unsent Gmail draft sends nothing and records no delivery.",
      "Recording an owner response approves nothing on the owner's behalf and writes nothing to RentVine or the Sheet.",
      "A recorded approval covers only what it names, the base rent alone or the base rent and the renewal dates; other charges are reviewed with the tenant offer, and after a covered value changes the owner's approval needs recording again.",
      "Rent to recommend is a staff recommendation, not the owner's approval; saving the owner's answer sets the offer amount to Amount approved.",
      "Follow-up timing sets no reminder or deadline, and paused follow-ups send nothing until a fresh review and Resume reviewed sequence.",
    ],
    relatedGuides: ["compare-rent", "tenant-offer", "work-a-renewal"],
    relatedScreens: ["communications"],
    lastUpdated: "2026-11-06",
    navItems: ["communications"],
  },
];
