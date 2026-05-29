import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLaunchSkeletonRecords,
  launchSkeletonDeleteFieldsFor,
} from "./seed-launch-skeletons.mjs";

const DRAFT_BANNER = "Draft \u2014 Review before sending";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localEnv = readLocalEnv();

const demoWorkflowRecords = [
  {
    placeholder: {
      id: "demo-placeholder-renewal-timing",
      missing_detail: "Confirm the exact renewal follow-up timing for edge cases.",
      space_id: "lease-renewals",
    },
    sop: {
      body_md:
        "# Lease Renewals Demo SOP\n\n1. Check the current lease and renewal status.\n2. Confirm owner direction before sending owner-facing commitments.\n3. Use approved renewal follow-up wording when the source is verified.\n4. Create a placeholder when timing, fee, or approval details are not documented.",
      id: "demo-lease-renewals-sop",
      space_id: "lease-renewals",
      title: "Lease Renewals Demo SOP",
    },
    template: {
      audience: "Owner",
      body: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are checking the renewal status and will confirm the recommended next step once the documented renewal details are verified.\n\nThank you,`,
      channel: "Gmail",
      id: "demo-owner-renewal-follow-up",
      name: "Owner Renewal Follow-Up",
      space_id: "lease-renewals",
    },
  },
  {
    placeholder: {
      id: "demo-placeholder-maintenance-routing",
      missing_detail:
        "Confirm approved routing rules for maintenance requests that arrive without photos.",
      space_id: "maintenance-work-order-intake",
    },
    sop: {
      body_md:
        "# Maintenance Work Order Intake Demo SOP\n\n1. Check the RentVine work order details.\n2. Confirm whether tenant photos or access details are missing.\n3. Use the approved request-for-photos wording when needed.\n4. Escalate vendor assignment when no approved routing rule applies.",
      id: "demo-maintenance-work-order-sop",
      space_id: "maintenance-work-order-intake",
      title: "Maintenance Work Order Intake Demo SOP",
    },
    template: {
      audience: "Tenant",
      body: `${DRAFT_BANNER}\n\nHi [Tenant Name],\n\nPlease add photos and any access notes to the maintenance request in RentVine so the team can review the next step.\n\nThank you,`,
      channel: "RentVine",
      id: "demo-maintenance-photo-request",
      name: "Maintenance Photo Request",
      space_id: "maintenance-work-order-intake",
    },
  },
  {
    placeholder: {
      id: "demo-placeholder-deposit-disposition",
      missing_detail:
        "Confirm approved deposit disposition wording and escalation requirements.",
      space_id: "move-out-deposit-disposition",
    },
    sop: {
      body_md:
        "# Move-Out + Deposit Disposition Demo SOP\n\n1. Confirm move-out notice and tracker status.\n2. Send approved tenant or owner instructions only from documented details.\n3. Review inspection and vendor-bid status before owner-facing commitments.\n4. Escalate deposit-sensitive decisions and legal wording.",
      id: "demo-move-out-deposit-sop",
      space_id: "move-out-deposit-disposition",
      title: "Move-Out + Deposit Disposition Demo SOP",
    },
    template: {
      audience: "Owner",
      body: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are tracking the move-out and will confirm documented inspection or repair next steps once available.\n\nThank you,`,
      channel: "Gmail",
      id: "demo-move-out-owner-update",
      name: "Move-Out Owner Update",
      space_id: "move-out-deposit-disposition",
    },
  },
  {
    placeholder: {
      id: "demo-placeholder-owner-onboarding-gaps",
      missing_detail:
        "Confirm who owns each missing owner-onboarding checklist item when setup stalls.",
      space_id: "owner-onboarding",
    },
    sop: {
      body_md:
        "# Owner Onboarding Demo SOP\n\n1. Check the onboarding tracker before treating setup details as known.\n2. Confirm agreement, utilities, insurance, keys or locks, filters, and lawn care.\n3. Confirm lease takeover, tenant contact, and deposit tracking when applicable.\n4. Create a placeholder for missing setup ownership or timing.",
      id: "demo-owner-onboarding-sop",
      space_id: "owner-onboarding",
      title: "Owner Onboarding Demo SOP",
    },
    template: {
      audience: "Owner",
      body: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are confirming the onboarding checklist and will follow up on any missing setup details.\n\nThank you,`,
      channel: "Gmail",
      id: "demo-owner-onboarding-follow-up",
      name: "Owner Onboarding Follow-Up",
      space_id: "owner-onboarding",
    },
  },
];

const demoToolRecords = [
  {
    id: "demo-rentvine",
    name: "RentVine",
    purpose: "Check lease, tenant, owner, maintenance, and renewal context.",
    url: "https://example.com/rentvine",
  },
  {
    id: "demo-dotloop",
    name: "DotLoop",
    purpose: "Prepare and track renewal or move-out related documents.",
    url: "https://example.com/dotloop",
  },
  {
    id: "demo-google-sheets",
    name: "Google Sheets",
    purpose: "Review demo trackers and onboarding checklists without KB write access.",
    url: "https://example.com/google-sheets",
  },
  {
    id: "demo-google-chat",
    name: "Google Chat",
    purpose: "Keep operational handoffs visible without automated KB posting.",
    url: "https://example.com/google-chat",
  },
];

export const demoRecords = [
  ...demoWorkflowRecords.flatMap((workflow) => [
    {
      collection: "sops",
      deleteFields: ["last_reviewed_at"],
      id: workflow.sop.id,
      data: {
        body_md: workflow.sop.body_md,
        owner_uid: "local-demo-admin",
        sensitivity: "Low",
        source_state_hint: "Verified Source",
        space_id: workflow.sop.space_id,
        status: "In Review",
        title: workflow.sop.title,
      },
    },
    {
      collection: "templates",
      deleteFields: ["approved_by_uid", "last_reviewed_at"],
      id: workflow.template.id,
      data: {
        audience: workflow.template.audience,
        body: workflow.template.body,
        channel: workflow.template.channel,
        name: workflow.template.name,
        space_id: workflow.template.space_id,
        status: "In Review",
      },
    },
    {
      collection: "placeholders",
      deleteFields: ["resolution"],
      id: workflow.placeholder.id,
      data: {
        due_date: "2026-06-15",
        missing_detail: workflow.placeholder.missing_detail,
        owner_uid: "local-demo-admin",
        priority: "P1",
        space_id: workflow.placeholder.space_id,
        status: "Open",
      },
    },
  ]),
  ...demoToolRecords.map((tool) => ({
    collection: "tools",
    deleteFields: [],
    id: tool.id,
    data: {
      integration_status: "Link only",
      name: tool.name,
      primary_owner_uid: "local-demo-admin",
      purpose: tool.purpose,
      sensitivity: "Medium",
      url: tool.url,
    },
  })),
];

export async function resetDemoRecords({
  note = "Reset safe four-workflow demo records.",
} = {}) {
  const db = getDemoFirestore();
  const now = new Date().toISOString();
  const resetRecords = [
    ...demoRecords,
    ...buildLaunchSkeletonRecords(now).map((record) => ({
      ...record,
      deleteFields: launchSkeletonDeleteFieldsFor(record.collection),
    })),
  ];

  for (const record of resetRecords) {
    const ref = db.collection(record.collection).doc(record.id);
    const snapshot = await ref.get();

    const resetData = {
      id: record.id,
      ...record.data,
      created_at: snapshot.exists ? (snapshot.data()?.created_at ?? now) : now,
      updated_at: now,
    };

    await ref.set(
      snapshot.exists ? { ...resetData, deleted_at: FieldValue.delete() } : resetData,
      { merge: true },
    );

    if (record.deleteFields.length > 0) {
      await ref.update(
        Object.fromEntries(
          record.deleteFields.map((fieldName) => [fieldName, FieldValue.delete()]),
        ),
      );
    }

    const changeLogId = `demo-reset-${Date.now()}-${record.id}`;

    await db
      .collection("change_log")
      .doc(changeLogId)
      .set({
        id: changeLogId,
        action: snapshot.exists ? "update" : "create",
        created_at: now,
        editor_uid: "demo-reset",
        entity_id: record.id,
        entity_type: entityTypeFor(record.collection),
        note,
      });
  }
}

function getDemoFirestore() {
  const projectId =
    readEnv("FIREBASE_PROJECT_ID") ||
    readEnv("GCP_PROJECT_ID") ||
    readEnv("GOOGLE_CLOUD_PROJECT") ||
    readEnv("GCLOUD_PROJECT");

  if (!projectId) {
    throw new Error("Set FIREBASE_PROJECT_ID, GCP_PROJECT_ID, or GOOGLE_CLOUD_PROJECT.");
  }

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }

  return getFirestore();
}

function entityTypeFor(collection) {
  if (collection === "sops") {
    return "sop";
  }

  if (collection === "templates") {
    return "template";
  }

  if (collection === "placeholders") {
    return "placeholder";
  }

  return "tool";
}

function readEnv(name) {
  return process.env[name] || localEnv[name];
}

function readLocalEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(root, ".env.local"), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");

          if (separator === -1) {
            return null;
          }

          const key = line.slice(0, separator).trim();
          const value = line
            .slice(separator + 1)
            .trim()
            .replace(/^"|"$/g, "");
          return [key, value];
        })
        .filter(Boolean),
    );
  } catch {
    return {};
  }
}
