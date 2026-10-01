// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

// S145 step 4b (FV-30, 45, 53, 57, 62, 63, 79, 80, 85, 87): one Focus path through the real server.
// The real RenewalWorkspace records a staff action from the Focus pane; its request reaches the
// actual /api/lease-renewal/workspace route handlers, the real staff-record store runs on the
// Firestore emulator, and the page is then rebuilt from that store's readback. The capability check
// mirrors the session guard with the real role table. Remaining seams: the server page loader's live
// RentVine/Sheet reads (a sample lease workspace stands in), the session cookie, and Next's HTTP
// layer (the route handlers are called with standard Request objects). Synthetic values only.

const testState = vi.hoisted(() => ({
  db: null as Firestore | null,
  role: "Editor" as "Editor" | "Approver" | "Admin",
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => testState.db }));
vi.mock("@/lib/auth/session", async (original) => {
  const actual = await original<typeof import("@/lib/auth/session")>();
  const { can } = await import("@/lib/auth/roles");
  return {
    ...actual,
    requireCapabilityInSpace: async (capability: Parameters<typeof can>[1]) => {
      if (!can(testState.role, capability))
        throw new actual.AuthError("This role cannot perform this action.", 403);
      return {
        uid: "s145-staff",
        email: "s145-staff@pmikcmetro.com",
        hd: "pmikcmetro.com",
        role: testState.role,
      };
    },
  };
});
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/318",
  useSearchParams: () => new URLSearchParams(),
}));

import { GET, POST } from "@/app/api/lease-renewal/workspace/route";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  getRenewalWorkspace,
  listRenewalWorkspaceActivity,
  saveRenewalWorkspace,
  startRenewalCycle,
} from "@/lib/firestore/renewal-workspace";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import { actionFixture } from "../helpers/renewal-action-fixtures";

const projectId = "pmi-kc-kb-s145-focus-route-test";
const LEASE = "318";
const actor: AuthenticatedUser = {
  uid: "s145-staff",
  email: "s145-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown> | null;
  status?: number;
}
let calls: Call[] = [];

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s145-focus-route-${process.pid}`);
  db = getFirestore(app);
  testState.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  calls = [];
  testState.role = "Editor";
  router.refresh.mockClear();
  vi.stubGlobal("fetch", bridge);
});

afterEach(async () => {
  (await import("@testing-library/react")).cleanup();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

/** The page's own requests: the workspace route is the real handler; other reads are fixtures. */
async function bridge(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), "http://local.test");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body
    ? (JSON.parse(String(init.body)) as Record<string, unknown>)
    : null;
  const call: Call = { method, path: url.pathname, body };
  calls.push(call);
  let response: Response;
  if (url.pathname === "/api/lease-renewal/workspace") {
    const request = new Request(url, init);
    response = method === "GET" ? await GET(request) : await POST(request);
  } else if (url.pathname === "/api/lease-renewal/message-preparation")
    response = Response.json(preparation(url.searchParams.get("channel") ?? "owner"));
  else if (url.pathname === "/api/lease-renewal/document-handoff")
    response = Response.json({
      snapshot: null,
      blockers: [],
      readiness: { state: "connected" },
      catalogVersion: "fixture",
      attempts: [],
    });
  else response = Response.json({});
  call.status = response.status;
  return response;
}

function preparation(channel: string) {
  const inputs = emptyMessagePreparationInputs();
  return {
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId: null,
    saved: null,
    inputs,
    facts: {
      channel,
      names: [channel === "owner" ? "Fixture Owner" : "Fixture Tenant"],
      address: "318 Fixture Street",
      currentBaseRent: null,
      leaseEndDate: "2026-12-31",
      ownerTerms: null,
      range: null,
      suggestedRent: null,
      comps: [],
      trend: null,
      sparseCompsQualification: null,
      charges: inputs.charges,
      insuranceTransition: null,
      leaseOrigin: null,
      otherChargesComparison: null,
      informationForm: null,
      insuranceFlyer: null,
      rbpFlyer: null,
      signature: null,
      attachments: [],
    },
    sourceFingerprint: "a".repeat(64),
    needsReview: true,
    signatureMatchesActor: false,
    publication: { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
    previousDraftAttempts: [],
  };
}

async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function startCycle(): Promise<RenewalWorkspaceState> {
  const started = await startRenewalCycle(
    actor,
    {
      leaseId: LEASE,
      expectedCycleId: null,
      expectedRevision: 0,
      operationId: "5c8e2a1b-7d3f-4e6a-9b0c-000000000201",
      basis,
      reason: "Staff selected the reviewed current renewal cycle",
    },
    basis,
    db,
  );
  return started.state!;
}

/** Mount the real dashboard for lease 318 from a staff record, as the lease page does. */
async function mount(state: RenewalWorkspaceState | null) {
  const { createElement: h } = await import("react");
  const { render, screen, within } = await import("@testing-library/react");
  const { RenewalWorkspace } =
    await import("@/components/lease-renewal/RenewalWorkspace");
  const base = actionFixture({ manual: state }).workspace;
  const workspace = { ...base, summary: { ...base.summary, id: LEASE } };
  const view = render(
    h(RenewalWorkspace, { workspace, role: testState.role, manualState: state }),
  );
  await within(screen.getByRole("region", { name: "Owner approval" })).findByRole(
    "region",
    { name: "Owner message preparation" },
  );
  await settle();
  return view;
}

async function openFocus() {
  const { fireEvent, screen } = await import("@testing-library/react");
  fireEvent.click(screen.getByRole("button", { name: "Focus view" }));
  await settle();
}

async function paneHeading() {
  const { screen, within } = await import("@testing-library/react");
  return within(screen.getByRole("region", { name: "Focus view" })).getByRole("heading", {
    level: 2,
  });
}

async function fillOutreach(source: string) {
  const { fireEvent, within } = await import("@testing-library/react");
  const form = document.getElementById("renewal-manual-owner_outreach")!;
  fireEvent.change(within(form).getByLabelText("Owner outreach outcome"), {
    target: { value: "done" },
  });
  fireEvent.change(within(form).getByLabelText(/Source or channel/), {
    target: { value: source },
  });
  return form;
}

const writes = () => calls.filter((call) => call.method !== "GET");

describe("S145 Focus pane through the real workspace route and store", () => {
  it("records from Focus, reads back, reloads into Full view and derives the next task", async () => {
    const { fireEvent, screen, waitFor, within } = await import("@testing-library/react");
    const started = await startCycle();
    let view = await mount(started);
    expect(screen.getByRole("button", { name: "Full view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await openFocus();
    expect(await paneHeading()).toHaveTextContent("Owner outreach");

    // Typing without saving satisfies nothing: the dependents stay blocked and nothing is sent.
    const form = await fillOutreach("Owner phone call");
    const pane = screen.getByRole("region", { name: "Focus view" });
    fireEvent.click(within(pane).getByText(/^All renewal work/));
    expect(
      within(pane).getByRole("heading", { name: /^Starts after earlier work/ })
        .parentElement,
    ).toHaveTextContent("Record owner response and exact terms");
    expect(writes()).toEqual([]);

    // A double click sends one request; the pane advances only on the route's readback.
    const record = within(form).getByRole("button", { name: "Record owner outreach" });
    fireEvent.click(record);
    fireEvent.click(record);
    await waitFor(async () =>
      expect(await paneHeading()).toHaveTextContent(
        "Record owner response and exact terms",
      ),
    );
    expect(writes()).toHaveLength(1);
    const sent = writes()[0]!;
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({
      operation: "record",
      leaseId: LEASE,
      cycleId: started.cycleId,
      expectedRevision: started.revision,
      action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
    });
    const stored = (await getRenewalWorkspace(actor, LEASE, db))!;
    expect(stored.revision).toBe(started.revision + 1);
    expect(stored.activities.owner_outreach?.outcome).toBe("done");
    const events = (await listRenewalWorkspaceActivity(actor, LEASE, db)).length;

    // A retry of the same entry (same operation) is replayed once by the store, not applied again.
    const replay = await POST(
      new Request("http://local.test/api/lease-renewal/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sent.body),
      }),
    );
    expect(replay.status).toBe(200);
    expect((await replay.json()).duplicate).toBe(true);
    expect((await getRenewalWorkspace(actor, LEASE, db))!.revision).toBe(stored.revision);
    expect((await listRenewalWorkspaceActivity(actor, LEASE, db)).length).toBe(events);

    // Reload: the page is rebuilt from the store's readback. Full view shows the record, and Focus
    // derives the next task from persisted state without offering the finished one again.
    view.unmount();
    const reread = await (
      await GET(
        new Request(`http://local.test/api/lease-renewal/workspace?leaseId=${LEASE}`),
      )
    ).json();
    expect(reread.state.revision).toBe(stored.revision);
    view = await mount(reread.state);
    expect(screen.getByRole("button", { name: "Full view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      document.querySelector("#renewal-manual-owner_outreach > summary"),
    ).toHaveTextContent("Owner outreach : done");
    await openFocus();
    expect(await paneHeading()).toHaveTextContent(
      "Record owner response and exact terms",
    );
    const reloaded = screen.getByRole("region", { name: "Focus view" });
    expect(within(reloaded).getByText("Waiting on the owner.")).toBeVisible();
    fireEvent.click(within(reloaded).getByText(/^All renewal work/));
    expect(
      within(reloaded).getByRole("heading", { name: /^Done \(/ }).parentElement,
    ).toHaveTextContent("Owner outreach");
    view.unmount();
  });

  it("refuses a stale revision from Focus and keeps the entry and the task", async () => {
    const { fireEvent, screen, waitFor, within } = await import("@testing-library/react");
    const started = await startCycle();
    // Another operator records the outreach after this page was rendered.
    await saveRenewalWorkspace(
      { ...actor, uid: "s145-colleague" },
      {
        leaseId: LEASE,
        cycleId: started.cycleId,
        expectedRevision: started.revision,
        operationId: "5c8e2a1b-7d3f-4e6a-9b0c-000000000202",
        action: {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Colleague phone call",
        },
      },
      db,
    );
    const current = (await getRenewalWorkspace(actor, LEASE, db))!;
    await mount(started);
    await openFocus();
    expect(await paneHeading()).toHaveTextContent("Owner outreach");
    const form = await fillOutreach("My phone call");
    fireEvent.click(within(form).getByRole("button", { name: "Record owner outreach" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "Focus view" })).getByText(
          /Another operator changed this cycle/,
        ),
      ).toBeVisible(),
    );
    expect(writes()[0]!.status).toBe(409);
    expect(await paneHeading()).toHaveTextContent("Owner outreach");
    expect(within(form).getByLabelText(/Source or channel/)).toHaveValue("My phone call");
    const after = (await getRenewalWorkspace(actor, LEASE, db))!;
    expect(after.revision).toBe(current.revision);
    expect(after.activities.owner_outreach?.source).toBe("Colleague phone call");
  });
});
