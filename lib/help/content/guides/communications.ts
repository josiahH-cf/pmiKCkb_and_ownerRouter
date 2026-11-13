import type { HelpGuide } from "@/lib/help/types";

const WORKSPACE = "/lease-renewal/live/desk/lease/[leaseId]";
const COMMUNICATIONS = "/gmail-hub";
const FULL_VIEW = ["click-button:Full view"] as const;
const OWNER_OPTIONS = [...FULL_VIEW, "open-summary:Outreach record"];
const TENANT_OPTIONS = [...FULL_VIEW, "open-summary:Record of contact"];
const PREPARED_MESSAGE = ["components/lease-renewal/RenewalPreparedMessage.tsx"];
const KICKOFF = ["lib/lease-renewal/renewal-preparation.ts"];
const COMMUNICATION_STATE = ["lib/gmail-hub/communication-state.ts"];
const OWNER_COPY = ["lib/lease-renewal/owner-copy-version.ts"];

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
          "The Now card shows the owner message prepared from the saved numbers and the working terms, with What sending needs and the delivery actions. On the Now card, Facts for the owner ask leads with Current base rent, Market and Rent to recommend, then the To and Cc line and the primary action. In Full view, Owner approval shows Current base rent, Market and Rent to recommend, then Owner message preparation with the message, the To and Cc line, Working renewal terms and Outreach record, which holds the delivery options and Work recorded by staff with Owner outreach and Owner response.",
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
        note: "Review owner message stays the Now card's primary action while the message is ready, and Full view opens the same review from Review and send. When an input is missing, What sending needs names it with its fix, for example Set up your signature. When a recipient or a source fact changed after the review opened, nothing is sent: the review stays open, reloads the current message and names What changed, one line per change, such as Rent to recommend: was the earlier amount, now the current one; read it and confirm again. While the lease is still being re-read, the review says The lease is being re-read. Nothing was sent. Try again in a moment. The review lists the recipients, subject, the lease line and the terms with Renewal term first, and the message body last in its own scrolling area.",
      },
      {
        id: "publish-owner-wording",
        action:
          "As an Approver or Admin, when the owner message card reads New owner wording that asks about the term is ready to publish., choose Review the new owner wording, read how many unsent owner messages will be held, then choose Publish the new owner wording or Keep the current wording.",
        control: {
          label: "Review the new owner wording",
          role: "button",
          region: "region:Owner approval",
          availability: "conditional",
          source: OWNER_COPY,
          actions: OWNER_OPTIONS,
        },
        route: WORKSPACE,
        where: "Owner approval, Outreach record, before Unsent Gmail draft",
        result:
          "Publishing reads The new owner wording is published. Owner messages now state the renewal term. From then on the owner message states The renewal term would run from the start through the end date, after the recommendation, and asks whether the renewal term works. Unsent owner messages reviewed with the earlier wording are held for review, each naming The owner message wording was updated.",
        effect: "saves-in-app",
        note: "Before you publish, the card says how many unsent owner messages were reviewed with the current wording and will be held, or that none will be. If that number changes before you publish, nothing is published and the card asks you to review again. Keep the current wording publishes nothing. Editors do not see this block. Once the new wording is in use, What sending needs adds Renewal dates, and a missing date reads Renewal dates: enter the start and end with the fix Enter the renewal dates.",
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
          "The status reads Scheduled for with the date, time and time zone, such as 11/13/2026, 9:00 AM CST, and It counts as sent once Gmail accepts it. The lease reads Owner message scheduled for its date, and the message counts as the owner outreach only once Gmail accepts it at that time.",
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
        where: "Outreach record, Copy the message",
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
        where: "Outreach record, Unsent Gmail draft",
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
          "The status line reads Saved and the communication reads Draft in app. Your wording also saves by itself a moment after each edit. A composer you open from the lease saves nothing until your first change and reads Not saved yet. Your first change saves a draft., so closing it untouched leaves no draft.",
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
        note: "Send and Schedule stay unavailable until the subject and message are complete, the recipients are verified and every file is checked, and only the responsible sender can choose them. Schedule messages also needs First date, Local time and Timezone. A reply or a failed delivery pauses the follow-ups. The state line names the time with its zone, such as Scheduled for 11/13/2026, 9:00 AM CST or Paused on with its time. A renewal lease holds one current message per audience: when another owner message for this renewal is already scheduled, waiting, paused before sending or holding a send Gmail has not confirmed, the composer refuses with its state and Open that communication. When a newer message for this renewal was sent, the composer reads A newer message for this renewal was sent, with its time, and Cancel this one, with Open the lease.",
      },
      {
        id: "update-from-the-lease",
        action:
          "When the composer reads This message was written before the lease changed. Update it from the lease, or cancel it., read each changed value listed under it, then choose Update from the lease, review the rebuilt message and choose Send or Schedule.",
        control: {
          label: "Update from the lease",
          role: "button",
          region: "region:Workflow communication composer",
          availability: "conditional",
          source: COMMUNICATION_STATE,
        },
        route: COMMUNICATIONS,
        where: "Communications, workflow communication composer, in the reason block",
        result:
          "The message is rebuilt from the lease and saved once, and the status reads Updated from the lease. Nothing was sent. Review the message, then Send or Schedule it.",
        effect: "saves-in-app",
        note: "Each line names one change, such as Renewal end date: 12/31/2027 in this message, 06/30/2027 on the lease., and not set stands for an empty value. While the message predates the change, or a newer message was sent, Send, Schedule and Resume reviewed sequence are not offered; Cancel future messages stays. On the lease, the same message reads as out of date or held, and Review the updated owner message updates it in one review.",
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
        where: "Owner approval, Outreach record, Work recorded by staff, Owner outreach",
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
        note: "Accepted by Gmail means Gmail took the message; Gmail shows neither delivery nor reading. Refresh linked incoming checks the linked threads for new replies, also on a completed message still watched for its answer. Check Gmail now on the Incoming or Scheduled view checks your own mailbox once for every watched message.",
      },
      {
        id: "check-for-a-reply",
        action:
          "While the lease waits on the owner, read Last checked for a reply under the waiting line on the Now card, and choose Check for a reply now to check again.",
        control: {
          label: "Check for a reply now",
          role: "button",
          region: "region:Now",
          availability: "conditional",
          source: ["lib/lease-renewal/outreach-evidence.ts"],
        },
        route: WORKSPACE,
        where: "Guided view, the Now card on Ask the owner, under the waiting line",
        result:
          "The app checks this lease's sent messages for a reply once and reads the step again. A reply shows as Owner replied with its date, and Record the owner's answer leads. Otherwise the line reads Last checked for a reply: with the time, and a check that did not finish reads Reply check failed at with the time and Try again while the step keeps waiting.",
        effect: "reads",
        note: "The app keeps watching a sent message for its answer until the answer is recorded, the cycle closes or the lease end passes, so a reply to a message whose follow-ups are finished still reaches the lease. Not checked yet means no check has run. The button shows to Editors and above while a sent or watched message exists, and Offer the tenant has the same line and button. A check records no answer.",
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
        where: "Tenant offer and response, Record of contact, Waiting and follow-up card",
        result:
          "The card shows who the renewal is waiting on and the last contact, read from the lease's own messages the same way as the step's waiting line, or No contact recorded yet, and when follow-up is due. When the step already shows its waiting line, the card adds only the follow-up date and the notice rules line. A linked thread or a dismissed due item is stored with this lease for staff.",
        effect: "saves-in-app",
        note: "Link or refresh exact Gmail evidence holds Exact Gmail thread ID, Reason for linking and Link exact thread. Linking or refreshing reads the thread only, and follow-up timing sets no reminder. While the renewal notice rules are not confirmed, the card reads Renewal notice rules are not confirmed. Next: an Admin confirms them in Admin, Renewal notice rules., which links there for an Admin, and no follow-up date shows.",
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
          "The paused communication says why it paused, such as A reply was received, Failed delivery reported, The tenant's response was recorded by staff, or The lease or recipient facts changed with What changed naming each change. After a fresh review, Resume reviewed sequence restarts the reviewed follow-ups on their schedule.",
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
        where: "Owner approval, Outreach record, Work recorded by staff, Owner response",
        result:
          "No response, Revision requested and Declined / non-renewal save when you choose them. Approved saves only through Save the owner's answer: the recorded approval then reads who approved, how and when, with a line naming what it covers, Amount approved becomes the offer amount for this renewal, and Continue to Offer the tenant appears.",
        effect: "saves-in-app",
        note: "When this cycle has a rent to recommend, Same as recommended, with that amount in parentheses, fills Amount approved; change it when the owner approved another amount. What the owner's answer covers is Base rent only, or Base rent and the renewal dates once both dates are saved in Working renewal terms; other charges are reviewed with the tenant offer. Before the dates are saved, To record that the owner also approved the dates, enter the renewal dates first. offers Enter the renewal dates in Working renewal terms, and Return to the owner's answer brings you back with your entries kept. Under the choice, the answer says what it means at Documents: This answer covers the base rent only. Documents will ask for the owner's approval of the renewal dates and charges., or that it covers the base rent and the renewal dates, so Documents asks for no second approval of the dates. When the reviewed tenant offer lists charges, Approved also shows The owner approved these exact offer charges with those charges; check it only when the owner approved them as listed. It counts with Base rent and the renewal dates, and the saved approval then reads The owner's approval covers the current offer, charges included; without it, the approval covers the base and dates, not the offer's charges. The review shows Recommended base rent with its basis, such as entered by staff, beside Amount approved, with Change the answer to go back. Once saved, Offer amount for this renewal adds Approved by the owner on with the date. Rent to recommend stays your recommendation and is never replaced by the approved amount. After an owner reply, the Now card on Ask the owner leads with Record the owner's answer: choose the Approved in the reply received option, enter the amount and coverage and Who approved in this reply, then review and save; Asked for a change and Declined / non-renewal use Record this decision. Owner response here covers an authorized representative, another written channel or a conversation. How they approved offers Reply in this lease's renewal thread when a linked reply exists, Another written channel or Conversation. If the amount, the dates or the charges change later, the line reads Owner approval no longer covers and names what changed; ask the owner again, then choose Record a new approval. Revision requested also asks What the owner asked to change. When the latest confirmed owner message stated the renewal dates, What the owner's answer covers opens on Base rent and the renewal dates with those dates and the line The message asked about the rent and these dates.; when the dates changed after it was sent, it opens on Base rent only with The renewal dates changed after the owner message was sent. For a reply that came from the address the owner message went to, Who approved opens on that owner with Selected because this reply came from the address the owner message was sent to. You can change either choice.",
      },
    ],
    result:
      "The owner message is sent or scheduled by your own Send this message, Schedule this message, Send, Schedule or channel, the outreach is recorded from the send itself or by you under Work recorded by staff, and the owner's actual answer is recorded under Owner response, with who approved, how and when for an approval.",
    doesNotDo: [
      "The app sends nothing on its own, and Gmail shows neither delivery nor reading; Accepted by Gmail means only that Gmail took the message.",
      "An owner reply records no answer by itself; the answer is recorded only when you choose it.",
      "Check for a reply now and Check Gmail now only read: they send nothing and record no answer.",
      "Copying the message, saving a draft or creating an unsent Gmail draft sends nothing and records no delivery.",
      "Recording an owner response approves nothing on the owner's behalf and writes nothing to RentVine or the Sheet.",
      "A recorded approval covers only what it names: the base rent alone, the base rent and the renewal dates, or with The owner approved these exact offer charges, that exact offer's charges as well. An approval of an earlier offer never covers the current offer's charges, and after a covered value changes the owner's approval needs recording again.",
      "Rent to recommend is a staff recommendation, not the owner's approval; saving the owner's answer sets the offer amount to Amount approved.",
      "Follow-up timing sets no reminder or deadline, and paused follow-ups send nothing until a fresh review and Resume reviewed sequence.",
    ],
    relatedGuides: ["compare-rent", "tenant-offer", "work-a-renewal"],
    relatedScreens: ["communications"],
    lastUpdated: "2026-11-13",
    navItems: ["communications"],
  },
];
