// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommunicationComposer } from "@/components/gmail-hub/CommunicationComposer";
import { readRichEditor } from "@/components/gmail-hub/RichMessageEditor";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";
const id = "cc3e6d25-f9a0-40e7-8bb0-e29521be90b1",
  email = "staff@pmikcmetro.com";
const context = {
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: "115",
  purpose: "renewal_owner" as const,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: ["rentvine:lease:115"],
};
const initial = plainCommunicationMessage(
  "Exact reviewed subject",
  "Saved exact wording",
);
const base: CommunicationSequence = {
  id,
  context,
  workflowLabel: "Synthetic lease",
  initial,
  followUp: null,
  schemaVersion: "workflow-communication-sequence/v1",
  version: 1,
  responsibleUid: "staff",
  senderEmail: email,
  state: "draft",
  createdAtMs: 1,
  createdByUid: "staff",
  updatedAtMs: 1,
  authorization: null,
  nextDueAtMs: null,
  confirmedCount: 0,
  lastSentAtMs: null,
  pause: null,
  unresolvedOccurrenceId: null,
  linkedThreads: [],
  threads: [],
  observedMessageIds: [],
  observation: null,
  lastOperation: { id, hash: "a".repeat(64) },
};
const composition = {
  context,
  initial,
  target: {
    to: ["owner@example.invalid"],
    cc: ["staff@pmikcmetro.com"],
    label: "Synthetic lease",
    blockers: [],
  },
  attachmentNotice: null,
  reviewedTargetHash: "b".repeat(64),
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => window.history.replaceState(null, "", "/gmail-hub"));
function mount() {
  return render(
    <CommunicationComposer
      entry={{ id }}
      authenticatedEmail={email}
      onClose={vi.fn()}
      onChanged={vi.fn()}
    />,
  );
}
describe("S187 one linked rich composer", () => {
  it("keeps supported formatting/links and drops active markup instead of accepting HTML authority", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<p>Hello <strong>Owner</strong> <a href="https://example.invalid/form">form</a></p><p><em>Thanks</em><script>unsafe()</script><a href="javascript:unsafe()">unsafe link</a></p>';
    const paragraphs = readRichEditor(root);
    expect(paragraphs[0]).toContainEqual({ text: "Owner", bold: true });
    expect(paragraphs[0]).toContainEqual({
      text: "form",
      href: "https://example.invalid/form",
    });
    expect(JSON.stringify(paragraphs)).not.toContain("javascript:");
    expect(JSON.stringify(paragraphs)).not.toContain("unsafe()");
  });
  it("saves the final visible edit before one confirmed Send and preserves an unresolved attempt", async () => {
    const commands: Record<string, unknown>[] = [];
    let release: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.includes("composition")) return reply(composition);
        if (!options?.body)
          return reply({ sequence: base, reviewedDraftHash: "a".repeat(64) });
        const command = JSON.parse(String(options.body));
        commands.push(command);
        if (command.action === "save") {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return reply({
            sequence: { ...base, ...command.draft, version: 2 },
            reviewedDraftHash: "c".repeat(64),
          });
        }
        return reply({
          sequence: {
            ...base,
            version: 3,
            state: "needs_reconciliation",
            unresolvedOccurrenceId: "opaque-attempt",
          },
          reviewedDraftHash: "c".repeat(64),
        });
      }),
    );
    mount();
    const editor = await screen.findByRole("textbox", { name: "Initial message body" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled(),
    );
    editor.innerHTML = "<p>Final <strong>reviewed</strong> wording</p>";
    fireEvent.input(editor);
    expect(screen.getByRole("button", { name: "Schedule" })).toBeEnabled();
    const send = screen.getByRole("button", { name: "Send" });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() =>
      expect(commands.filter((c) => c.action === "save")).toHaveLength(1),
    );
    expect(commands.filter((c) => c.action === "send")).toHaveLength(0);
    release!();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled(),
    );
    expect(commands.filter((c) => c.action === "send")).toHaveLength(1);
    expect(commands.find((c) => c.action === "send")).toMatchObject({
      reviewedDraftHash: "c".repeat(64),
      reviewedTargetHash: "b".repeat(64),
    });
    expect(
      commands.filter((c) => ["schedule", "resume"].includes(String(c.action))),
    ).toHaveLength(0);
    expect(JSON.stringify(commands[0])).toContain('"bold":true');
    expect(editor).toHaveTextContent("Final reviewed wording");
    expect(screen.queryByText("Review exact message")).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
  it("retains wording after a lost save response and retries that identical save intent", async () => {
    const saves: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.includes("composition")) return reply(composition);
        if (!options?.body)
          return reply({ sequence: base, reviewedDraftHash: "a".repeat(64) });
        const c = JSON.parse(String(options.body));
        saves.push(c);
        if (saves.length === 1) throw new Error("fixture lost response");
        return reply({
          sequence: { ...base, ...c.draft, version: 2 },
          reviewedDraftHash: "c".repeat(64),
        });
      }),
    );
    mount();
    const subject = await screen.findByLabelText("Initial message subject");
    fireEvent.change(subject, { target: { value: "Retained edited subject" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("fixture lost response");
    expect(subject).toHaveValue("Retained edited subject");
    fireEvent.click(screen.getByRole("button", { name: "Retry same save" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]).toEqual(saves[0]);
  });
});

it("opens the schedule controls and authorizes exactly the reviewed local date, time and bounds", async () => {
  const scheduledBase = {
    ...base,
    followUp: plainCommunicationMessage(
      "Reviewed follow-up",
      "Fixture follow-up content",
    ),
  };
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("composition")) return reply(composition);
      if (!options?.body)
        return reply({ sequence: scheduledBase, reviewedDraftHash: "a".repeat(64) });
      const command = JSON.parse(String(options.body));
      commands.push(command);
      return reply({
        sequence: { ...scheduledBase, version: 2, state: "active" },
        reviewedDraftHash: "a".repeat(64),
      });
    }),
  );
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Schedule" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  fireEvent.change(screen.getByLabelText("First date"), {
    target: { value: "2026-10-22" },
  });
  fireEvent.change(screen.getByLabelText("Local time"), { target: { value: "09:00" } });
  fireEvent.change(screen.getByLabelText("Timezone"), {
    target: { value: "America/Chicago" },
  });
  fireEvent.change(screen.getByLabelText("Repeat every calendar days (optional)"), {
    target: { value: "3" },
  });
  fireEvent.change(
    screen.getByLabelText("Total send limit including initial (optional)"),
    { target: { value: "2" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Schedule messages" }));
  await waitFor(() =>
    expect(commands.filter((c) => c.action === "schedule")).toHaveLength(1),
  );
  expect(commands[0]).toMatchObject({
    action: "schedule",
    id,
    expectedVersion: 1,
    reviewedDraftHash: "a".repeat(64),
    reviewedTargetHash: "b".repeat(64),
    schedule: {
      firstDate: "2026-10-22",
      time: "09:00",
      timeZone: "America/Chicago",
      everyDays: 3,
      sendLimit: 2,
      endDate: null,
    },
  });
  expect(commands.some((c) => c.action === "send")).toBe(false);
});

it("S233 R-S233-1: lists each attempt and incoming message once, with lease, cycle and audience", async () => {
  const sentAtMs = Date.parse("2026-11-02T15:00:00Z");
  const occurrence = (index: number, state: "sent" | "refused" | "ambiguous") => ({
    id: String(index + 1).repeat(64),
    sequenceId: id,
    authorizationRevision: 1,
    index,
    state,
    senderEmail: email,
    rfcMessageId: `<pmi-${String(index + 1).repeat(64)}@pmikcmetro.com>`,
    payloadHash: "p".repeat(64),
    claimedAtMs: sentAtMs + index * 86_400_000,
    ...(state === "sent" ? { sentAtMs: sentAtMs + index * 86_400_000 } : {}),
    ...(state === "refused" ? { reason: "provider_refusal" as const } : {}),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("composition")
        ? reply(composition)
        : reply({
            sequence: {
              ...base,
              state: "paused",
              noticeCycleId: "11111111-1111-4111-8111-111111111111",
              inbound: [
                {
                  id: "mailbox:reply-1",
                  senderEmail: email,
                  threadId: "thread-1",
                  messageId: "reply-1",
                  kind: "human",
                  receivedAtMs: sentAtMs + 3_600_000,
                },
              ],
            },
            reviewedDraftHash: "a".repeat(64),
            attempts: [
              occurrence(0, "sent"),
              occurrence(1, "refused"),
              occurrence(2, "ambiguous"),
            ],
            attemptsTruncated: false,
          }),
    ),
  );
  mount();
  const section = await screen.findByRole("region", { name: "Message evidence" });
  expect(section).toHaveTextContent("Owner message · Lease 115 · renewal cycle 11111111");
  const items = [...section.querySelectorAll("li")].map((item) => item.textContent);
  expect(items).toEqual([
    expect.stringMatching(/^Initial message: Accepted by Gmail /),
    expect.stringMatching(/^Reply received /),
    "Follow-up 1: Not sent: Gmail refused it",
    "Follow-up 2: Not confirmed, checking",
  ]);
  expect(section.textContent).not.toMatch(/\bdelivered\b|\bread\b/i);
});

it("S233 R-S233-9: a new composer whose load runs twice (development) installs and saves one draft", async () => {
  const saves: { id: string; expectedVersion: number }[] = [];
  const loads: (() => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("composition")) {
        // Each load answers only when the test releases it, in order.
        await new Promise<void>((resolve) => loads.push(resolve));
        return reply(composition);
      }
      const command = JSON.parse(String(options?.body ?? "{}"));
      saves.push({ id: command.draft.id, expectedVersion: command.expectedVersion });
      return reply({
        sequence: { ...base, ...command.draft, version: command.expectedVersion + 1 },
        reviewedDraftHash: "c".repeat(64),
      });
    }),
  );
  render(
    <StrictMode>
      <CommunicationComposer
        entry={{ lease: "115", purpose: "renewal_owner" }}
        authenticatedEmail={email}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    </StrictMode>,
  );
  await waitFor(() => expect(loads).toHaveLength(2));
  // The superseded first load answers first and must install nothing, past the autosave delay.
  loads[0]!();
  await new Promise((resolve) => setTimeout(resolve, 900));
  expect(saves).toEqual([]);
  loads[1]!();
  await waitFor(() => expect(saves).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 900));
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({ expectedVersion: 0 });
  expect(screen.queryByText(/This communication changed/)).toBeNull();
});

it("S233 R-S233-1: an action whose attempts cannot be loaded keeps its result, labels the last list and recovers on the next check", async () => {
  const claimedAtMs = Date.parse("2026-11-02T15:00:00Z");
  const occurrence = (index: number, state: "sent" | "refused") => ({
    id: String(index + 1).repeat(64),
    sequenceId: id,
    authorizationRevision: 1,
    index,
    state,
    senderEmail: email,
    rfcMessageId: `<pmi-${String(index + 1).repeat(64)}@pmikcmetro.com>`,
    payloadHash: "p".repeat(64),
    claimedAtMs: claimedAtMs + index * 86_400_000,
    ...(state === "sent" ? { sentAtMs: claimedAtMs + index * 86_400_000 } : {}),
    ...(state === "refused" ? { reason: "provider_refusal" as const } : {}),
  });
  const active = { ...base, state: "active" as const, confirmedCount: 1 };
  const actions: string[] = [];
  let statusReads = 0;
  let attemptsNow = [occurrence(0, "sent")];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("composition")) return reply(composition);
      if (options?.body) {
        const command = JSON.parse(String(options.body));
        actions.push(command.action);
        // The refresh is applied (a new version), but its attempt read fails.
        return reply({
          sequence: { ...active, version: 2 },
          reviewedDraftHash: "a".repeat(64),
          attemptsUnavailable: true,
        });
      }
      if (url.includes(`sequences?id=${id}`)) statusReads += 1;
      return reply({
        sequence: { ...active, version: actions.includes("refresh") ? 2 : 1 },
        reviewedDraftHash: "a".repeat(64),
        attempts: attemptsNow,
        attemptsTruncated: false,
      });
    }),
  );
  mount();
  const section = await screen.findByRole("region", { name: "Message evidence" });
  await waitFor(() =>
    expect([...section.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Initial message: Accepted by Gmail /),
    ]),
  );
  expect(
    section.querySelector('[data-communication-field="attempts-unavailable"]'),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh linked incoming" }));
  const note = await screen.findByText(/^Message attempts could not be loaded just now/);
  // The last list stays, labeled with when it was loaded; the applied refresh's state is shown.
  expect(note).toHaveTextContent(
    /The attempts below are from the last successful check, .+, and they may not include the latest one\. The recorded state above is current\. Use Check recorded status to load them again\.$/,
  );
  expect([...section.querySelectorAll("li")]).toHaveLength(1);
  expect(
    document
      .querySelector("[data-communication-version]")
      ?.getAttribute("data-communication-version"),
  ).toBe("2");
  expect(actions).toEqual(["refresh"]);
  // A fresh check loads the attempts again and the note goes away; nothing is resent.
  attemptsNow = [occurrence(0, "sent"), occurrence(1, "refused")];
  const readsBefore = statusReads;
  fireEvent.click(screen.getByRole("button", { name: "Check recorded status" }));
  await waitFor(() =>
    expect(
      screen.queryByText(/^Message attempts could not be loaded just now/),
    ).toBeNull(),
  );
  expect([...section.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
    expect.stringMatching(/^Initial message: Accepted by Gmail /),
    "Follow-up 1: Not sent: Gmail refused it",
  ]);
  expect(statusReads).toBeGreaterThan(readsBefore);
  expect(actions).toEqual(["refresh"]);
  expect(section.textContent).not.toMatch(/\bdelivered\b|\bread\b/i);
});

it("S233 R-S233-1: a first load whose attempts cannot be loaded says none are listed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("composition")
        ? reply(composition)
        : reply({
            sequence: { ...base, state: "active", confirmedCount: 1 },
            reviewedDraftHash: "a".repeat(64),
            attemptsUnavailable: true,
          }),
    ),
  );
  mount();
  const section = await screen.findByRole("region", { name: "Message evidence" });
  expect(section).toHaveTextContent(
    "Message attempts could not be loaded just now, so none are listed. The recorded state above is current. Use Check recorded status to load them again.",
  );
  expect(section.querySelectorAll("li")).toHaveLength(0);
});

it("S233 R-S233-1: after a check that found no attempts, an unavailable load says none were recorded then", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) =>
      url.includes("composition")
        ? reply(composition)
        : reply({
            sequence: { ...base, state: "active", confirmedCount: 0 },
            reviewedDraftHash: "a".repeat(64),
            ...(options?.body
              ? { attemptsUnavailable: true }
              : { attempts: [], attemptsTruncated: false }),
          }),
    ),
  );
  mount();
  await screen.findByRole("button", { name: "Refresh linked incoming" });
  expect(screen.queryByRole("region", { name: "Message evidence" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh linked incoming" }));
  const section = await screen.findByRole("region", { name: "Message evidence" });
  expect(section).toHaveTextContent(
    /Message attempts could not be loaded just now\. None were recorded at the last successful check, .+, and a newer one may not be listed\. The recorded state above is current\./,
  );
});
