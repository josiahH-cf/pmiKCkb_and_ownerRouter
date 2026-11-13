import type { HelpChangelogEntry } from "@/lib/help/types";

/**
 * S242 R-S242-4 / S243 R-S243-3: What changed, newest first. Every help content change adds an
 * entry with a new HELP_VERSION and the content digest it describes (print it with
 * `node lib/help/content-digest.mjs`). The serving commit for the current version is read at
 * runtime from the deploy identity, so the page always names the release that serves it.
 */
export const HELP_CHANGELOG: readonly HelpChangelogEntry[] = [
  {
    version: "V6.0",
    date: "2026-11-13",
    summary:
      "V6.0, a tenant response is reviewed before it saves: Review the tenant's response names the offer it answers and what follows, and Save stops that offer's reminders. A lease keeps one current message per audience, and a scheduled or held message the lease has since changed is updated once with Review the updated offer or Review the updated owner message, or cancelled; Communications offers Update from the lease. Ask the owner leads with the facts for the ask, the review shows the message body last, and the message groups are Message, Other ways to send and the step's record group. The renewal end date offers a 12 month term, an Approver can publish owner wording that states the term, and the owner's answer opens on what the message asked. Finish up lists every source update with Prepare and review and Review all for the Sheet. The Dashboard lists the follow-through your own messages call for, Prepare counts the leases shown, only an Admin sets the notice timing basis, and times show their zone.",
    affectedGuides: [
      "work-a-renewal",
      "train-and-review",
      "compare-rent",
      "owner-message",
      "tenant-offer",
      "update-sources",
      "prepare-documents",
      "notifications",
      "find-your-way",
      "admin-tasks",
      "publish-a-process",
      "outreach-checklist",
    ],
    contentDigest: "875be030ade97ae33405d9085c30e7083a4bc6a598d11fcf9c8c6692260db0d3",
  },
  {
    version: "V5.0",
    date: "2026-11-13",
    summary:
      "V5.0, the renewal Spaces show their published process as guidance with Open the Renewal Desk and start no checklist run, and an earlier renewal run reads as a record. A sent renewal message stays watched for its answer: the lease shows Last checked for a reply with Check for a reply now, Communications offers Check Gmail now, and Reload worklist and Reload linked conversations reload what the app stored. A tenant reply shows its words on Offer the tenant with Accepted in the reply received as a choice, as an owner reply does on Ask the owner. A refused or paused renewal message names what changed, and a lease still being re-read says Nothing was sent. The renewal rent shows its basis wherever it appears, a covered lease offers the agreement's amount, and the owner's answer offers Same as recommended and says what its coverage means at Documents. Who a lease waits on comes from its own messages, with one Needs a check line and its fix. An off-cycle lease end date is reviewed on Check the numbers with Include in this renewal month or Keep on hold.",
    affectedGuides: [
      "work-a-renewal",
      "train-and-review",
      "compare-rent",
      "owner-message",
      "tenant-offer",
      "update-sources",
      "notifications",
      "publish-a-process",
      "outreach-checklist",
    ],
    contentDigest: "8ba9b674c343fac400adacb21acb3c75fdf5f6e3a502da8735d35a97c1c85de9",
  },
  {
    version: "V4.0",
    date: "2026-11-10",
    summary:
      "V4.0, each renewal step leads with the one field or fix it needs now, and its optional work and read-only Verification sit in named groups, the same in Guided and Full view. Check the numbers shows Current base rent. Record the owner's answer saves Amount approved and what it covers as the offer amount, apart from Rent to recommend. Working renewal terms has its own group and proposes the day after the current lease ends. Review offer charges decides each tenant offer line with exact totals, and an Admin keeps Offer charge mappings. Shared tenant flyers and the information form need a tenant audience check in Connections, and Documents and signatures shows Next for this packet. A tenant response names the exact offer it answers, an owner approval can cover the reviewed offer's exact charges, and a form whose shared charge differs from the accepted offer waits with the difference. An acceptance of an earlier offer keeps Offer the tenant open, and the RentVine and Sheet renewal updates wait until the answer for the current offer is recorded. A message Gmail has not confirmed is checked before Send again or an owner reply. A new guide teaches a teammate to prepare a renewal and the lead to review it inside the app.",
    affectedGuides: [
      "work-a-renewal",
      "train-and-review",
      "compare-rent",
      "tenant-offer",
      "update-sources",
      "owner-message",
      "prepare-documents",
      "manage-connections",
      "admin-tasks",
    ],
    contentDigest: "0e2861e546fb96a8e8dce6a350c90e2569d91c304368a92ecd9c1bf495603231",
  },
  {
    version: "V3.0",
    date: "2026-11-09",
    summary:
      "Renewals has one monthly table, deliberate preparation and a shared Guided and Full workspace. Work status opens from the sticky lease header. The tenant offer review supports bounded follow-ups. Help opens from Admin.",
    affectedGuides: ["find-your-way", "work-a-renewal", "compare-rent", "tenant-offer"],
    contentDigest: "d306c8fb8b94c9c827b5211b1f1b2a8cafd69546daeac4274a9af131dedfbf33",
  },
  {
    version: "V2.2",
    date: "2026-11-07",
    summary:
      "V2.2, Renewals opens the working batch table and lets you switch to All leases and filters. The lease header shows the current stage and opens Record work. Guided and Full keep the applicable controls and older links. You can retire and restore an exact renewal cycle, review shared membership, and save a blank signature. Operations includes Communications, and Admin and Connections open the task you choose.",
    affectedGuides: [
      "find-your-way",
      "work-a-renewal",
      "compare-rent",
      "owner-message",
      "tenant-offer",
      "manage-connections",
      "admin-tasks",
      "publish-a-process",
    ],
    contentDigest: "dbdc95881e894b6982aeb38721e25c0896e85ba63202d7248d5ad1679e4e82cf",
  },
  {
    version: "V2.1",
    date: "2026-11-06",
    summary:
      "V2.1, each path step keeps its work on Now, covered and assisted continuations follow the lease, reply and draft recovery stay in place, Pricing basis appears once, and missing fields and source links lead to their fixes. Newer typing survives saves and view changes, delivery preparation waits for confirmed working figures, Copy reports unconfirmed figures, and comparison times use Central time. Long reviews open at the message details, and scheduling marks the required timing fields.",
    affectedGuides: [
      "work-a-renewal",
      "tenant-offer",
      "owner-message",
      "compare-rent",
      "admin-tasks",
    ],
    contentDigest: "08f6120fa2bda9bd974c5096c02985c355c35927e90c33eb803f506f1c8d54be",
  },
  {
    version: "V2.0",
    date: "2026-11-06",
    summary:
      "V2.0, the renewal process now starts on the working batch and works each lease in Guided view: the desk opens on This batch, a lease opens in the same tab on its Renewal path with one Now card, a prepared lease's kickoff is Review and send and Send this message, the owner's decision from a reply is recorded on the Now card with Record this decision, the standing agreement and housing assistance paths are covered, All leases and filters keeps the worklist table, and the packet inputs and charge policy steps name the Owner acknowledgment and the pet processing fee",
    affectedGuides: [
      "work-a-renewal",
      "compare-rent",
      "owner-message",
      "tenant-offer",
      "update-sources",
      "prepare-documents",
      "admin-tasks",
    ],
    contentDigest: "c100a9e95ee4a49c9987e58191a90a5469567b022e7dd9d622c8b87fd5e20673",
  },
  {
    version: "V1.1",
    date: "2026-11-04",
    summary:
      "V1.1, three guide results now match the app: the Completion checks card, the connection card after a live check and a snoozed queue item",
    affectedGuides: ["prepare-documents", "manage-connections", "approve-or-deny"],
    contentDigest: "a77ea88054d52bdade8d4c1f573934025e0de03f12fbee6acfedde6bb0641bfb",
  },
  {
    version: "V1.0",
    date: "2026-11-04",
    summary: "V1.0, first release of the staff help hub",
    affectedGuides: [
      "find-your-way",
      "work-a-renewal",
      "compare-rent",
      "tenant-offer",
      "update-sources",
      "owner-message",
      "prepare-documents",
      "manage-connections",
      "admin-tasks",
      "publish-a-process",
      "approve-or-deny",
      "notifications",
      "my-work-and-profile",
      "search",
      "outreach-checklist",
      "maintenance-history",
    ],
    contentDigest: "c46cbfc54efacac936b74b05b2b170fad72a73047313cd76bdf43745f2a1d21c",
  },
];
