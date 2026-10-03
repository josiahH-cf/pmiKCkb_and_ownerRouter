// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { RenewalWorkStatusControl } from "@/components/lease-renewal/RenewalWorkStatusControl";
import {
  RENEWAL_WORK_STATUS_LABELS,
  type RenewalWorkStatusActivity,
  type RenewalWorkStatusRecord,
} from "@/lib/lease-renewal/work-status";
import type { RenewalStatusNote } from "@/lib/lease-renewal/work-status-notes";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S164: the running Status log. Notes sit beneath the status control and save by themselves with
// no status change; one composed note stays one entry across saves and retries; another note is a
// distinct entry; the status and every earlier entry stay exactly as recorded. The fake below
// answers like the app-owned route (revisions, operation ids, server actor and time). Synthetic.

const PARTY_FILTER_KEY = Buffer.alloc(32, 7).toString("base64url");
const LEASE = "lease-318-cedar-7";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ME = { uid: "op-1", label: "op1@pmikcmetro.com" };

function statusRecord(
  overrides: Partial<RenewalWorkStatusRecord> = {},
): RenewalWorkStatusRecord {
  return {
    schemaVersion: "renewal-work-status/v1",
    leaseId: LEASE,
    revision: 1,
    status: "waiting_on_owner_response",
    recordedAt: "2026-09-16T23:10:00.000Z",
    recordedByUid: "op-2",
    recordedByLabel: "op2@pmikcmetro.com",
    cycleId: null,
    eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000001",
    ...overrides,
  };
}

function activity(
  record: RenewalWorkStatusRecord,
  previousStatus: RenewalWorkStatusActivity["previousStatus"] = null,
): RenewalWorkStatusActivity {
  return {
    id: record.eventId,
    leaseId: record.leaseId,
    revision: record.revision,
    previousStatus,
    status: record.status,
    recordedAt: record.recordedAt,
    recordedByUid: record.recordedByUid,
    recordedByLabel: record.recordedByLabel,
    cycleId: record.cycleId,
  };
}

function savedNote(overrides: Partial<RenewalStatusNote> = {}): RenewalStatusNote {
  return {
    schemaVersion: "renewal-status-note/v1",
    leaseId: LEASE,
    noteId: "3c5e7a90-1d2f-4b6a-9c8e-000000000009",
    revision: 1,
    text: "Tenant asked about a twelve month term.",
    recordedAt: "2026-09-20T14:00:00.000Z",
    recordedByUid: "op-2",
    recordedByLabel: "op2@pmikcmetro.com",
    updatedAt: "2026-09-20T14:00:00.000Z",
    eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000009",
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

interface Init {
  method?: string;
  body?: string;
}

/** An in-memory stand-in for the status route: same revisions, operation ids and attribution. */
function fakeRoute(
  seed: {
    record?: RenewalWorkStatusRecord | null;
    history?: RenewalWorkStatusActivity[];
    notes?: RenewalStatusNote[];
  } = {},
) {
  const state = {
    record: seed.record ?? null,
    history: seed.history ?? [],
    notes: seed.notes ?? [],
    operations: new Map<string, string>(),
    minute: 0,
  };
  const now = () => {
    state.minute += 1;
    return new Date(Date.UTC(2026, 9, 2, 15, state.minute)).toISOString();
  };
  async function handle(_url: string, init?: Init) {
    if (!init?.method || init.method === "GET")
      return jsonResponse(200, {
        record: state.record,
        history: state.history,
        notes: state.notes,
      });
    const raw = init.body ?? "{}";
    const body = JSON.parse(raw) as Record<string, unknown>;
    const operationId = String(body.operationId);
    if (body.kind === "note") {
      const existing = state.notes.find((entry) => entry.noteId === body.noteId) ?? null;
      if (state.operations.has(operationId)) {
        if (state.operations.get(operationId) !== raw)
          return jsonResponse(409, { error: "This note save changed." });
        return jsonResponse(200, { note: existing, notes: state.notes, duplicate: true });
      }
      if ((existing?.revision ?? 0) !== body.expectedRevision)
        return jsonResponse(409, { error: "This note was saved from another place." });
      const at = now();
      const next: RenewalStatusNote = {
        schemaVersion: "renewal-status-note/v1",
        leaseId: LEASE,
        noteId: String(body.noteId),
        revision: (existing?.revision ?? 0) + 1,
        text: String(body.text),
        recordedAt: existing?.recordedAt ?? at,
        recordedByUid: existing?.recordedByUid ?? ME.uid,
        recordedByLabel: existing?.recordedByLabel ?? ME.label,
        updatedAt: at,
        eventId: operationId,
      };
      state.notes = [...state.notes.filter((e) => e.noteId !== next.noteId), next];
      state.operations.set(operationId, raw);
      return jsonResponse(200, { note: next, notes: state.notes, duplicate: false });
    }
    if (state.operations.has(operationId))
      return jsonResponse(200, {
        record: state.record,
        history: state.history,
        duplicate: true,
      });
    if ((state.record?.revision ?? 0) !== body.expectedRevision)
      return jsonResponse(409, { error: "Another operator saved this status." });
    const next = statusRecord({
      revision: (state.record?.revision ?? 0) + 1,
      status: body.status as RenewalWorkStatusRecord["status"],
      recordedAt: now(),
      recordedByUid: ME.uid,
      recordedByLabel: ME.label,
      eventId: operationId,
    });
    state.history = [...state.history, activity(next, state.record?.status ?? null)];
    state.record = next;
    state.operations.set(operationId, raw);
    return jsonResponse(200, {
      record: next,
      history: state.history,
      duplicate: false,
    });
  }
  return { state, handle };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.RENEWAL_DESK_PARTY_FILTER_KEY = PARTY_FILTER_KEY;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete process.env.RENEWAL_DESK_PARTY_FILTER_KEY;
});

function calls(method: "GET" | "POST") {
  return fetchMock.mock.calls.filter(
    (call) => ((call[1] as Init | undefined)?.method ?? "GET") === method,
  );
}

function posted(call: unknown[]) {
  return JSON.parse((call[1] as Init).body ?? "{}") as Record<string, unknown>;
}

function notePosts() {
  return calls("POST")
    .map(posted)
    .filter((body) => body.kind === "note");
}

function statusPosts() {
  return calls("POST")
    .map(posted)
    .filter((body) => body.kind !== "note");
}

function renderControl(
  read: {
    record?: RenewalWorkStatusRecord | null;
    history?: RenewalWorkStatusActivity[];
    notes?: RenewalStatusNote[];
  } = {},
  canEdit = true,
) {
  return render(
    <RenewalWorkStatusControl
      canEdit={canEdit}
      leaseId={LEASE}
      read={{
        available: true,
        record: read.record ?? null,
        history: read.history ?? [],
        notes: read.notes ?? [],
        currentCycleId: null,
      }}
    />,
  );
}

function noteBox() {
  return screen.getByLabelText("Add a note") as HTMLTextAreaElement;
}

function statusSelect() {
  return screen.getByLabelText("Work status (recorded by staff)") as HTMLSelectElement;
}

function logEntries(kind?: "note" | "status") {
  const log = screen.getByTestId("renewal-status-log");
  return within(log)
    .queryAllByRole("listitem")
    .filter((item) => !kind || item.getAttribute("data-status-log-kind") === kind);
}

async function typeAndLeave(text: string) {
  fireEvent.change(noteBox(), { target: { value: text } });
  fireEvent.blur(noteBox());
}

function noteStatus() {
  return screen.getByTestId("renewal-status-note-autosave");
}

function workspace() {
  const value = getRenewalLeaseWorkspace(LEASE);
  if (!value) throw new Error("sample lease missing");
  return value;
}

describe("S164 running Status log", () => {
  it("BEH-S164-1/BEH-S164-2/BEH-S164-3/BEH-S164-5/AC-S164-1: a note is entered beneath the status control and saves with the status unchanged, shown with who and when beside the earlier history", async () => {
    const record = statusRecord();
    const server = fakeRoute({ record, history: [activity(record)] });
    fetchMock.mockImplementation(server.handle);
    render(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace()}
        workStatus={{
          available: true,
          record,
          history: [activity(record)],
          notes: [],
          currentCycleId: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lease information" }));
    const info = screen.getByRole("complementary", { name: "Lease information" });
    const select = within(info).getByLabelText("Work status (recorded by staff)");
    const box = within(info).getByLabelText("Add a note");
    // The note entry follows the status control, and the log follows the note entry.
    expect(
      select.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const log = within(info).getByTestId("renewal-status-log");
    expect(
      box.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Every existing status choice is still offered once, and the earlier entry is in the log.
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(Object.values(RENEWAL_WORK_STATUS_LABELS));
    expect(within(log).getAllByRole("listitem")).toHaveLength(1);
    const before = within(log).getByRole("listitem").textContent;
    expect(before).toContain("Waiting on owner response");
    expect(before).toContain("op2@pmikcmetro.com");

    // No status was chosen or changed: the note alone saves.
    fireEvent.change(box, {
      target: { value: "Owner asked for a call back next week." },
    });
    fireEvent.blur(box);
    await waitFor(() =>
      expect(within(info).getByTestId("renewal-status-note-autosave")).toHaveTextContent(
        "Saved",
      ),
    );
    expect(calls("POST")).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/lease-renewal/work-status");
    expect(posted(fetchMock.mock.calls[0])).toEqual({
      kind: "note",
      leaseId: LEASE,
      noteId: expect.stringMatching(UUID),
      text: "Owner asked for a call back next week.",
      expectedRevision: 0,
      operationId: expect.stringMatching(UUID),
    });
    expect(select).toHaveValue("waiting_on_owner_response");
    expect(within(info).getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Waiting on owner response",
    );
    const entries = within(log).getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    const note = entries.find(
      (item) => item.getAttribute("data-status-log-kind") === "note",
    )!;
    expect(note).toHaveTextContent("Owner asked for a call back next week.");
    expect(note).toHaveTextContent("op1@pmikcmetro.com");
    expect(note.querySelector("time")).toHaveAttribute(
      "dateTime",
      server.state.notes[0].recordedAt,
    );
    // The earlier status entry reads exactly as it did.
    const status = entries.find(
      (item) => item.getAttribute("data-status-log-kind") === "status",
    )!;
    expect(status.textContent).toBe(before);
    // The same control is still there after switching the lease view.
    const focus = screen.queryByRole("button", { name: "Focus view" });
    if (focus) {
      fireEvent.click(focus);
      expect(within(info).getByLabelText("Add a note")).toHaveValue(
        "Owner asked for a call back next week.",
      );
      expect(within(info).getByTestId("renewal-status-log")).toBeInTheDocument();
    }
  });

  it("BEH-S164-4: a status choice saves by itself through the route with no Save or approval step, and the saved value, recorder and log entry then show", async () => {
    const server = fakeRoute();
    fetchMock.mockImplementation(server.handle);
    renderControl();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();

    fireEvent.change(statusSelect(), { target: { value: "preparing_tenant_offer" } });
    await waitFor(() =>
      expect(screen.getByTestId("renewal-work-status-autosave")).toHaveTextContent(
        "Saved",
      ),
    );
    expect(statusPosts()).toEqual([
      {
        leaseId: LEASE,
        status: "preparing_tenant_offer",
        expectedRevision: 0,
        operationId: expect.stringMatching(UUID),
      },
    ]);
    const saved = screen.getByTestId("renewal-work-status-saved");
    expect(saved).toHaveTextContent("Preparing tenant offer");
    expect(saved).toHaveTextContent("op1@pmikcmetro.com");
    expect(saved).toHaveAttribute("data-work-status", "preparing_tenant_offer");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(logEntries("status")).toHaveLength(1);
    expect(logEntries("status")[0]).toHaveTextContent("Preparing tenant offer");
    expect(logEntries("status")[0]).toHaveTextContent("Not recorded");
    // The select kept focusable state: saving never disables or replaces it.
    expect(statusSelect()).toBeEnabled();
    expect(statusSelect()).toHaveValue("preparing_tenant_offer");
  });

  it("BEH-S164-6/AC-S164-2: continuing one note across several saves updates the one entry and never adds another", async () => {
    const server = fakeRoute();
    fetchMock.mockImplementation(server.handle);
    renderControl();

    await typeAndLeave("Called the owner");
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
    await typeAndLeave("Called the owner, left a voicemail");
    await waitFor(() => expect(notePosts()).toHaveLength(2));
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
    await typeAndLeave("Called the owner, left a voicemail.\nWill try again Friday.");
    await waitFor(() => expect(notePosts()).toHaveLength(3));
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));

    const bodies = notePosts();
    expect(new Set(bodies.map((body) => body.noteId)).size).toBe(1);
    expect(bodies.map((body) => body.expectedRevision)).toEqual([0, 1, 2]);
    expect(new Set(bodies.map((body) => body.operationId)).size).toBe(3);
    expect(server.state.notes).toHaveLength(1);
    expect(logEntries("note")).toHaveLength(1);
    expect(logEntries("note")[0]).toHaveTextContent("Will try again Friday.");
    // Its place and first attribution are the first save's.
    expect(logEntries("note")[0].querySelector("time")).toHaveAttribute(
      "dateTime",
      server.state.notes[0].recordedAt,
    );
    // Leaving the field again with nothing new saves nothing.
    fireEvent.blur(noteBox());
    expect(notePosts()).toHaveLength(3);
  });

  it("BEH-S164-6/BEH-S164-8: typing sends nothing per keystroke; the note saves once after a pause", async () => {
    const server = fakeRoute();
    fetchMock.mockImplementation(server.handle);
    render(
      <RenewalWorkStatusControl
        canEdit
        leaseId={LEASE}
        noteIdleMs={40}
        read={{
          available: true,
          record: null,
          history: [],
          notes: [],
          currentCycleId: null,
        }}
      />,
    );
    for (const text of ["K", "Ke", "Key", "Keys", "Keys returned"]) {
      fireEvent.change(noteBox(), { target: { value: text } });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
    expect(notePosts()).toHaveLength(1);
    expect(notePosts()[0]).toMatchObject({ text: "Keys returned", expectedRevision: 0 });
    expect(logEntries("note")).toHaveLength(1);
    expect(noteBox()).toHaveValue("Keys returned");
  });

  it("BEH-S164-7: starting another note from the same note area makes a distinct entry and leaves the first as saved", async () => {
    const server = fakeRoute();
    fetchMock.mockImplementation(server.handle);
    renderControl();
    expect(screen.queryByRole("button", { name: "Start another note" })).toBeNull();

    await typeAndLeave("Owner approved the new rent by phone.");
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
    fireEvent.click(screen.getByRole("button", { name: "Start another note" }));
    await waitFor(() => expect(noteBox()).toHaveValue(""));
    // Starting it sent nothing: there is no separate save or approval action.
    expect(notePosts()).toHaveLength(1);
    await typeAndLeave("Tenant confirmed the new term.");
    await waitFor(() => expect(notePosts()).toHaveLength(2));
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));

    const [first, second] = notePosts();
    expect(second.noteId).not.toBe(first.noteId);
    expect(second.expectedRevision).toBe(0);
    expect(server.state.notes).toHaveLength(2);
    const notes = logEntries("note");
    expect(notes).toHaveLength(2);
    expect(notes.map((item) => item.getAttribute("data-status-log-id")).sort()).toEqual(
      [String(first.noteId), String(second.noteId)].sort(),
    );
    const firstEntry = notes.find(
      (item) => item.getAttribute("data-status-log-id") === first.noteId,
    )!;
    expect(firstEntry).toHaveTextContent("Owner approved the new rent by phone.");
    expect(server.state.notes.find((n) => n.noteId === first.noteId)?.revision).toBe(1);

    // Emptying the note area also ends the composition: the saved note stays, the next is new.
    fireEvent.change(noteBox(), { target: { value: "" } });
    fireEvent.blur(noteBox());
    await typeAndLeave("Keys returned.");
    await waitFor(() => expect(notePosts()).toHaveLength(3));
    expect(notePosts()[2].noteId).not.toBe(second.noteId);
    expect(notePosts()[2].expectedRevision).toBe(0);
    await waitFor(() => expect(logEntries("note")).toHaveLength(3));
    expect(server.state.notes.find((n) => n.noteId === second.noteId)?.text).toBe(
      "Tenant confirmed the new term.",
    );
  });

  it("BEH-S164-8/AC-S164-2: empty input creates no note, and a delayed or failed save keeps the typed text with no log entry", async () => {
    renderControl();
    await typeAndLeave("");
    await typeAndLeave("   \n  ");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logEntries()).toHaveLength(0);
    expect(noteStatus()).not.toHaveTextContent(/Saved|Saving|failed/i);

    // Delayed: the text stays available while the save is still out, and no entry is claimed.
    let release!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await typeAndLeave("Waiting on the insurance flyer.");
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saving note"));
    expect(noteBox()).toHaveValue("Waiting on the insurance flyer.");
    expect(noteBox()).toBeEnabled();
    expect(logEntries()).toHaveLength(0);
    expect(noteStatus()).not.toHaveTextContent("Saved");

    // Failed: the entry stays in the note area with a retry, and the log shows nothing new.
    release(jsonResponse(500, { error: "The note store did not answer." }));
    await waitFor(() =>
      expect(noteStatus()).toHaveTextContent("The note store did not answer."),
    );
    expect(noteStatus()).toHaveTextContent("Your entry is kept");
    expect(noteBox()).toHaveValue("Waiting on the insurance flyer.");
    expect(logEntries()).toHaveLength(0);
    expect(within(noteStatus()).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(calls("POST")).toHaveLength(1);
  });

  it("BEH-S164-9/AC-S164-2: a lost response is retried under the same operation and still yields one entry", async () => {
    const server = fakeRoute();
    // The save lands, but its response never arrives.
    fetchMock.mockImplementationOnce(async (url: string, init?: Init) => {
      await server.handle(url, init);
      throw new Error("network");
    });
    fetchMock.mockImplementation(server.handle);
    renderControl();

    await typeAndLeave("Sent the comparison to the owner.");
    await waitFor(() => expect(noteStatus()).toHaveTextContent("did not finish"));
    expect(noteBox()).toHaveValue("Sent the comparison to the owner.");
    fireEvent.click(within(noteStatus()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));

    const [first, retry] = notePosts();
    expect(notePosts()).toHaveLength(2);
    expect(retry).toEqual(first);
    expect(server.state.notes).toHaveLength(1);
    expect(server.state.notes[0].revision).toBe(1);
    expect(logEntries("note")).toHaveLength(1);
  });

  it("BEH-S164-9: a status save that landed without a usable answer is recognized on readback, not reported as someone else's change", async () => {
    const server = fakeRoute();
    // The status is stored, but the answer is an error (the server could not read it back).
    fetchMock.mockImplementationOnce(async (url: string, init?: Init) => {
      await server.handle(url, init);
      return jsonResponse(409, { error: "The saved status could not be read back." });
    });
    fetchMock.mockImplementation(server.handle);
    renderControl();

    fireEvent.change(statusSelect(), { target: { value: "waiting_on_signatures" } });
    const status = screen.getByTestId("renewal-work-status-autosave");
    await waitFor(() => expect(status).toHaveTextContent("Saved"));
    expect(status).not.toHaveTextContent(/Changed elsewhere|failed/i);
    expect(screen.getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Waiting on signatures",
    );
    expect(statusPosts()).toHaveLength(1);
    expect(calls("GET")).toHaveLength(1);
    expect(server.state.history).toHaveLength(1);
    expect(logEntries("status")).toHaveLength(1);
  });

  it("BEH-S164-9/AC-S164-2: text typed after a lost response continues the same entry instead of adding one or stopping on a conflict", async () => {
    const server = fakeRoute();
    fetchMock.mockImplementationOnce(async (url: string, init?: Init) => {
      await server.handle(url, init);
      throw new Error("network");
    });
    fetchMock.mockImplementation(server.handle);
    renderControl();

    await typeAndLeave("Sent the comparison");
    await waitFor(() => expect(noteStatus()).toHaveTextContent("did not finish"));
    await typeAndLeave("Sent the comparison to the owner by email.");
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));

    // The saved state was read back, recognized as this composition's own save, and continued.
    expect(calls("GET")).toHaveLength(1);
    const bodies = notePosts();
    expect(new Set(bodies.map((body) => body.noteId)).size).toBe(1);
    expect(bodies[bodies.length - 1]).toMatchObject({
      text: "Sent the comparison to the owner by email.",
      expectedRevision: 1,
    });
    expect(server.state.notes).toHaveLength(1);
    expect(server.state.notes[0]).toMatchObject({
      revision: 2,
      text: "Sent the comparison to the owner by email.",
    });
    expect(logEntries("note")).toHaveLength(1);
    expect(noteStatus()).not.toHaveTextContent(/Changed elsewhere/);
  });

  it("BEH-S164-9: a failed status save is retried under the same operation and records one status change", async () => {
    const server = fakeRoute();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: "The status store did not answer." }),
    );
    fetchMock.mockImplementation(server.handle);
    renderControl();

    fireEvent.change(statusSelect(), { target: { value: "verifying_lease_and_rent" } });
    const status = screen.getByTestId("renewal-work-status-autosave");
    await waitFor(() =>
      expect(status).toHaveTextContent("The status store did not answer."),
    );
    // The choice stays selected; the saved value is still the truth shown beside it.
    expect(statusSelect()).toHaveValue("verifying_lease_and_rent");
    expect(screen.getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Not recorded",
    );
    fireEvent.click(within(status).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(status).toHaveTextContent("Saved"));
    const [first, retry] = statusPosts();
    expect(retry).toEqual(first);
    expect(server.state.history).toHaveLength(1);
    expect(logEntries("status")).toHaveLength(1);
  });

  it("BEH-S164-10/AC-S164-3: earlier entries keep their text, actor and time through new notes, and the log offers no edit or delete", async () => {
    const record = statusRecord();
    const theirs = savedNote();
    const server = fakeRoute({
      record,
      history: [activity(record)],
      notes: [theirs],
    });
    fetchMock.mockImplementation(server.handle);
    renderControl({ record, history: [activity(record)], notes: [theirs] });

    const before = logEntries().map((item) => item.textContent);
    expect(before).toHaveLength(2);
    expect(logEntries("note")[0]).toHaveTextContent("op2@pmikcmetro.com");
    expect(logEntries("note")[0].querySelector("time")).toHaveAttribute(
      "dateTime",
      theirs.recordedAt,
    );
    // Another person's saved note is never loaded into the note area.
    expect(noteBox()).toHaveValue("");

    await typeAndLeave("Called the tenant back.");
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
    await typeAndLeave("Called the tenant back. They prefer email.");
    await waitFor(() => expect(notePosts()).toHaveLength(2));
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));

    const after = logEntries().map((item) => item.textContent);
    expect(after).toHaveLength(3);
    for (const text of before) expect(after).toContain(text);
    expect(server.state.notes.find((n) => n.noteId === theirs.noteId)).toEqual(theirs);
    expect(notePosts().every((body) => body.noteId !== theirs.noteId)).toBe(true);
    const log = screen.getByTestId("renewal-status-log");
    expect(within(log).queryAllByRole("button")).toHaveLength(0);
    expect(within(log).queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /delete|remove|edit/i })).toBeNull();
  });

  it("BEH-S164-11/AC-S164-3: a note about finished work changes no status and asks for no refresh of other state", async () => {
    const record = statusRecord({ status: "preparing_owner_outreach" });
    const server = fakeRoute({ record, history: [activity(record)] });
    fetchMock.mockImplementation(server.handle);
    render(
      <RenewalWorkspace
        role="Editor"
        workspace={workspace()}
        workStatus={{
          available: true,
          record,
          history: [activity(record)],
          notes: [],
          currentCycleId: null,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lease information" }));
    const info = screen.getByRole("complementary", { name: "Lease information" });
    const box = within(info).getByLabelText("Add a note");
    fireEvent.change(box, {
      target: {
        value: "Renewal complete. Owner approved, lease signed, RentVine updated.",
      },
    });
    fireEvent.blur(box);
    await waitFor(() =>
      expect(within(info).getByTestId("renewal-status-note-autosave")).toHaveTextContent(
        "Saved",
      ),
    );
    // Exactly one request left the page: the note. Nothing else was read, saved or refreshed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(notePosts()).toHaveLength(1);
    expect(statusPosts()).toHaveLength(0);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(server.state.record).toEqual(record);
    expect(server.state.history).toEqual([activity(record)]);
    expect(within(info).getByLabelText("Work status (recorded by staff)")).toHaveValue(
      "preparing_owner_outreach",
    );
    expect(within(info).getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Preparing owner outreach",
    );
    expect(screen.getByText("Staff status: Preparing owner outreach")).toBeVisible();
    expect(screen.queryByText("Completed: recorded by staff")).toBeNull();
  });

  it("BEH-S164-4/BEH-S164-8: a status change while a note is still being written keeps the note, and each then saves on its own", async () => {
    const record = statusRecord();
    const server = fakeRoute({ record, history: [activity(record)] });
    fetchMock.mockImplementation(server.handle);
    renderControl({ record, history: [activity(record)] });

    fireEvent.change(noteBox(), { target: { value: "Owner wants the higher rent" } });
    fireEvent.change(statusSelect(), { target: { value: "preparing_tenant_offer" } });
    await waitFor(() =>
      expect(screen.getByTestId("renewal-work-status-autosave")).toHaveTextContent(
        "Saved",
      ),
    );
    expect(noteBox()).toHaveValue("Owner wants the higher rent");
    fireEvent.blur(noteBox());
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
    expect(server.state.record).toMatchObject({
      revision: 2,
      status: "preparing_tenant_offer",
    });
    expect(server.state.notes).toHaveLength(1);
    // Another operator's status wins a real conflict; the note area is untouched by it.
    server.state.record = statusRecord({
      revision: 3,
      status: "waiting_on_signatures",
      eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000003",
    });
    fireEvent.change(noteBox(), {
      target: { value: "Owner wants the higher rent. Noted." },
    });
    fireEvent.change(statusSelect(), { target: { value: "completing_follow_up" } });
    const status = screen.getByTestId("renewal-work-status-autosave");
    await waitFor(() => expect(status).toHaveTextContent("Changed elsewhere"));
    expect(screen.getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Waiting on signatures",
    );
    expect(noteBox()).toHaveValue("Owner wants the higher rent. Noted.");
    // The kept choice can still be saved over the value that was read back.
    fireEvent.click(within(status).getByRole("button", { name: "Save my entry" }));
    await waitFor(() => expect(status).toHaveTextContent("Saved"));
    expect(server.state.record).toMatchObject({
      revision: 4,
      status: "completing_follow_up",
    });
    fireEvent.blur(noteBox());
    await waitFor(() => expect(notePosts()).toHaveLength(2));
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
    expect(server.state.notes).toHaveLength(1);
    expect(server.state.notes[0].revision).toBe(2);
  });

  it("BEH-S164-12: the same saved status and log reopen from the saved record, whether the page supplied the notes or the control reads them", async () => {
    const record = statusRecord();
    const mine = savedNote({
      noteId: "3c5e7a90-1d2f-4b6a-9c8e-000000000002",
      text: "Sent the offer.",
      recordedAt: "2026-09-21T09:00:00.000Z",
      updatedAt: "2026-09-21T09:30:00.000Z",
      recordedByUid: ME.uid,
      recordedByLabel: ME.label,
    });
    const server = fakeRoute({
      record,
      history: [activity(record)],
      notes: [savedNote(), mine],
    });
    fetchMock.mockImplementation(server.handle);

    const first = renderControl({
      record,
      history: [activity(record)],
      notes: [savedNote(), mine],
    });
    const supplied = logEntries().map((item) => item.textContent);
    expect(supplied).toHaveLength(3);
    // Newest first, each with its own actor and time.
    expect(logEntries()[0]).toHaveTextContent("Sent the offer.");
    expect(logEntries()[0]).toHaveTextContent("op1@pmikcmetro.com");
    expect(logEntries()[0]).toHaveTextContent(/last saved/i);
    expect(logEntries()[2]).toHaveTextContent("Waiting on owner response");
    expect(fetchMock).not.toHaveBeenCalled();
    // A reopened lease starts a new note; saved notes are history, not drafts.
    expect(noteBox()).toHaveValue("");
    first.unmount();

    // Another session whose page did not carry the notes reads the same log by itself.
    render(
      <RenewalWorkStatusControl
        canEdit
        leaseId={LEASE}
        read={{
          available: true,
          record,
          history: [activity(record)],
          currentCycleId: null,
        }}
      />,
    );
    await waitFor(() => expect(logEntries()).toHaveLength(3));
    expect(calls("GET")).toHaveLength(1);
    expect(String(calls("GET")[0][0])).toBe(
      `/api/lease-renewal/work-status?leaseId=${LEASE}`,
    );
    expect(logEntries().map((item) => item.textContent)).toEqual(supplied);
    expect(screen.getByTestId("renewal-work-status-saved")).toHaveTextContent(
      "Waiting on owner response",
    );
    expect(calls("POST")).toHaveLength(0);
  });

  it("BEH-S164-8/BEH-S164-12: when saved notes cannot be read the log says so, offers the read again, and a new note can still be saved", async () => {
    const server = fakeRoute({ notes: [savedNote()] });
    const unread = (
      <RenewalWorkStatusControl
        canEdit
        leaseId={LEASE}
        read={{ available: true, record: null, history: [], currentCycleId: null }}
      />
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "Unavailable." }));
    fetchMock.mockImplementation(server.handle);
    const first = render(unread);
    let log = screen.getByTestId("renewal-status-log");
    await within(log).findByText(/Saved notes could not be read/);
    // An unread log is never shown as an empty one.
    expect(within(log).queryByText(/No status changes or notes/)).toBeNull();
    expect(logEntries()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Read the notes again" }));
    await waitFor(() => expect(logEntries("note")).toHaveLength(1));
    expect(within(log).queryByText(/Saved notes could not be read/)).toBeNull();
    first.unmount();

    // The failed read affects only that read: a note typed meanwhile still saves.
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "Unavailable." }));
    render(unread);
    log = screen.getByTestId("renewal-status-log");
    await within(log).findByText(/Saved notes could not be read/);
    expect(noteBox()).toBeEnabled();
    await typeAndLeave("Left a voicemail.");
    await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
    expect(server.state.notes).toHaveLength(2);
    // The save returned the stored notes, so the log is complete again.
    expect(logEntries("note")).toHaveLength(2);
    expect(within(log).queryByText(/Saved notes could not be read/)).toBeNull();
  });

  it("AC-S164-1/AC-S164-3: a reader sees the log but cannot write, and an over-long note is kept unsaved with its reason", async () => {
    const record = statusRecord();
    const view = renderControl(
      { record, history: [activity(record)], notes: [savedNote()] },
      false,
    );
    expect(noteBox()).toBeDisabled();
    expect(statusSelect()).toBeDisabled();
    expect(logEntries()).toHaveLength(2);
    expect(screen.getByText(/Editor access/)).toBeVisible();
    view.unmount();

    renderControl();
    await typeAndLeave("x".repeat(4001));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/4,000 characters/)).toBeVisible();
    expect(noteBox().value).toHaveLength(4001);
  });

  it("BEH-S164-2/BEH-S164-12: the note area and log are sized to their container so a phone-width page does not scroll sideways", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const rule = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start, selector).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(rule(".renewal-status-note-input")).toMatch(/width:\s*100%/);
    expect(rule(".renewal-status-log-text")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(".renewal-status-log-text")).toMatch(/white-space:\s*pre-wrap/);
    expect(rule(".renewal-work-status select")).toMatch(/width:\s*100%/);
    renderControl({ notes: [savedNote({ text: "A".repeat(300) })] });
    // No fixed column or pixel width is set on the controls themselves.
    expect(noteBox()).not.toHaveAttribute("cols");
    expect(noteBox().getAttribute("style")).toBeNull();
    expect(statusSelect().getAttribute("style")).toBeNull();
    expect(noteBox()).toHaveClass("renewal-status-note-input");
  });
});
