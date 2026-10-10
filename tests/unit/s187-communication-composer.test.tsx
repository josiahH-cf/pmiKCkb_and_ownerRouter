// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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
  it("flushes the last visible edit then authorizes it once under repeated Send clicks", async () => {
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
    const send = screen.getByRole("button", { name: "Send" });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() =>
      expect(commands.filter((c) => c.action === "save")).toHaveLength(1),
    );
    expect(commands.filter((c) => c.action === "send")).toHaveLength(0);
    release!();
    await waitFor(() =>
      expect(commands.filter((c) => c.action === "send")).toHaveLength(1),
    );
    expect(commands.find((c) => c.action === "send")).toMatchObject({
      expectedVersion: 2,
      reviewedDraftHash: "c".repeat(64),
      reviewedTargetHash: "b".repeat(64),
    });
    expect(JSON.stringify(commands[0])).toContain('"bold":true');
    expect(editor).toHaveTextContent("Final reviewed wording");
    expect(screen.queryByText("Review exact message")).toBeNull();
    await screen.findByRole("button", { name: "Check admitted send" });
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
