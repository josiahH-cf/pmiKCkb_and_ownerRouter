// S238 R-S238-2: the isolated November/December renewal journey through the actual mounted pages,
// routes and stores. A real Chromium session drives the real Next dev server (Demo descriptor,
// local demo sign-in) against the Firestore emulator; RentVine reads come from the synthetic
// transport in renewal-novdec-journey-network.mjs and every other outbound connection is refused.
// After each browser action the harness reads the emulator directly and records the backend state.
// Synthetic people, leases, maps and records only. Run through scripts/run-renewal-novdec-journey.sh.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";

assert.match(process.cwd(), /^\/tmp\/pmi-kc-novdec-journey-[^/]+\/worktree$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const output = process.env.NOVDEC_JOURNEY_OUTPUT;
assert.ok(
  output?.startsWith(`${process.env.HOME}/.local/state/pmi-kc-novdec-journey-20261028/`),
);
const projectId = "pmi-kc-kb-novdec-journey-test";
const LEASE = "4821";
const PEOPLE = {
  sam: "00000000-0000-4000-8000-000000000001",
  riley: "00000000-0000-4000-8000-000000000002",
  avery: "00000000-0000-4000-8000-000000000003",
};
const ORIGINAL = "a".repeat(64);
const FILLED = "b".repeat(64);

const db = getFirestore(initializeApp({ projectId }, "novdec-journey"));
const results = [];
let shot = 0;
let activePage = null;

async function step(id, requirement, expected, run) {
  const startedAt = new Date().toISOString();
  try {
    const observed = await run();
    results.push({ id, requirement, expected, observed, result: "PASS", startedAt });
    console.log(`PASS ${id}`);
  } catch (error) {
    // Diagnostics for a failed step stay in private evidence: the page and its visible text.
    let diagnostic = null;
    try {
      diagnostic = await capture(activePage, `fail-${id}`);
      writeFileSync(
        join(output, `fail-${id}.txt`),
        (await activePage.locator("main, body").first().innerText()).slice(0, 4000),
      );
    } catch {
      // the page may be gone
    }
    results.push({
      id,
      requirement,
      expected,
      observed: String(error?.message ?? error).slice(0, 600),
      diagnostic,
      result: "FAIL",
      startedAt,
    });
    console.log(`FAIL ${id}: ${String(error?.message ?? error).slice(0, 300)}`);
  }
}

async function freePort() {
  return new Promise((resolve) => {
    const socket = createServer();
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const origin = `http://localhost:${port}`;
const serverLog = createWriteStream(join(output, "server.log"));
const preload = join(process.cwd(), "tests/browser/renewal-novdec-journey-network.mjs");
const serverHome = join(output, "server-home");
// S232 R-S232-5: naming a RentVine path here makes its read fail until the file is removed.
const outageFlag = join(output, "synthetic-rentvine-outage");
mkdirSync(serverHome, { recursive: true });
writeFileSync(
  join(serverHome, "synthetic-adc.json"),
  JSON.stringify({
    type: "authorized_user",
    client_id: "synthetic-journey",
    client_secret: "synthetic-journey",
    refresh_token: "synthetic-journey",
  }),
);
// Turbopack, as in production builds (webpack cannot bundle the desk's node: imports).
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
  {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    // A minimal environment: no inherited credential, account or provider variable reaches it.
    env: {
      PATH: process.env.PATH,
      // An empty home: no stored Google or provider credential can be read by the server.
      HOME: serverHome,
      GOOGLE_APPLICATION_CREDENTIALS: join(serverHome, "synthetic-adc.json"),
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      LANG: "en_US.UTF-8",
      TZ: "America/Chicago",
      NODE_OPTIONS: `--import ${preload}`,
      NOVDEC_JOURNEY_NETWORK_LOG: join(output, "network.jsonl"),
      NOVDEC_JOURNEY_OUTAGE_FLAG: outageFlag,
      NEXT_E2E_ISOLATED_BUILD: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      ENVIRONMENT_KIND: "demo",
      DATA_CONTEXT: "demo",
      LOCAL_DEMO_AUTH: "true",
      ASK_DEMO_MODE: "true",
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
      FIREBASE_PROJECT_ID: projectId,
      GOOGLE_CLOUD_PROJECT: projectId,
      CLOUDSDK_CONFIG: join(output, "no-gcloud-config"),
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENTVINE_API_KEY: "synthetic-journey-key",
      RENTVINE_API_SECRET: "synthetic-journey-secret",
      RENEWAL_SHEET_ID: "synthetic-journey-sheet",
      SHEETS_IMPERSONATE_SA: "synthetic-journey@example.invalid",
      SHEETS_DWD_SUBJECT: "synthetic-journey@pmikcmetro.com",
    },
  },
);
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);

async function waitForServer() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/sign-in`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("The local dev server did not become ready.");
}

async function capture(page, label, region = null) {
  shot += 1;
  const file = `${String(shot).padStart(2, "0")}-${label}.png`;
  if (region) await region.screenshot({ path: join(output, file) });
  else await page.screenshot({ path: join(output, file) });
  return file;
}

async function seedPacket(snapshotId) {
  await db
    .collection("lease_document_packet_snapshots")
    .doc(snapshotId)
    .set({
      leaseId: LEASE,
      transactionId: LEASE,
      packetContext: "renewal_extension",
      classificationEvidence: {},
      state: "Ready for preview",
      manifest: {
        packetContext: "renewal_extension",
        audience: "tenant",
        includedArtifacts: [
          {
            artifactId: "journey-extension",
            kind: "renewal_extension",
            label: "Renewal extension",
            contentHash: ORIGINAL,
            audience: "tenant",
            ruleResult: "Included",
            reason: "Synthetic journey packet",
          },
        ],
        excludedArtifacts: [],
        fields: [],
        participants: [],
        charges: [],
        animals: [],
      },
      blockers: [],
      catalogVersion: "synthetic-journey-catalog",
      ruleVersion: "synthetic-journey-rules",
      sourceVersions: [],
      payloadHash: "f".repeat(64),
      snapshot_id: snapshotId,
      snapshot_version: 1,
      actor_uid: "journey-seed",
      created_at: new Date().toISOString(),
    });
  const { createHash } = await import("node:crypto");
  const headId = createHash("sha256").update(`${LEASE}\u0000${LEASE}`).digest("hex");
  await db
    .collection("lease_document_packet_heads")
    .doc(headId)
    .set({
      lease_id: LEASE,
      transaction_id: LEASE,
      snapshot_id: snapshotId,
      snapshot_version: 1,
      payload_hash: "f".repeat(64),
    });
  // The approved filled copy (derived head id = preview hash of snapshot and artifact).
  const canonical = JSON.stringify({ artifactId: "journey-extension", snapshotId });
  const derivedHead = createHash("sha256").update(canonical).digest("hex");
  await db
    .collection("lease_document_derived_heads")
    .doc(derivedHead)
    .set({ id: `derived-${snapshotId}` });
  await db
    .collection("lease_document_derived_artifacts")
    .doc(`derived-${snapshotId}`)
    .set({
      snapshotId,
      artifactId: "journey-extension",
      outputHash: FILLED,
      approval: { outputHash: FILLED, actorUid: "journey-seed" },
    });
}

async function seedIntake() {
  await db
    .collection("lease_artifact_intake")
    .doc("renewal_extension")
    .set({
      kind: "renewal_extension",
      state: "approved",
      revision: 1,
      publication: {
        system: "s21_publication",
        reference: "publication:journey-extension-1",
        contentHash: ORIGINAL,
      },
      fieldMap: {
        schemaVersion: "artifact-field-map/v1",
        artifactKind: "renewal_extension",
        mapVersion: "renewal_extension-journey-v1",
        templateVersion: "publication:journey-extension-1",
        formFamily: "synthetic-family",
        formFamilyExtensionCompatible: true,
        audience: "tenant",
        allowedPacketContexts: ["renewal_extension"],
        fields: [
          {
            fieldId: "Rent",
            factKey: "renewal.approved_rent",
            meaning: "Approved monthly rent",
            required: true,
            multiplicity: "single",
            allowedSourceSystems: ["staff_recorded_owner_approval"],
          },
        ],
        signers: [
          {
            signerRole: "tenant",
            participantKind: "tenant",
            required: true,
            location: "Tenant signature",
          },
          {
            signerRole: "owner",
            participantKind: "owner",
            required: true,
            location: "Owner signature",
          },
        ],
        reviewNote: "SYNTHETIC journey review",
      },
      updated_at: new Date().toISOString(),
    });
}

async function returnedRecords() {
  const records = await db.collection("lease_document_returned_states").get();
  const activity = await db.collection("lease_document_returned_state_activity").get();
  return {
    records: records.docs.map((doc) => {
      const data = doc.data();
      return {
        snapshot_id: data.snapshot_id,
        kind: data.kind,
        document_content_hash: data.document_content_hash.slice(0, 12),
        revision: data.revision,
        sent: Boolean(data.sent_for_signature),
        signers: data.signers.map(
          (entry) => `${entry.person_id.slice(-2)}:${entry.signer_role}:${entry.status}`,
        ),
        updated_by_uid: data.updated_by_uid,
      };
    }),
    activity: activity.docs.map((doc) => ({
      change_kind: doc.get("change_kind"),
      actor_uid: doc.get("actor_uid"),
      recorded_at: Boolean(doc.get("recorded_at")),
      next_revision: doc.get("next_revision"),
    })),
  };
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    timezoneId: "America/Chicago",
  });
  // The browser may reach only this local server.
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);

  await step(
    "sign-in",
    "R-S238-2 local identity",
    "Local demo Editor session",
    async () => {
      await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
      const ok = await page.evaluate(async () => {
        const response = await fetch("/api/auth/demo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: "Editor" }),
        });
        return response.ok;
      });
      assert.ok(ok, "demo sign-in failed");
      return "Signed in as local-demo-editor";
    },
  );

  await step(
    "S232-desk-november",
    "R-S232 (S238 phase: inventory and next action)",
    "November 2026 shows lease 4821 and not the December lease",
    async () => {
      await page.goto(`${origin}/lease-renewal/live/desk`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator("table.renewal-table").first().waitFor();
      await page.getByText("Filter renewal date").first().click();
      await page.locator("#renewal-filter-month").fill("2026-11");
      await page.getByRole("button", { name: "Apply month" }).click();
      await page.waitForURL(/month=2026-11/);
      await page.locator("table.renewal-table").first().waitFor();
      const text = await page.locator("table.renewal-table").first().innerText();
      const file = await capture(page, "desk-november");
      assert.match(text, /Example Ct|Sam Example/);
      assert.doesNotMatch(text, /Sample Pl|Casey Example/);
      return `November filter applied (${file})`;
    },
  );

  await step(
    "S232-desk-december",
    "R-S232 (S238 phase: inventory and next action)",
    "December 2026 shows the December lease",
    async () => {
      await page.goto(`${origin}/lease-renewal/live/desk?month=2026-12`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator("table.renewal-table").first().waitFor();
      const text = await page.locator("table.renewal-table").first().innerText();
      const file = await capture(page, "desk-december");
      assert.match(text, /Sample Pl|Casey Example/);
      return `December filter applied (${file})`;
    },
  );

  await step(
    "S236-establish-cycle",
    "R-S236 binding prerequisite (S123/S154 first deliberate save)",
    "A staff activity save on the lease page establishes one cycle in the emulator",
    async () => {
      await page.goto(
        `${origin}/lease-renewal/live/desk/lease/${LEASE}?step=signatures-follow-up`,
        {
          waitUntil: "domcontentloaded",
        },
      );
      const select = page
        .locator("#renewal-manual-owner_outreach select, [id$='owner_outreach-outcome']")
        .first();
      if (!(await select.isVisible().catch(() => false))) {
        await page.locator("#renewal-manual-owner_outreach summary").first().click();
      }
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes("/api/lease-renewal/workspace") &&
          response.request().method() === "POST",
      );
      await select.selectOption("waiting");
      assert.equal((await saved).status(), 200, "the staff activity save was refused");
      const heads = await db.collection("lease_renewal_workspaces").get();
      const leaseBound = await db
        .collection("lease_renewal_lease_bound_workspaces")
        .get();
      const count = heads.size + leaseBound.size;
      assert.equal(count, 1, `expected one work record, found ${count}`);
      const file = await capture(page, "work-record-established");
      return `One work record in the emulator (${file})`;
    },
  );

  // Setup through the actual packet-inputs route (people and signer roles); the packet snapshot,
  // reviewed map and approved filled copy are seeded directly because no client content exists.
  await step(
    "S236-seed-packet",
    "Setup (not an observed outcome)",
    "Packet people, map and snapshot recorded",
    async () => {
      const saved = await page.evaluate(
        async ({ lease, people }) => {
          const response = await fetch("/api/lease-renewal/packet-inputs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              leaseId: lease,
              operationId: crypto.randomUUID(),
              people: {
                expectedRevision: 0,
                entries: [
                  ["Sam Example", people.sam, "tenant", 1, "TENANT"],
                  ["Riley Example", people.riley, "tenant", 2, "TENANT"],
                  ["Avery Owner", people.avery, "owner", 1, "LANDLORD"],
                ].map(([fullName, personId, signerRole, order, dotloopRole]) => ({
                  personId,
                  kind: "person",
                  fullName,
                  email: null,
                  emailBasis: null,
                  contactRef: null,
                  roles: [{ signerRole, order, dotloopRole }],
                })),
              },
            }),
          });
          return { status: response.status, body: await response.text() };
        },
        { lease: LEASE, people: PEOPLE },
      );
      assert.equal(saved.status, 200, saved.body.slice(0, 300));
      await seedIntake();
      await seedPacket("packet_journey_a");
      return "Packet inputs saved through the route; snapshot packet_journey_a seeded";
    },
  );

  const documentsUrl = `${origin}/lease-renewal/live/desk/lease/${LEASE}?step=document-packet`;
  const panel = () => page.locator('[data-renewal-field="returned-documents"]');
  // Full view keeps every section; Focus view shows one task at a time.
  const openDocuments = async () => {
    await page.goto(documentsUrl, { waitUntil: "domcontentloaded" });
    const full = page.getByRole("group", { name: "Lease view" }).getByRole("button", {
      name: "Full view",
      exact: true,
    });
    // A click before hydration does nothing, so retry until the switch reports Full view.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await full.click();
      if ((await full.getAttribute("aria-pressed")) === "true") break;
      await page.waitForTimeout(1000);
    }
    assert.equal(
      await full.getAttribute("aria-pressed"),
      "true",
      "Full view did not open",
    );
    await panel().waitFor();
    await panel().scrollIntoViewIfNeeded();
  };
  const docState = () => panel().locator('[data-renewal-field="returned-state"]').first();

  await step(
    "S236-prepared",
    "R-S236-1/3",
    "Returned documents shows the approved filled copy as Prepared",
    async () => {
      await openDocuments();
      const text = await panel().innerText();
      assert.match(text, /Approved filled copy · bbbbbbbbbbbb/);
      assert.equal(await docState().innerText(), "Prepared");
      return `Prepared (${await capture(page, "returned-prepared", panel())})`;
    },
  );

  const article = () =>
    panel().locator('[data-renewal-field="returned-document"]').first();
  const recordSigner = async (personId, role, observed) => {
    await article().getByLabel("Signer").selectOption(`${personId}:${role}`);
    await article().getByLabel("Result").selectOption("signed");
    await article().getByLabel("When you observed it").fill(observed);
    await article().getByLabel("Based on").selectOption("dotloop_observed");
    await article().getByLabel("Document name in Dotloop").fill("Renewal extension");
    await article().getByLabel("When you viewed it").fill(observed);
    await article().getByRole("button", { name: "Record signer result" }).click();
    await article()
      .getByText("Recorded by staff, not provider-verified.")
      .last()
      .waitFor();
  };

  await step(
    "S236-sent",
    "R-S236-2",
    "Recording Sent for signature shows Sent for signature with the staff label",
    async () => {
      await article().getByLabel("Sent for signature on").fill("2026-11-02T09:00");
      await article().getByLabel("How it was sent").fill("Dotloop, by staff");
      await article().getByRole("button", { name: "Record sent for signature" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-renewal-field="returned-state"]')?.textContent ===
          "Sent for signature",
      );
      const backend = await returnedRecords();
      assert.equal(backend.records.length, 1);
      assert.equal(backend.records[0].revision, 1);
      return {
        ui: "Sent for signature",
        backend,
        screenshot: await capture(page, "returned-sent", panel()),
      };
    },
  );

  await step(
    "S236-partial",
    "R-S236-3 (BEH-S236-1)",
    "One tenant signed: Partially signed, naming the other tenant and the owner",
    async () => {
      await recordSigner(PEOPLE.sam, "tenant", "2026-11-02T10:00");
      await page.waitForFunction(
        () =>
          document.querySelector('[data-renewal-field="returned-state"]')?.textContent ===
          "Partially signed",
      );
      const still = await panel()
        .locator('[data-renewal-field="still-must-sign"]')
        .innerText();
      assert.match(
        still,
        /Riley Example, tenant\. Ask Riley Example to sign the renewal extension in Dotloop/,
      );
      assert.match(still, /Avery Owner, owner/);
      return {
        ui: still.replace(/\s+/g, " "),
        backend: await returnedRecords(),
        screenshot: await capture(page, "returned-partial", panel()),
      };
    },
  );

  await step(
    "S236-signatures-refused",
    "R-S236-6 (AC-S236-4)",
    "Required signatures complete cannot be recorded Done while a signer is missing",
    async () => {
      const response = await page.evaluate(async (lease) => {
        const state = await (
          await fetch(`/api/lease-renewal/workspace?leaseId=${lease}`)
        ).json();
        const result = await fetch("/api/lease-renewal/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation: "record",
            leaseId: lease,
            cycleId: state.state.cycleId,
            expectedRevision: state.state.revision,
            operationId: crypto.randomUUID(),
            action: {
              kind: "activity",
              activity: "signatures",
              outcome: "done",
              source: "Journey check",
            },
          }),
        });
        return { status: result.status, body: await result.json() };
      }, LEASE);
      assert.equal(response.status, 409);
      assert.match(
        response.body.error,
        /Required signatures are not complete for the current packet/,
      );
      return response.body.error;
    },
  );

  await step(
    "S236-fully-executed",
    "R-S236-3 (BEH-S236-2)",
    "Every required signer recorded: Fully executed by staff record",
    async () => {
      await recordSigner(PEOPLE.riley, "tenant", "2026-11-02T10:05");
      await recordSigner(PEOPLE.avery, "owner", "2026-11-02T10:10");
      await page.waitForFunction(
        () =>
          document.querySelector('[data-renewal-field="returned-state"]')?.textContent ===
          "Fully executed",
      );
      const overall = await panel()
        .locator('[data-renewal-field="returned-overall"]')
        .innerText();
      assert.match(overall, /Fully executed by staff record, not provider-verified/);
      const dotloop = await panel()
        .locator('[data-renewal-field="dotloop-shows"]')
        .innerText();
      // The provider line never claims a signature or an executed packet.
      assert.match(dotloop, /^Dotloop/);
      assert.doesNotMatch(
        dotloop,
        /Fully executed|Partially signed|has signed|signed by/i,
      );
      const backend = await returnedRecords();
      assert.equal(backend.records[0].revision, 4);
      assert.equal(backend.activity.length, 4);
      assert.ok(
        backend.activity.every(
          (entry) => entry.actor_uid === "local-demo-editor" && entry.recorded_at,
        ),
      );
      return {
        ui: overall,
        dotloopLine: dotloop,
        backend,
        screenshot: await capture(page, "returned-executed", panel()),
      };
    },
  );

  await step(
    "S236-working-terms-changed",
    "R-S236-3/R-S236-6, PR #161 review (discussion_r4402147961)",
    "Saving the Working renewal rent after every signature keeps the packet but ends Fully executed and refuses Done",
    async () => {
      // The actual Working field on the lease page, saved on its own; the packet is not re-evaluated.
      const rent = page.getByLabel("Working monthly rent", { exact: true });
      await rent.scrollIntoViewIfNeeded();
      await rent.fill("1800");
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes("/api/lease-renewal/working-record") &&
          response.request().method() === "POST",
      );
      await rent.press("Tab");
      assert.equal((await saved).status(), 200);
      await openDocuments();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-renewal-field="returned-state"]')?.textContent ===
          "Sent for signature",
      );
      const notes = await panel()
        .locator('[data-renewal-field="returned-notes"]')
        .first()
        .innerText();
      assert.match(
        notes,
        /The Working renewal terms changed after this packet was prepared/,
      );
      assert.match(notes, /Signed before the terms changed/);
      const overall = await panel()
        .locator('[data-renewal-field="returned-overall"]')
        .innerText();
      assert.doesNotMatch(overall, /Fully executed/);
      const response = await page.evaluate(async (lease) => {
        const state = await (
          await fetch(`/api/lease-renewal/workspace?leaseId=${lease}`)
        ).json();
        const result = await fetch("/api/lease-renewal/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation: "record",
            leaseId: lease,
            cycleId: state.state.cycleId,
            expectedRevision: state.state.revision,
            operationId: crypto.randomUUID(),
            action: {
              kind: "activity",
              activity: "signatures",
              outcome: "done",
              source: "Journey check",
            },
          }),
        });
        return { status: result.status, body: await result.json() };
      }, LEASE);
      assert.equal(response.status, 409);
      assert.match(
        response.body.error,
        /The Working renewal terms changed after the current packet was prepared/,
      );
      // The packet and its version are unchanged and the earlier attestations stay as history.
      const backend = await returnedRecords();
      assert.equal(backend.records.length, 1);
      assert.equal(backend.records[0].snapshot_id, "packet_journey_a");
      assert.equal(backend.records[0].revision, 4);
      assert.equal(backend.activity.length, 4);
      const working = await db
        .collection("lease_renewal_working_records")
        .where("leaseId", "==", LEASE)
        .get();
      const termsRent = working.docs[0]?.get("fields")?.terms_rent;
      assert.equal(termsRent?.value, 1800);
      return {
        ui: { state: "Sent for signature", notes, overall },
        refusal: response.body.error,
        backend: {
          ...backend,
          workingTermsRent: { value: termsRent.value, revision: termsRent.revision },
        },
        screenshot: await capture(page, "returned-older-terms", panel()),
      };
    },
  );

  await step(
    "S236-stale-version-refused",
    "R-S236-4 (AC-S236-3), R-S238-2 stale concurrent save",
    "A form read before a re-evaluated packet is refused, and the earlier signatures never count",
    async () => {
      await seedPacket("packet_journey_b");
      await recordSigner(PEOPLE.sam, "tenant", "2026-11-03T09:00").catch(() => undefined);
      const alert = await article().getByRole("alert").innerText();
      assert.match(
        alert,
        /packet that is not this lease's current packet|packet changed/,
      );
      await openDocuments();
      const text = await panel().innerText();
      assert.match(text, /Signed an earlier version, not current/);
      assert.equal(await docState().innerText(), "Prepared");
      return {
        refusal: alert,
        afterReload: "Prepared with the earlier-version note",
        screenshot: await capture(page, "returned-superseded", panel()),
      };
    },
  );

  await step(
    "S235-shown-state",
    "R-S235-4",
    "The packet state reads the recorded approval of the current snapshot",
    async () => {
      const state = await page
        .locator('[data-renewal-field="packet-shown-state"]')
        .first()
        .innerText();
      assert.equal(state, "Approved");
      return `Packet state ${state}`;
    },
  );

  await step(
    "S235-selection-freshness",
    "R-S235-6",
    "The readiness view names the missing Dotloop selection",
    async () => {
      const text = await page
        .locator('[data-renewal-field="dotloop-selection-freshness"]')
        .innerText();
      assert.match(text, /No Dotloop profile and template are saved/);
      return text.replace(/\s+/g, " ");
    },
  );

  // S233 (R-S233-9): the renewal composer and hub for the December lease's owner, in a second
  // browser set to another zone. Saves are app records in the emulator; Schedule is refused by the
  // local Demo descriptor before any mailbox or provider is constructed.
  const west = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    timezoneId: "America/Los_Angeles",
  });
  await west.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  const hub = await west.newPage();
  hub.setDefaultTimeout(60_000);
  hub.setDefaultNavigationTimeout(180_000);
  // Every non-read request the hub page sends: its path and communication action.
  const hubWrites = [];
  hub.on("request", (request) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return;
    let action = null;
    try {
      action = JSON.parse(request.postData() ?? "{}").action ?? null;
    } catch {
      // not a JSON body
    }
    hubWrites.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      action,
    });
  });
  const sequencePost = (action) =>
    hub.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/gmail-hub/sequences" &&
        response.request().method() === "POST" &&
        JSON.parse(response.request().postData() ?? "{}").action === action,
    );
  const ownerSequences = async () =>
    (
      await db
        .collection("gmail_communication_sequences")
        .where("context.entityId", "==", "5001")
        .get()
    ).docs;
  let communicationId = null;

  await step(
    "S233-composer-save",
    "R-S233-9 (save), AC-S233-7",
    "The owner composer opens addressed to the source owner and Save draft records one app draft",
    async () => {
      activePage = hub;
      await hub.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
      const ok = await hub.evaluate(async () => {
        const response = await fetch("/api/auth/demo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: "Editor" }),
        });
        return response.ok;
      });
      assert.ok(ok, "demo sign-in failed");
      const first = sequencePost("save");
      await hub.goto(`${origin}/gmail-hub?compose=renewal_owner&lease=5001`, {
        waitUntil: "domcontentloaded",
      });
      assert.equal((await first).status(), 200, "the composer's first save was refused");
      const composer = hub.getByRole("region", {
        name: "Workflow communication composer",
      });
      await composer.getByText("To: jordan.owner@example.invalid").waitFor();
      const subject = composer.getByLabel("Initial message subject");
      await subject.fill("Renewal for Sample Place: owner review");
      const saved = sequencePost("save");
      await composer.getByRole("button", { name: "Save draft" }).click();
      assert.equal((await saved).status(), 200, "Save draft was refused");
      const docs = await ownerSequences();
      assert.equal(docs.length, 1, `expected one communication, found ${docs.length}`);
      const record = docs[0];
      communicationId = record.id;
      assert.equal(record.get("state"), "draft");
      assert.equal(record.get("context.purpose"), "renewal_owner");
      assert.equal(
        record.get("initial.subject"),
        "Renewal for Sample Place: owner review",
      );
      assert.equal(record.get("authorization") ?? null, null);
      const file = await capture(hub, "s233-composer-saved");
      return {
        state: record.get("state"),
        version: record.get("version"),
        recipientShown: "jordan.owner@example.invalid (synthetic, reserved domain)",
        screenshot: file,
      };
    },
  );

  await step(
    "S233-schedule-panel",
    "R-S233-9 (Schedule panel), R-S233-6, AC-S233-6, BEH-S233-5",
    "In a browser set to Los Angeles the Timezone defaults to America/Chicago, and November 1, 2026 1:30 AM states the first 1:30, CDT",
    async () => {
      const browserZone = await hub.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      assert.equal(browserZone, "America/Los_Angeles");
      const composer = hub.getByRole("region", {
        name: "Workflow communication composer",
      });
      // Schedule stays disabled while the target names a blocker; say which one instead of waiting.
      const blockers = await composer
        .locator("p[role='status']")
        .filter({ hasText: /Notice|Recipient|before drafting|source read/ })
        .allInnerTexts();
      assert.deepEqual(
        blockers,
        [],
        `the composer shows a blocker: ${blockers.join(" | ")}`,
      );
      await composer.getByRole("button", { name: "Schedule", exact: true }).click();
      const zone = await composer.getByLabel("Timezone").inputValue();
      assert.equal(zone, "America/Chicago");
      await composer.getByLabel("First date").fill("2026-11-01");
      await composer.getByLabel("Local time").fill("01:30");
      const note = (
        await composer.locator('[data-communication-field="first-send"]').innerText()
      ).replace(/\s+/g, " ");
      assert.equal(
        note,
        "First send: Nov 1, 2026, 1:30 AM CDT (America/Chicago). Nov 1, 2026, 1:30 AM happens twice in America/Chicago when clocks fall back; this schedule uses the first one, Nov 1, 2026, 1:30 AM CDT.",
      );
      const file = await capture(hub, "s233-schedule-panel");
      return { browserZone, defaultZone: zone, note, screenshot: file };
    },
  );

  await step(
    "S233-schedule-refused",
    "R-S233-9 (refusal under the local effect-refused descriptor), AC-S233-7",
    "Schedule messages is refused by the Demo descriptor; the record stays an unauthorized draft with no occurrence",
    async () => {
      const composer = hub.getByRole("region", {
        name: "Workflow communication composer",
      });
      const before = (await ownerSequences())[0];
      const refused = sequencePost("schedule");
      await composer.getByRole("button", { name: "Schedule messages" }).click();
      const response = await refused;
      const body = await response.json();
      assert.equal(response.status(), 409);
      assert.equal(body.code, "environment_context_not_allowed");
      const alert = await composer.getByRole("alert").innerText();
      assert.match(alert, /A Live provider action requires the Production environment/);
      const after = (await ownerSequences())[0];
      assert.equal(after.get("state"), "draft");
      assert.equal(after.get("version"), before.get("version"));
      assert.equal(after.get("authorization") ?? null, null);
      assert.equal(after.get("nextDueAtMs") ?? null, null);
      const occurrences = await db
        .collection("gmail_communication_occurrences")
        .where("sequenceId", "==", communicationId)
        .get();
      assert.equal(occurrences.size, 0, "an occurrence was claimed");
      // The composer re-reads the recorded state after a refusal, then is editable again.
      await hub.waitForFunction(() => {
        const save = [...document.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === "Save draft",
        );
        return save !== undefined && !save.disabled;
      });
      await composer.getByRole("alert").scrollIntoViewIfNeeded();
      const file = await capture(hub, "s233-schedule-refused");
      return {
        status: response.status(),
        code: body.code,
        shown: alert.replace(/\s+/g, " "),
        state: after.get("state"),
        version: after.get("version"),
        occurrences: occurrences.size,
        screenshot: file,
      };
    },
  );

  await step(
    "S233-labels-after-refresh",
    "R-S233-9 (labels after refresh), R-S233-5 (hub worker health)",
    "After a reload the hub lists the draft with its labels and the worker health; the communication reopens as a draft with nothing sent",
    async () => {
      await hub.goto(`${origin}/gmail-hub`, { waitUntil: "domcontentloaded" });
      const health = hub.locator('[data-communication-field="worker-health"]');
      await health.waitFor();
      const healthText = (await health.innerText()).split("\n").filter(Boolean);
      assert.deepEqual(healthText, [
        "Worker: no run recorded yet.",
        "No scheduled message is past due.",
        "No open communication needs an incoming check.",
      ]);
      await hub.getByRole("tab", { name: "Drafts" }).click();
      const row = hub
        .locator("article.ui-card")
        .filter({ hasText: "Open communication" });
      await row.first().waitFor();
      assert.equal(await row.count(), 1);
      const rowText = (await row.innerText()).replace(/\s+/g, " ");
      assert.match(rowText, /Draft in app · 0 confirmed messages · local-demo-editor@/);
      await row.getByRole("button", { name: "Open communication" }).click();
      const composer = hub.getByRole("region", {
        name: "Workflow communication composer",
      });
      const state = composer.locator("[data-communication-state]");
      await state.waitFor();
      assert.equal(await state.getAttribute("data-communication-state"), "draft");
      assert.equal(await state.innerText(), "Draft in app");
      const status = await composer
        .getByRole("status")
        .filter({ hasText: "confirmed" })
        .first()
        .innerText();
      assert.match(status, /0 confirmed messages/);
      const composerText = await composer.innerText();
      assert.doesNotMatch(composerText, /Accepted by Gmail|Confirmed send/);
      const file = await capture(hub, "s233-after-refresh");
      return {
        health: healthText,
        row: rowText.slice(0, 160),
        state: await state.innerText(),
        status: status.replace(/\s+/g, " "),
        screenshot: file,
      };
    },
  );

  await step(
    "S233-attempts-unavailable",
    "R-S233-1 attempt-read freshness (coordinator follow-through, 2026-10-29)",
    "When a save applies but its attempt read is unavailable, the composer keeps the save, says the attempts could not be loaded, and recovers on Check recorded status",
    async () => {
      activePage = hub;
      const composer = hub.getByRole("region", {
        name: "Workflow communication composer",
      });
      const before = (await ownerSequences())[0];
      // Models the route's failed attempt read on one save response. The save itself runs on the
      // server unchanged; only the response's attempts are replaced by the unavailable statement
      // the route now sends, since nothing in the served app can fault that read on its own.
      let modeled = 0;
      await hub.route("**/api/gmail-hub/sequences", async (route) => {
        if (route.request().method() !== "POST" || modeled > 0) return route.continue();
        modeled += 1;
        const response = await route.fetch();
        const body = await response.json();
        delete body.attempts;
        delete body.attemptsTruncated;
        body.attemptsUnavailable = true;
        await route.fulfill({ response, json: body });
      });
      const subject = composer.getByLabel("Initial message subject");
      await subject.fill("Renewal for Sample Place: owner review, second pass");
      const saved = sequencePost("save");
      await composer.getByRole("button", { name: "Save draft" }).click();
      assert.equal((await saved).status(), 200, "the save was refused");
      const note = composer.locator('[data-communication-field="attempts-unavailable"]');
      await note.waitFor();
      const shown = (await note.innerText()).replace(/\s+/g, " ");
      assert.match(
        shown,
        /^Message attempts could not be loaded just now\. None were recorded at the last successful check, .+, and a newer one may not be listed\. The recorded state above is current\. Use Check recorded status to load them again\.$/,
      );
      const after = (await ownerSequences())[0];
      assert.equal(
        after.get("version"),
        before.get("version") + 1,
        "the save did not apply",
      );
      assert.equal(
        after.get("initial.subject"),
        "Renewal for Sample Place: owner review, second pass",
      );
      const file = await capture(
        hub,
        "s233-attempts-unavailable",
        composer.locator('[data-communication-field="message-evidence"]'),
      );
      await hub.unroute("**/api/gmail-hub/sequences");
      // An ordinary status read loads the attempts again and the note goes away; nothing resends.
      const status = hub.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/gmail-hub/sequences" &&
          response.request().method() === "GET" &&
          new URL(response.url()).searchParams.get("id") === communicationId,
      );
      await composer.getByRole("button", { name: "Check recorded status" }).click();
      const fresh = await (await status).json();
      assert.ok(Array.isArray(fresh.attempts), "the status read returned no attempts");
      await hub.waitForFunction(
        () =>
          !document.querySelector('[data-communication-field="attempts-unavailable"]'),
      );
      const final = (await ownerSequences())[0];
      assert.equal(final.get("version"), after.get("version"), "the status read wrote");
      return {
        shown,
        version: { before: before.get("version"), after: after.get("version") },
        modeledResponses: modeled,
        recoveredAttempts: fresh.attempts.length,
        screenshot: file,
      };
    },
  );

  await step(
    "S233-no-provider-call",
    "AC-S233-7 (zero mutation attempts, no provider call)",
    "The S233 phase made app saves and one refused Schedule only; no Gmail request was attempted",
    async () => {
      const log = existsSync(join(output, "network.jsonl"))
        ? readFileSync(join(output, "network.jsonl"), "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [];
      const gmail = log.filter((entry) =>
        /gmail|^www\.googleapis\.com$/.test(String(entry.host ?? "")),
      );
      assert.equal(gmail.length, 0, "a Gmail request was attempted");
      const actions = hubWrites
        .filter((entry) => entry.path === "/api/gmail-hub/sequences")
        .map((entry) => entry.action);
      assert.ok(actions.length >= 2, "expected the saves and the refused Schedule");
      assert.deepEqual(
        [...new Set(actions)].sort(),
        ["save", "schedule"],
        `unexpected communication actions: ${actions.join(", ")}`,
      );
      assert.equal(actions.filter((action) => action === "schedule").length, 1);
      const other = hubWrites.filter(
        (entry) =>
          entry.path !== "/api/gmail-hub/sequences" && entry.path !== "/api/auth/demo",
      );
      assert.deepEqual(other, [], "an unexpected write request left the page");
      return {
        gmailRequests: gmail.length,
        communicationActions: actions,
        otherWrites: other.length,
      };
    },
  );

  // S234 (R-S238-2 owner approval phase): the December lease's Working terms, the owner's approval
  // with who, how and when, and its coverage after a later Working save. App records only.
  const OWNER_LEASE = "5001";
  const openOwnerDecision = async () => {
    activePage = page;
    await page.goto(
      `${origin}/lease-renewal/live/desk/lease/${OWNER_LEASE}?step=owner-decision`,
      { waitUntil: "domcontentloaded" },
    );
    const full = page.getByRole("group", { name: "Lease view" }).getByRole("button", {
      name: "Full view",
      exact: true,
    });
    // A click before hydration does nothing, so retry until the switch reports Full view.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await full.click();
      if ((await full.getAttribute("aria-pressed")) === "true") break;
      await page.waitForTimeout(1000);
    }
    assert.equal(
      await full.getAttribute("aria-pressed"),
      "true",
      "Full view did not open",
    );
    await page.locator("#renewal-working-terms").waitFor();
  };
  const workingSave = () =>
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/lease-renewal/working-record") &&
        response.request().method() === "POST",
    );
  const ownerWorkspace = () =>
    page.evaluate(async (lease) => {
      const response = await fetch(`/api/lease-renewal/workspace?leaseId=${lease}`);
      return { status: response.status, body: await response.json() };
    }, OWNER_LEASE);
  const workingTerms = async () => {
    const docs = (
      await db
        .collection("lease_renewal_working_records")
        .where("leaseId", "==", OWNER_LEASE)
        .get()
    ).docs;
    const fields = docs[0]?.get("fields") ?? {};
    return Object.fromEntries(
      ["terms_rent", "terms_effective_date", "terms_end_date"].map((key) => [
        key,
        fields[key] ? { value: fields[key].value, revision: fields[key].revision } : null,
      ]),
    );
  };
  const coverageLine = () =>
    page.locator('[data-renewal-field="owner-approval-coverage"]').first();

  await step(
    "S234-working-terms",
    "R-S234-4 (Working-only terms), R-S238-2 owner approval phase",
    "The December lease's Working rent, effective date and end date save through the lease page's own fields",
    async () => {
      await openOwnerDecision();
      const rent = page.getByLabel("Working monthly rent", { exact: true });
      await rent.scrollIntoViewIfNeeded();
      await rent.fill("1450");
      const rentSaved = workingSave();
      await rent.press("Tab");
      assert.equal((await rentSaved).status(), 200, "the Working rent was not saved");
      // A complete date saves on change.
      for (const [label, value] of [
        ["Working effective date", "2027-01-01"],
        ["Working term end date", "2027-12-31"],
      ]) {
        const saved = workingSave();
        await page.getByLabel(label, { exact: true }).fill(value);
        assert.equal((await saved).status(), 200, `${label} was not saved`);
      }
      const terms = await workingTerms();
      assert.equal(terms.terms_rent?.value, 1450);
      assert.equal(terms.terms_effective_date?.value, "2027-01-01");
      assert.equal(terms.terms_end_date?.value, "2027-12-31");
      return { working: terms };
    },
  );

  await step(
    "S234-approval-recorded",
    "R-S234-1 (who, how and when), R-S234-3 (coverage)",
    "Approved records the owner of record, a written channel with its reference and the time; coverage names the Working terms and revisions",
    async () => {
      const response = page.getByLabel("Owner response", { exact: true });
      await response.scrollIntoViewIfNeeded();
      await response.selectOption("approved_terms");
      const form = page.locator('[data-renewal-field="owner-approval-evidence"]');
      await form.waitFor();
      await form
        .getByLabel("Who approved")
        .selectOption({ label: "Jordan Owner (owner of record)" });
      await form.getByLabel("How they approved").selectOption("written");
      await form.getByLabel("Channel").fill("Text message");
      await form.getByLabel("Reference").fill("Synthetic journey approval 1");
      // An approval time cannot be in the future.
      await form.getByLabel("When they approved").fill("2026-10-27T10:00");
      const recorded = page.waitForResponse(
        (r) =>
          r.url().includes("/api/lease-renewal/workspace") &&
          r.request().method() === "POST",
      );
      await form.getByRole("button", { name: "Record approval" }).click();
      assert.equal((await recorded).status(), 200, "Record approval was refused");
      const line = page.locator('[data-renewal-field="owner-approval-recorded"]');
      await line.waitFor();
      const shown = await line.innerText();
      assert.equal(
        shown,
        "Approved by Jordan Owner through Text message (reference Synthetic journey approval 1), on 10/27/2026, 10:00 AM CDT.",
      );
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-renewal-field="owner-approval-coverage"]')
            ?.getAttribute("data-coverage") === "current",
      );
      const coverage = await coverageLine().innerText();
      assert.match(
        coverage,
        /^Owner approval covers the Working terms, \$1,450\.00 per month from .+ \(Working revisions: rent \d+, effective date \d+, end date \d+\)/,
      );
      const workspace = await ownerWorkspace();
      assert.equal(workspace.status, 200);
      const owner = workspace.body.state?.ownerResponse;
      assert.equal(owner?.outcome, "approved_terms");
      assert.equal(owner?.approval?.party?.kind, "owner");
      assert.equal(owner?.approval?.channel?.kind, "written");
      assert.equal(owner?.approval?.channel?.reference, "Synthetic journey approval 1");
      const file = await capture(page, "s234-approval-recorded", line);
      return {
        shown,
        coverage,
        backend: {
          outcome: owner.outcome,
          party: owner.approval.party.kind,
          channel: owner.approval.channel.kind,
          occurredAt: owner.approval.occurredAt,
          approvedTerms: owner.approvedWorkingTerms ?? owner.terms ?? null,
        },
        screenshot: file,
      };
    },
  );

  await step(
    "S234-approval-stale",
    "R-S234-3 (per-field coverage), R-S234-5",
    "Saving a new Working rent after the approval keeps the approval as recorded and names the rent as no longer covered",
    async () => {
      const before = await ownerWorkspace();
      const rent = page.getByLabel("Working monthly rent", { exact: true });
      await rent.scrollIntoViewIfNeeded();
      await rent.fill("1475");
      const saved = workingSave();
      await rent.press("Tab");
      assert.equal((await saved).status(), 200, "the new Working rent was not saved");
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-renewal-field="owner-approval-coverage"]')
            ?.getAttribute("data-coverage") === "terms_changed",
      );
      const coverage = await coverageLine().innerText();
      assert.match(coverage, /^Owner approval no longer covers: .*rent.* changed\./);
      const after = await ownerWorkspace();
      assert.deepEqual(
        after.body.state?.ownerResponse?.approval,
        before.body.state?.ownerResponse?.approval,
        "the recorded approval changed",
      );
      const terms = await workingTerms();
      assert.equal(terms.terms_rent?.value, 1475);
      const file = await capture(page, "s234-approval-stale", coverageLine());
      // The desk row states the same coverage in its short form.
      await page.goto(`${origin}/lease-renewal/live/desk?month=2026-12`, {
        waitUntil: "domcontentloaded",
      });
      const row = page.locator("table.renewal-table tr").filter({ hasText: "Sample Pl" });
      await row.first().waitFor();
      const desk = await row
        .first()
        .locator('[data-renewal-field="owner-approval-coverage"]')
        .innerText();
      assert.equal(desk, "Owner approval no longer covers: rent changed.");
      assert.ok(coverage.startsWith(desk), "the desk and the lease page disagree");
      return {
        coverage,
        desk,
        working: terms,
        approvalUnchanged: true,
        screenshot: file,
      };
    },
  );

  // S237: the December lease's source panels after the S234 phase's Working terms. The Demo
  // descriptor refuses every source update before it reads a request, so no preview exists here;
  // previews, claims, receipts and readback are covered by the emulator tests.
  const differences = () => page.locator('[data-renewal-field="remaining-differences"]');
  const differenceRow = (label) =>
    differences().locator("[data-renewal-difference]").filter({ hasText: label }).first();
  await step(
    "S237-differences-live",
    "R-S237-5 (what still differs), PR #163 review (recomputed from the live Working record)",
    "A Working rent save changes What still differs to the new Working rent beside the RentVine read, without a reload",
    async () => {
      await openOwnerDecision();
      const rentRow = differenceRow("Rent charge");
      await rentRow.waitFor();
      const before = (await rentRow.innerText()).replace(/\s+/g, " ");
      assert.match(before, /\$1475\.00; source /);
      // The marker survives only if the page is not reloaded.
      await page.evaluate(() => {
        window.__novdecNoReload = true;
      });
      const rent = page.getByLabel("Working monthly rent", { exact: true });
      await rent.scrollIntoViewIfNeeded();
      await rent.fill("1500");
      const saved = workingSave();
      await rent.press("Tab");
      assert.equal((await saved).status(), 200, "the Working rent was not saved");
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll(
            '[data-renewal-field="remaining-differences"] [data-renewal-difference]',
          ),
        ].some(
          (row) =>
            row.textContent?.includes("Rent charge") &&
            row.textContent.includes("$1500.00"),
        ),
      );
      assert.equal(
        await page.evaluate(() => window.__novdecNoReload === true),
        true,
        "the page reloaded",
      );
      const after = (await rentRow.innerText()).replace(/\s+/g, " ");
      assert.match(after, /\$1500\.00; source .+\. Differs\.$/);
      const endDate = (await differenceRow("Lease end date").innerText()).replace(
        /\s+/g,
        " ",
      );
      const terms = await workingTerms();
      assert.equal(terms.terms_rent?.value, 1500);
      const file = await capture(page, "s237-differences-live", differences());
      return { before, after, endDate, working: terms.terms_rent, screenshot: file };
    },
  );

  await step(
    "S237-scope-statement",
    "R-S237-6 (one scope statement)",
    "The lease page states once what confirmed source updates change, what stays manual and what is unsupported",
    async () => {
      const scope = page.locator('[data-renewal-field="source-update-scope"]');
      assert.equal(
        await scope.count(),
        1,
        "the scope statement is not shown exactly once",
      );
      const text = (await scope.innerText()).replace(/\s+/g, " ");
      assert.match(
        text,
        /^Confirmed updates change lease dates and recurring charges in RentVine and the recognized renewal fields on the Sheet\. .+ stay manual\. .+no Sheet row deletion\.$/,
      );
      return text;
    },
  );

  await step(
    "S237-preview-refused",
    "R-S237 scoped refusal under the effect-refused descriptor, R-S238-2",
    "Saving a RentVine update proposal is refused before any read, with its reason shown; no proposal is stored and nothing reaches RentVine",
    async () => {
      const panel = page.locator('[aria-labelledby="rentvine-updates-title"]');
      await panel
        .getByText("Prepare a RentVine update proposal", { exact: true })
        .click();
      await panel.getByLabel("New end date (YYYY-MM-DD)").fill("2027-12-31");
      // The panel's own status read is refused the same way before anything is prepared.
      const statusRefusal = (await panel.getByRole("alert").innerText()).replace(
        /\s+/g,
        " ",
      );
      assert.match(
        statusRefusal,
        /A Live provider action requires the Production environment/,
      );
      await page.waitForFunction(
        () =>
          !document.querySelector(
            '[aria-labelledby="rentvine-updates-title"] [aria-busy="true"]',
          ),
      );
      const [response] = await Promise.all([
        page.waitForResponse(
          (reply) =>
            new URL(reply.url()).pathname === "/api/lease-renewal/rentvine-writeback" &&
            reply.request().method() === "POST",
        ),
        panel
          .getByRole("button", { name: "Save proposal from fresh RentVine state" })
          .click(),
      ]);
      assert.equal(response.status(), 409);
      const body = await response.json();
      assert.equal(body.error_type, "environment_context_not_allowed");
      const notice = panel.getByText(
        /A Live provider action requires the Production environment/,
      );
      await notice.first().waitFor();
      const shown = (await notice.first().innerText()).replace(/\s+/g, " ");
      const stored = await db
        .collection("renewal_writeback_proposals")
        .doc(OWNER_LEASE)
        .get();
      assert.equal(stored.exists, false, "a proposal was stored");
      const file = await capture(page, "s237-preview-refused", panel);
      return {
        statusRefusal,
        status: response.status(),
        code: body.error_type,
        shown,
        proposalStored: stored.exists,
        screenshot: file,
      };
    },
  );

  await step(
    "S238-role-refusal",
    "R-S238-2 role refusal, R-S232-5 (resolved by an Admin)",
    "An Editor following the Admin timing-basis destination is refused and returned to the Dashboard, and the Admin write is refused with nothing recorded",
    async () => {
      activePage = page;
      await page.goto(`${origin}/admin#admin-move-out-timing-basis`, {
        waitUntil: "domcontentloaded",
      });
      // The page guard sends a refused staff account through sign-in (forbidden) to the Dashboard.
      await page.waitForURL((url) => url.pathname === "/");
      assert.equal(await page.locator("#admin-move-out-timing-basis").count(), 0);
      const refused = await page.evaluate(async () => {
        const response = await fetch("/api/admin/move-out-timing-basis", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        return response.status;
      });
      assert.equal(refused, 403);
      const saved = await db.collection("lease_renewal_move_out_timing_basis").get();
      assert.equal(saved.size, 0, "a timing basis was recorded");
      return {
        landedOn: new URL(page.url()).pathname + new URL(page.url()).search,
        adminWrite: refused,
        timingBasisRecords: saved.size,
      };
    },
  );

  // S232 R-S232-5: each issue names what it needs and who resolves it, and its link reaches what
  // resolves it. An Admin in a second browser follows the move-out lease's issues in turn.
  const office = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    timezoneId: "America/Chicago",
  });
  const admin = await office.newPage();
  const NOTICE_LEASE = "6001";
  const leaseView = (target, name) =>
    target.getByRole("group", { name: "Lease view" }).getByRole("button", {
      name,
      exact: true,
    });
  const openLease = async (target, leaseId, view = "Full view") => {
    await target.goto(`${origin}/lease-renewal/live/desk/lease/${leaseId}`, {
      waitUntil: "domcontentloaded",
    });
    const button = leaseView(target, view);
    // A click before hydration does nothing, so retry until the switch reports the view.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await button.click();
      if ((await button.getAttribute("aria-pressed")) === "true") break;
      await target.waitForTimeout(1000);
    }
    assert.equal(
      await button.getAttribute("aria-pressed"),
      "true",
      `${view} did not open`,
    );
  };
  // Full view lists the issues under "Other current issues"; Focus lists them as lease notes.
  const ISSUE_LISTS = {
    full: "details.renewal-issues",
    focus: 'ul.renewal-focus-advisories[aria-label="Lease notes"]',
  };
  const issueAt = (target, kind, linkName, list = "full") =>
    target
      .locator(`${ISSUE_LISTS[list]} [data-renewal-issue-resolve-at="${kind}"]`)
      .filter({ hasText: linkName })
      .first();
  const expandIssues = async (target) => {
    const disclosure = target.locator(ISSUE_LISTS.full).first();
    await disclosure.waitFor({ state: "attached" });
    if (!(await disclosure.evaluate((element) => element.open)))
      await disclosure.locator("summary").click();
  };
  const issueRow = async (issue) =>
    (await issue.locator("xpath=..").innerText()).replace(/\s+/g, " ");
  // Notice evidence shows only from an admitted source read inside the lease export's 60-second
  // freshness window; past it the page asks for its own refresh, which this uses as staff would.
  const STALE_NOTICE = "Notice evidence needs a fresh admitted source read";
  const admittedNotice = async (target) => {
    if (!(await target.getByText(STALE_NOTICE).count())) return false;
    await target.waitForFunction(
      () =>
        document.getElementById("renewal-refresh")?.hasAttribute("disabled") === false,
      null,
      { timeout: 90_000 },
    );
    await target.locator("#renewal-refresh").click();
    await target.waitForFunction(
      (text) => !document.body.innerText.includes(text),
      STALE_NOTICE,
      { timeout: 90_000 },
    );
    return true;
  };
  const inView = (target, id) =>
    target.waitForFunction((elementId) => {
      const box = document.getElementById(elementId)?.getBoundingClientRect();
      return Boolean(box && box.height > 0 && box.top < innerHeight && box.bottom > 0);
    }, id);

  await step(
    "S232-resolver-sign-in",
    "R-S232-5, R-S238-2 local identity",
    "A local demo Admin session in a second browser",
    async () => {
      activePage = admin;
      await admin.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
      const ok = await admin.evaluate(async () => {
        const response = await fetch("/api/auth/demo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: "Admin" }),
        });
        return response.ok;
      });
      assert.ok(ok, "demo Admin sign-in failed");
      return "Signed in as the local demo Admin";
    },
  );

  await step(
    "S232-resolver-page",
    "R-S232-5 (resolved on another page, by an Admin)",
    "With no timing basis recorded, the move-out lease's notice timing names the reviewed basis and an Admin, and its link opens the Admin timing panel",
    async () => {
      activePage = admin;
      await openLease(admin, NOTICE_LEASE);
      const refreshedForNotice = await admittedNotice(admin);
      await expandIssues(admin);
      const issue = issueAt(admin, "page", "Record the timing basis in Admin");
      await issue.waitFor();
      const row = await issueRow(issue);
      assert.match(row, /Notice timing: Cannot determine\./);
      assert.match(
        row,
        /Needs: The reviewed move-out timing basis\. Resolved by: an Admin \(record the reviewed timing basis\)\./,
      );
      const link = issue.getByRole("link", { name: "Record the timing basis in Admin" });
      assert.equal(await link.getAttribute("href"), "/admin#admin-move-out-timing-basis");
      await link.click();
      await admin.waitForURL(
        (url) => url.pathname === "/admin" && url.hash === "#admin-move-out-timing-basis",
      );
      const panel = admin.locator("#admin-move-out-timing-basis");
      await panel.getByText("Notice timing basis is not reviewed.").waitFor();
      await inView(admin, "admin-move-out-timing-basis");
      const file = await capture(admin, "s232-resolver-admin-panel", panel);
      const landed = new URL(admin.url());
      return {
        row,
        refreshedForNotice,
        landedOn: landed.pathname + landed.hash,
        screenshot: file,
      };
    },
  );

  await step(
    "S232-resolver-basis-recorded",
    "R-S232-5 (the Admin resolves it); a synthetic record in the isolated emulator, not the production C05 recording",
    "The Admin records the decided basis (lease end, calendar days, 30) on that panel and the panel confirms version 1",
    async () => {
      activePage = admin;
      const panel = admin.locator("#admin-move-out-timing-basis");
      await panel.getByLabel("Compare the notice against").selectOption("lease_end");
      await panel
        .getByLabel("Counting rule")
        .selectOption("calendar_days_target_minus_notice_v1");
      await panel.getByLabel("Threshold in calendar days").fill("30");
      await panel
        .getByLabel("Who confirmed this basis, and where")
        .fill(
          "Synthetic journey basis in the isolated emulator; not the production record",
        );
      const [saved] = await Promise.all([
        admin.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/admin/move-out-timing-basis" &&
            response.request().method() === "PATCH",
        ),
        panel.getByRole("button", { name: "Record reviewed basis" }).click(),
      ]);
      assert.equal(saved.status(), 200, "the basis was refused");
      await panel.getByText("Recorded. Every desk read now uses version 1.").waitFor();
      const records = await db.collection("lease_renewal_move_out_timing_basis").get();
      assert.equal(records.size, 1);
      const record = records.docs[0].data();
      assert.equal(record.target_kind, "lease_end");
      assert.equal(record.counting_rule, "calendar_days_target_minus_notice_v1");
      assert.equal(record.threshold_days, 30);
      return {
        version: record.version,
        target: record.target_kind,
        rule: record.counting_rule,
        thresholdDays: record.threshold_days,
      };
    },
  );

  await step(
    "S232-resolver-control",
    "R-S232-5 (resolved by a control on this lease)",
    "With the basis recorded, the notice reads below the 30-day basis and its link moves to the non-renewal handoff on the same page",
    async () => {
      activePage = admin;
      await openLease(admin, NOTICE_LEASE);
      const refreshedForNotice = await admittedNotice(admin);
      await expandIssues(admin);
      const issue = issueAt(admin, "control", "Open the non-renewal handoff");
      await issue.waitFor();
      const row = await issueRow(issue);
      assert.match(row, /Notice timing: .*30-day/);
      assert.match(
        row,
        /Needs: A review of a notice given inside the timing threshold\. Resolved by: Staff review\./,
      );
      const link = issue.getByRole("link", { name: "Open the non-renewal handoff" });
      assert.equal(
        await link.getAttribute("href"),
        "#renewal-manual-non_renewal_handoff",
      );
      await link.click();
      await admin.waitForFunction(
        () => location.hash === "#renewal-manual-non_renewal_handoff",
      );
      await inView(admin, "renewal-manual-non_renewal_handoff");
      const file = await capture(
        admin,
        "s232-resolver-handoff",
        admin.locator("#renewal-manual-non_renewal_handoff"),
      );
      return {
        row,
        refreshedForNotice,
        hash: new URL(admin.url()).hash,
        screenshot: file,
      };
    },
  );

  await step(
    "S232-resolver-focus",
    "R-S232-5 (Focus states the same input, resolver and link)",
    "Focus view states the same need, resolver and link for the notice timing as the issue list",
    async () => {
      activePage = admin;
      await openLease(admin, NOTICE_LEASE);
      const refreshedForNotice = await admittedNotice(admin);
      await expandIssues(admin);
      const full = await issueRow(
        issueAt(admin, "control", "Open the non-renewal handoff"),
      );
      // The same page load, switched to Focus view, so both views read one render.
      const focusView = leaseView(admin, "Focus view");
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await focusView.click();
        if ((await focusView.getAttribute("aria-pressed")) === "true") break;
        await admin.waitForTimeout(1000);
      }
      assert.equal(
        await focusView.getAttribute("aria-pressed"),
        "true",
        "Focus view did not open",
      );
      const issue = issueAt(admin, "control", "Open the non-renewal handoff", "focus");
      await issue.waitFor();
      const focus = (await issue.innerText()).replace(/\s+/g, " ");
      assert.ok(full.includes(focus), `Focus differs from the issue list: ${focus}`);
      assert.equal(
        await issue
          .getByRole("link", { name: "Open the non-renewal handoff" })
          .getAttribute("href"),
        "#renewal-manual-non_renewal_handoff",
      );
      return { focus, refreshedForNotice };
    },
  );

  await step(
    "S232-resolver-refresh",
    "R-S232-5 (an issue the next source read resolves)",
    "During a synthetic RentVine status-table outage the notice safety issue says the app reads it on the next refresh; once RentVine answers, the page's own refresh reads it and the issue clears",
    async () => {
      activePage = admin;
      const STATUSES = "leases/statuses";
      const ISSUE = "move_out:approval_safety_unavailable";
      const statusReads = () =>
        readFileSync(join(output, "network.jsonl"), "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .filter(
            (entry) =>
              entry.served === "rentvine" &&
              entry.path.replace(/\/$/, "").endsWith(STATUSES),
          );
      const issue = () =>
        admin.locator(`${ISSUE_LISTS.full} [data-renewal-issue-id="${ISSUE}"]`).first();
      await openLease(admin, NOTICE_LEASE);
      let row;
      writeFileSync(outageFlag, STATUSES);
      try {
        // The page's own refresh forces a source read, which meets the outage.
        await admin.locator("#renewal-refresh").click();
        await issue().waitFor({ state: "attached", timeout: 90_000 });
        await expandIssues(admin);
        row = (await issue().innerText()).replace(/\s+/g, " ");
      } finally {
        rmSync(outageFlag, { force: true });
      }
      assert.match(row, /Needs: The lease's move-out status\./);
      assert.match(
        row,
        /Outside the app: Check the lease's notice and move-out status in RentVine; the app reads it on the next refresh\./,
      );
      const outageReads = statusReads().filter((entry) => entry.outage).length;
      assert.ok(outageReads > 0, "no status-table read met the outage");
      const file = await capture(admin, "s232-resolver-refresh", issue());
      // The control stays busy until a new snapshot time arrives or its 60-second bound passes;
      // during the outage the read time does not change, so it may end with its own retry note.
      const refresh = admin.locator("#renewal-refresh");
      await admin.waitForFunction(
        () =>
          document.getElementById("renewal-refresh")?.hasAttribute("disabled") === false,
        null,
        { timeout: 90_000 },
      );
      const refreshNote = await refresh
        .locator("xpath=..")
        .getByRole("alert")
        .allInnerTexts();
      // The refresh route also allows one forced read per operator every 10 seconds.
      await admin.waitForTimeout(11_000);
      const answered = statusReads().filter((entry) => !entry.outage).length;
      await refresh.click();
      await admin.waitForFunction(
        (selector) => !document.querySelector(selector),
        `${ISSUE_LISTS.full} [data-renewal-issue-id="${ISSUE}"]`,
        { timeout: 90_000 },
      );
      await admin
        .getByText(/Move-out initiated in RentVine: Notice Given/)
        .first()
        .waitFor();
      const after = statusReads().filter((entry) => !entry.outage).length;
      assert.ok(after > answered, "the refresh read nothing");
      return {
        row,
        outageReads,
        refreshNote,
        statusReadsAfterRefresh: after - answered,
        screenshot: file,
      };
    },
  );

  await step(
    "network-boundary",
    "R-S238-2 effect-refused descriptor",
    "No request left the machine except the refused ones logged",
    async () => {
      const log = existsSync(join(output, "network.jsonl"))
        ? readFileSync(join(output, "network.jsonl"), "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [];
      const served = log.filter((entry) => entry.served === "rentvine").length;
      const refused = log.filter((entry) => entry.refused);
      const writes = refused.filter((entry) => entry.refused === "rentvine_write");
      assert.equal(writes.length, 0, "a RentVine write was attempted");
      return {
        syntheticRentvineReads: served,
        refusedOutbound: [
          ...new Set(
            refused.map((entry) => `${entry.refused}:${entry.host ?? entry.path}`),
          ),
        ],
      };
    },
  );
} finally {
  writeFileSync(join(output, "results.json"), JSON.stringify(results, null, 2));
  await browser?.close().catch(() => undefined);
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // already stopped
  }
}
const failed = results.filter((entry) => entry.result !== "PASS");
console.log(`journey: ${results.length - failed.length} PASS, ${failed.length} FAIL`);
process.exit(failed.length ? 1 : 0);
