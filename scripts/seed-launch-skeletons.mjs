import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DRAFT_BANNER = "Draft \u2014 Review before sending";
const defaultOwnerUid = "launch-process-owner";

const skeletonDefinitions = [
  {
    id: "owner-renewal-outreach",
    name: "Owner Renewal Outreach + Comp Lookup",
    prompt:
      "Approved owner renewal outreach wording, comp lookup screenshots, and follow-up cadence still need source confirmation.",
    sourceHint:
      "Transcript context supports manual Zillow/PMI comp lookup and owner follow-up pain, but exact wording/cadence requires approved sources.",
    templateName: "Owner Renewal Outreach Placeholder",
  },
  {
    id: "tenant-renewal-notice",
    name: "Tenant Renewal Notice + DotLoop Follow-Up",
    prompt:
      "Approved tenant renewal notice, DotLoop handoff, and signature follow-up wording still need source confirmation.",
    sourceHint:
      "Transcript context supports RentVine tenant outreach, DotLoop document creation, and repeated signature follow-up pain.",
    templateName: "Tenant Renewal Notice Placeholder",
  },
  {
    id: "vendor-assignment-handoff",
    name: "Vendor Assignment Handoff",
    prompt:
      "Approved vendor-routing categories, Dan escalation rules, and vendor notification wording still need source confirmation.",
    sourceHint:
      "Transcript context supports Dan-owned vendor assignment and scattered vendor communication, but not autonomous vendor choice.",
    templateName: "Vendor Assignment Handoff Placeholder",
  },
  {
    id: "daily-inbox-triage",
    name: "Daily Inbox Triage",
    prompt:
      "Approved LeadSimple/Gmail triage ownership, daily assignment rules, and escalation timing still need source confirmation.",
    sourceHint:
      "Transcript context supports LeadSimple unassigned inbox review, Gmail overload, and team assignment friction.",
    templateName: "Daily Inbox Triage Placeholder",
  },
  {
    id: "fathom-training",
    name: "Fathom Training",
    prompt:
      "Approved Fathom recording intake, training index ownership, and meeting action-item follow-up rules still need source confirmation.",
    sourceHint:
      "Transcript context supports Fathom recording use and the need for assignment-tracked meeting follow-up.",
    templateName: "Fathom Training Placeholder",
  },
  {
    id: "escalation-rules",
    name: "Escalation Rules",
    prompt:
      "Approved escalation ownership by issue type, urgency, and backup owner still needs source confirmation.",
    sourceHint:
      "Transcript context supports Bailey as knowledge bottleneck and Dan as vendor/document decision bottleneck.",
    templateName: "Escalation Rules Placeholder",
  },
  {
    id: "move-in",
    name: "Move-In",
    prompt:
      "Approved move-in checklist ownership, tenant prerequisites, Z-inspection handoff, and closeout wording still need source confirmation.",
    sourceHint:
      "Transcript context supports processing fee, animal registration, utilities, Z-inspection, keys, welcome letter, and listing closeout tracking.",
    templateName: "Move-In Checklist Placeholder",
  },
];

export function parseLaunchSkeletonArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
  };
}

export function buildLaunchSkeletonRecords(now = new Date().toISOString()) {
  return skeletonDefinitions.flatMap((definition) => [
    {
      collection: "sops",
      id: `launch-${definition.id}-sop`,
      data: {
        body_md: [
          `# ${definition.name} Placeholder SOP`,
          "",
          "This launch Space is ready for source-backed content, but final SOP wording is not approved yet.",
          "",
          "Known from sanitized call context:",
          `- Source basis: ${definition.sourceHint}`,
          "",
          "Do not answer legal, fee, deadline, approval-threshold, or system-of-record questions from this placeholder alone.",
        ].join("\n"),
        created_at: now,
        id: `launch-${definition.id}-sop`,
        owner_uid: defaultOwnerUid,
        sensitivity: "Low",
        source_state_hint: "Bailey Placeholder",
        space_id: definition.id,
        status: "Placeholder",
        title: `${definition.name} Placeholder SOP`,
        updated_at: now,
      },
    },
    {
      collection: "templates",
      id: `launch-${definition.id}-template`,
      data: {
        audience: "Internal",
        body: `${DRAFT_BANNER}\n\nNeeds Verification: approved ${definition.name} wording.\n\nUse this placeholder only to route the missing source detail to the process owner.`,
        channel: "Internal",
        created_at: now,
        id: `launch-${definition.id}-template`,
        name: definition.templateName,
        space_id: definition.id,
        status: "Draft",
        updated_at: now,
      },
    },
    {
      collection: "placeholders",
      id: `launch-placeholder-${definition.id}`,
      data: {
        created_at: now,
        due_date: "2026-06-30",
        id: `launch-placeholder-${definition.id}`,
        missing_detail: definition.prompt,
        owner_uid: defaultOwnerUid,
        priority: "P1",
        space_id: definition.id,
        status: "Open",
        updated_at: now,
      },
    },
  ]);
}

export async function seedLaunchSkeletons({
  db = getLiveFirestore(),
  force = false,
  now = new Date().toISOString(),
} = {}) {
  const records = buildLaunchSkeletonRecords(now);
  const results = [];

  for (const record of records) {
    const ref = db.collection(record.collection).doc(record.id);
    const snapshot = await ref.get();

    if (snapshot.exists && !force) {
      results.push({ ...record, action: "skipped" });
      continue;
    }

    await ref.set(
      snapshot.exists
        ? {
            ...record.data,
            created_at: snapshot.data()?.created_at ?? now,
            updated_at: now,
          }
        : record.data,
      { merge: true },
    );

    if (snapshot.exists) {
      await clearStaleReviewFields(ref, record.collection);
    }

    results.push({ ...record, action: snapshot.exists ? "updated" : "created" });
  }

  return results;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseLaunchSkeletonArgs(argv);
  const records = buildLaunchSkeletonRecords();

  if (args.dryRun) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  const results = await seedLaunchSkeletons({ force: args.force });

  for (const result of results) {
    console.log(`${result.action}: ${result.collection}/${result.id}`);
  }
}

export function launchSkeletonDeleteFieldsFor(collection) {
  if (collection === "sops") {
    return ["backup_owner_uid", "last_reviewed_at"];
  }

  if (collection === "templates") {
    return ["approved_by_uid", "last_reviewed_at"];
  }

  if (collection === "placeholders") {
    return ["related_sop_id", "resolution"];
  }

  return [];
}

async function clearStaleReviewFields(ref, collection) {
  const fields = launchSkeletonDeleteFieldsFor(collection);

  if (fields.length === 0) {
    return;
  }

  await ref.update(
    Object.fromEntries(fields.map((fieldName) => [fieldName, FieldValue.delete()])),
  );
}

function getLiveFirestore() {
  const localEnv = readLocalEnv();
  const readEnv = (name) => process.env[name] || localEnv[name];
  const projectId =
    readEnv("FIREBASE_PROJECT_ID") ||
    readEnv("GCP_PROJECT_ID") ||
    readEnv("GOOGLE_CLOUD_PROJECT") ||
    readEnv("GCLOUD_PROJECT");

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  return getFirestore();
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
