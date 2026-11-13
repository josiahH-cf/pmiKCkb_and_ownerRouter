// S284 W12-14, harness only: the in-process seed scripts/lib/one-path-rehearsal/process-draft-seed.mjs
// starts. With ONE_PATH_PROCESS_DRAFT it writes one renewal process definition as the
// non-executable Draft that scripts/seed-process-definitions.ts writes in production, with the same
// literal placeholder owner and approver, through the served commit's own seed writer. With
// ONE_PATH_PROCESS_OPERATION it makes one of the starting states the W12-14 candidate checks read
// and no staff control makes: a seeded definition, real staff recorded, a publication, a rollback,
// an earlier run kept from before S286, a retired definition, or the served card-state rule read
// against the stored definitions. Every write goes through the served commit's own services into the
// rehearsal's Firestore emulator and nowhere else. It refuses to run unless the rehearsal's network
// boundary is loaded in this process and the emulator is on 127.0.0.1 under a rehearsal test
// project. It prints one JSON line: what it wrote or read.
import net from "node:net";

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { SeedFirestore } from "@/lib/lease-renewal/process-definition-seed";

const LOOPBACK_HOST = /^127\.0\.0\.1:\d{1,5}$/;
const TEST_PROJECT = /^pmi-kc-kb-[a-z0-9-]+-test$/;
// The placeholders the production seed uses when no real staff is recorded.
const OWNER_UID = "process-owner-PLACEHOLDER";
const APPROVER_UID = "process-approver-PLACEHOLDER";
// Real staff, as recorded: the local demo Admin owns the process and the local demo Approver approves.
const REAL_OWNER_UID = "local-demo-admin";
const REAL_APPROVER_UID = "local-demo-approver";
const RENEWAL_DEFINITIONS = [
  "owner-renewal-outreach",
  "tenant-renewal-notice",
  "lease-renewal",
];
const DEFINITIONS = [...RENEWAL_DEFINITIONS, "move-in"];
// The harness's own publication policy: one per Space, for the local-demo scanner, so a later
// publication and a rollback of the same definition run under the same policy.
const POLICY_CONNECTOR = "one-path-w1214-synthetic";
const POLICY_ROOT = "one-path-w1214-processes";
const LOCAL_DEMO_SCANNER_KEY = "fake-clean-v1";
const RUN_ID = /^[A-Za-z0-9:_-]{1,200}$/;

function assertRehearsal() {
  const fetchGuarded =
    (globalThis.fetch as { name?: string } | undefined)?.name === "guardedFetch";
  if (!fetchGuarded || net.Socket.prototype.connect.name !== "guardedConnect")
    throw new Error("The rehearsal network boundary is not loaded; nothing was written.");
  if (!LOOPBACK_HOST.test(process.env.FIRESTORE_EMULATOR_HOST ?? ""))
    throw new Error("The Firestore emulator is not on 127.0.0.1; nothing was written.");
  if (!TEST_PROJECT.test(process.env.FIREBASE_PROJECT_ID ?? ""))
    throw new Error("The project is not a rehearsal test project; nothing was written.");
}

// The local demo principals as localDemoUser (lib/auth/session.ts) builds them for the default
// hosted domain; that helper reads the server's environment descriptor, which this process lacks.
async function demoActor(role: "Admin" | "Editor"): Promise<AuthenticatedUser> {
  const { ALLOWED_HD_DEFAULT } = await import("@/lib/constants");
  const uid = `local-demo-${role.toLowerCase()}`;
  return {
    uid,
    email:
      role === "Admin"
        ? `local-demo@${ALLOWED_HD_DEFAULT}`
        : `${uid}@${ALLOWED_HD_DEFAULT}`,
    hd: ALLOWED_HD_DEFAULT,
    role,
  };
}

async function seedDefinition(
  db: SeedFirestore,
  definitionId: string,
  staff: { ownerUid: string; approverUid: string },
) {
  const options = { db, ...staff, now: new Date().toISOString() };
  if (definitionId === "owner-renewal-outreach") {
    const seed =
      await import("@/lib/lease-renewal/owner-renewal-outreach/process-definition-seed");
    return seed.seedOwnerRenewalOutreachDefinition(options);
  }
  if (definitionId === "tenant-renewal-notice") {
    const seed =
      await import("@/lib/lease-renewal/tenant-renewal-notice/process-definition-seed");
    return seed.seedTenantRenewalNoticeDefinition(options);
  }
  if (definitionId === "lease-renewal") {
    const seed = await import("@/lib/lease-renewal/process-definition-seed");
    return seed.seedLeaseRenewalDefinition(options);
  }
  if (definitionId === "move-in") {
    const seed = await import("@/lib/move-in/process-definition-seed");
    return seed.seedMoveInDefinition(options);
  }
  throw new Error(`No process definition is named ${definitionId}.`);
}

/** The harness's space-wide local-demo policy for the definition's Space, created once. */
async function harnessPolicy(db: Firestore, admin: AuthenticatedUser, spaceId: string) {
  const existing = await db
    .collection("publication_policies")
    .where("connectorId", "==", POLICY_CONNECTOR)
    .get();
  const found = existing.docs.find((doc) =>
    ((doc.data().allowedSpaces as string[] | undefined) ?? []).includes(spaceId),
  );
  if (found) return { id: found.id, scannerKey: found.data().scannerKey as string };
  const { createPublicationPolicy } = await import("@/lib/publication/policy");
  const policy = await createPublicationPolicy(
    admin,
    {
      allowedSpaces: [spaceId],
      connectorId: POLICY_CONNECTOR,
      rootId: POLICY_ROOT,
      reason: "Synthetic W12-14 rehearsal: local-demo policy for this Space's process.",
      scannerKey: LOCAL_DEMO_SCANNER_KEY,
      sensitivityCeiling: "Low",
    },
    db,
  );
  return policy;
}

type Operation =
  | { op: "seed"; definitionId: string; staff: "placeholder" | "real" }
  | { op: "record-staff"; definitionId: string }
  | { op: "publish"; definitionId: string }
  | { op: "rollback"; definitionId: string; targetVersionId: string }
  | { op: "earlier-run"; definitionId: string; runId: string }
  | { op: "retire"; definitionId: string }
  | { op: "card-states" };

async function operate(operation: Operation, db: Firestore) {
  const admin = await demoActor("Admin");
  const editor = await demoActor("Editor");
  const workflows = await import("@/lib/firestore/workflows");
  if (operation.op !== "card-states" && !DEFINITIONS.includes(operation.definitionId))
    throw new Error(`Choose one of: ${DEFINITIONS.join(", ")}.`);

  if (operation.op === "seed") {
    const staff =
      operation.staff === "real"
        ? { ownerUid: REAL_OWNER_UID, approverUid: REAL_APPROVER_UID }
        : { ownerUid: OWNER_UID, approverUid: APPROVER_UID };
    return seedDefinition(db as unknown as SeedFirestore, operation.definitionId, staff);
  }

  if (operation.op === "record-staff") {
    // The definition save service with real staff sent: a renewal definition keeps a non-blank
    // value sent (R-S286-5), as an earlier definition form recorded it.
    const current = await workflows.getProcessDefinition(
      admin,
      operation.definitionId,
      db,
    );
    const saved = await workflows.updateProcessDefinition(
      admin,
      operation.definitionId,
      {
        expected_revision: current.revision!,
        owner_uid: REAL_OWNER_UID,
        default_approver_uid: REAL_APPROVER_UID,
      },
      db,
    );
    return {
      id: saved.id,
      action: "staff recorded",
      status: saved.status,
      ownerUid: saved.owner_uid,
      approverUid: saved.default_approver_uid,
    };
  }

  if (operation.op === "publish") {
    // The app's own publication service, as an Admin, on the content staff saved.
    const definition = await workflows.getProcessDefinition(
      admin,
      operation.definitionId,
      db,
    );
    const { spaceIdForProcessDefinition } = await import("@/lib/space-scope-resources");
    const spaceId = spaceIdForProcessDefinition(definition);
    if (!spaceId) throw new Error(`${definition.id} has no Space.`);
    const policy = await harnessPolicy(db, admin, spaceId);
    const { resolvePublicationScanner } = await import("@/lib/publication/provider");
    const { publishProcessDefinition } =
      await import("@/lib/publication/process-definition");
    const { definition: active, publicationVersion } = await publishProcessDefinition(
      admin,
      definition.id,
      {
        expected_revision: definition.revision!,
        note: "Synthetic W12-14 rehearsal publication.",
        policy_id: policy.id,
      },
      {
        db,
        scanner: resolvePublicationScanner(policy.scannerKey, {
          firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
          localDemoAuth: true,
          nodeEnv: process.env.NODE_ENV,
        }),
      },
    );
    const { readProcessDefinitionPublication } =
      await import("@/lib/publication/process-definition-readback");
    const publication = await readProcessDefinitionPublication(admin, active, db);
    return {
      id: active.id,
      action: "published",
      status: active.status,
      versionId: active.active_version_id,
      publicationVersionId: publicationVersion.id,
      readback: publication.state,
      versionNumber: publication.state === "verified" ? publication.versionNumber : null,
    };
  }

  if (operation.op === "rollback") {
    // The app's own rollback service; no route or staff control offers it for a process.
    const { rollbackTrustedPublication } = await import("@/lib/publication/service");
    const version = await rollbackTrustedPublication(
      admin,
      `process-definition:${operation.definitionId}`,
      operation.targetVersionId,
      "Restore the first reviewed synthetic version for the W12-14 rehearsal.",
      db,
    );
    return {
      id: operation.definitionId,
      action: "rolled back",
      versionId: version.id,
      rollbackOfVersionId: version.rollbackOfVersionId ?? null,
      versionNumber: version.versionNumber,
    };
  }

  if (operation.op === "earlier-run") {
    // An open run of the published renewal process, as startWorkflowRun wrote it before S286 (the
    // pinned version, the default approver as Owner, the first step as the stored next action, the
    // local demo Editor as starter, the product retention stamp), its "started" Timeline entry, and
    // its first step checked by the Editor with that check's Activity entry. The app's run start
    // refuses it now, so it is written straight to the emulator, as the help rehearsal does.
    if (!RENEWAL_DEFINITIONS.includes(operation.definitionId))
      throw new Error("An earlier run is seeded for a renewal process only.");
    if (!RUN_ID.test(operation.runId)) throw new Error("Choose a plain run id.");
    const { FieldValue } = await import("firebase-admin/firestore");
    const { v7: uuidv7 } = await import("uuid");
    const active = await workflows.getProcessDefinition(
      admin,
      operation.definitionId,
      db,
    );
    if (active.status !== "Active" || !active.active_version_id)
      throw new Error(`${active.id} is not published, so no run can be pinned to it.`);
    let refusal: string | null = null;
    try {
      await workflows.startWorkflowRun(editor, active.id, {}, db, {
        runId: operation.runId,
      });
    } catch (error) {
      refusal = (error as Error).message;
    }
    if (refusal === null)
      throw new Error(
        "The app's run start created a renewal run; nothing more was written.",
      );
    const { stampProductRecordRetention } =
      await import("@/lib/operations/product-record-retention");
    const { stepCheckDocId } =
      await import("@/lib/firestore/workflow-run-step-check-keys");
    const { spaceIdForProcessDefinition } = await import("@/lib/space-scope-resources");
    const at = FieldValue.serverTimestamp();
    const first = active.steps[0];
    if (!first) throw new Error(`${active.id} has no steps.`);
    const spaceId = active.space_id ?? spaceIdForProcessDefinition(active);
    if (!spaceId) throw new Error(`${active.id} has no Space.`);
    const batch = db.batch();
    batch.create(
      db.collection("workflow_runs").doc(operation.runId),
      stampProductRecordRetention("workflow_runs", {
        id: operation.runId,
        data_mode: "live",
        definition_id: active.id,
        space_id: spaceId,
        definition_version_id: active.active_version_id,
        process_name: active.name,
        status: "In Progress",
        owner_uid: active.default_approver_uid,
        next_action: first.title,
        due_date: new Date().toISOString().slice(0, 10),
        started_by_uid: editor.uid,
        created_at: at,
        updated_at: at,
      }),
    );
    const timelineId = uuidv7();
    batch.create(db.collection("workflow_run_timeline").doc(timelineId), {
      id: timelineId,
      run_id: operation.runId,
      actor_uid: editor.uid,
      event_type: "started",
      summary: `Started for the W12-14 rehearsal with synthetic data only. Definition version: ${active.active_version_id}.`,
      new_status: "In Progress",
      created_at: at,
    });
    const checkId = stepCheckDocId(operation.runId, first.id);
    batch.create(db.collection("workflow_run_step_checks").doc(checkId), {
      id: checkId,
      run_id: operation.runId,
      definition_id: active.id,
      step_id: first.id,
      step_title: first.title,
      status: "Checked",
      checked_by_uid: editor.uid,
      checked_at: at,
      created_at: at,
      updated_at: at,
    });
    const activityId = uuidv7();
    batch.create(db.collection("workflow_run_step_check_activity").doc(activityId), {
      id: activityId,
      run_id: operation.runId,
      step_id: first.id,
      actor_uid: editor.uid,
      action: "Checked",
      new_status: "Checked",
      created_at: at,
    });
    await batch.commit();
    return {
      id: operation.runId,
      action: "earlier run seeded",
      definitionId: active.id,
      versionId: active.active_version_id,
      startRefusal: refusal,
      steps: active.steps.map((step) => step.title),
      stepIds: active.steps.map((step) => step.id),
      checkedStep: first.title,
    };
  }

  if (operation.op === "retire") {
    // No service retires a process definition; the stored status is set as a migration would.
    await db
      .collection("process_definitions")
      .doc(operation.definitionId)
      .update({
        status: "Retired",
        updated_by_uid: admin.uid,
        updated_at: (
          await import("firebase-admin/firestore")
        ).FieldValue.serverTimestamp(),
      });
    const retired = await workflows.getProcessDefinition(
      admin,
      operation.definitionId,
      db,
    );
    return {
      id: retired.id,
      action: "retired",
      status: retired.status,
      versionId: retired.active_version_id ?? null,
    };
  }

  if (operation.op === "card-states") {
    // The served card-state rule over the stored definitions, with every connector value present
    // and with RentVine's values missing. The rehearsal server configures every connector, so the
    // rendered page cannot show the second reading; this reads the same rule on the same records.
    const { computeSpaceCardState } = await import("@/lib/space-card-state");
    const { CONNECTORS } = await import("@/lib/connections/connector-catalog");
    const { launchSpaces } = await import("@/lib/spaces");
    const definitions = await workflows.listProcessDefinitions(admin, db);
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    const names = new Set(CONNECTORS.flatMap((connector) => connector.requiredConfig));
    const present = Object.fromEntries([...names].map((name) => [name, true]));
    const rentvine = CONNECTORS.find((connector) => connector.id === "rentvine");
    const missing = {
      ...present,
      ...Object.fromEntries(
        (rentvine?.requiredConfig ?? []).map((name) => [name, false]),
      ),
    };
    return Object.fromEntries(
      launchSpaces
        .filter((space) => RENEWAL_DEFINITIONS.includes(space.processDefinitionId ?? ""))
        .map((space) => [
          space.id,
          {
            present: computeSpaceCardState(space, byId, present),
            rentvineMissing: computeSpaceCardState(space, byId, missing),
          },
        ]),
    );
  }

  throw new Error("Unknown process harness operation.");
}

async function main() {
  assertRehearsal();
  const { getAdminFirestore } = await import("@/lib/firestore/admin");
  const operationText = process.env.ONE_PATH_PROCESS_OPERATION;
  let result: unknown;
  if (operationText) {
    result = await operate(JSON.parse(operationText) as Operation, getAdminFirestore());
  } else {
    const definitionId = process.env.ONE_PATH_PROCESS_DRAFT ?? "";
    if (!RENEWAL_DEFINITIONS.includes(definitionId))
      throw new Error(`No renewal process draft is named ${definitionId}.`);
    result = await seedDefinition(
      getAdminFirestore() as unknown as SeedFirestore,
      definitionId,
      { ownerUid: OWNER_UID, approverUid: APPROVER_UID },
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${String((error as Error)?.stack ?? error)}\n`);
    process.exit(1);
  },
);
