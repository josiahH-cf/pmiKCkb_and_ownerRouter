// Synthetic fixtures use actual application stores, only in the isolated local emulator.
import assert from "node:assert/strict";
import { localDemoUser } from "@/lib/auth/session";
import { createMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  createOperationalPageDraft,
  approveOperationalPageVersion,
  publishOperationalPageVersion,
  readPublishedOperationalPage,
} from "@/lib/firestore/operational-pages";

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-batch005-browser-test");
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, "pmi-kc-kb-batch005-browser-test");
async function seed() {
  const actor = localDemoUser("Admin");
  const sourceText =
    "Published fixture source; retain every word and internal link. " +
    "LongUnbrokenSourceValue".repeat(100);
  const draft = await createOperationalPageDraft(actor, {
    reason: "Local compiled long-content verification fixture",
    definition: {
      pageType: "operational_process",
      spaceId: "lease-renewals",
      slug: "batch005-long-source",
      title: "Local published long-content fixture",
      components: [
        { type: "heading", text: "Published fixture facts", level: "2" },
        ...Array.from({ length: 12 }, (_, index) => ({
          type: "text" as const,
          text: `${index + 1}. ${sourceText}`,
        })),
        {
          type: "internal_link",
          label: "Open current workflow communications",
          href: "/gmail-hub",
        },
      ],
    },
  });
  await approveOperationalPageVersion(actor, {
    versionId: draft.id,
    previewHash: draft.previewHash,
  });
  const receipt = await publishOperationalPageVersion(actor, {
    versionId: draft.id,
    previewHash: draft.previewHash,
  });
  const published = await readPublishedOperationalPage(
    actor,
    "lease-renewals",
    "batch005-long-source",
  );
  assert.equal(published?.id, draft.id);
  assert.equal(published?.previewHash, receipt.previewHash);
  const ticket = await createMaintenanceTicket(actor, {
    summary: "Local compiled long-message fixture",
    description: "Local synthetic ticket; no provider record or action.",
    priority: "Normal",
    unit: {
      unitId: "fixture-local-unit",
      label: "Fixture local unit",
      confidence: "Verified",
    },
  });
  console.log(
    JSON.stringify({
      pagePath: "/spaces/lease-renewals/pages/batch005-long-source",
      sourceText,
      previewHash: draft.previewHash,
      ticketId: ticket.id,
      senderEmail: actor.email,
    }),
  );
  await getAdminFirestore().terminate();
}
void seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
