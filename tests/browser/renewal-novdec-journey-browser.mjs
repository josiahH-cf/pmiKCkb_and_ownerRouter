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
