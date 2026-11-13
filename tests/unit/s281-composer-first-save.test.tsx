// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommunicationComposer } from "@/components/gmail-hub/CommunicationComposer";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";

// S281 R-S281-6 (ARCH-S281-3, BEH-S281-6, AC-S281-5; baseline W12-10): opening the Communications
// composer from a lease writes nothing. Its first save is caused by a staff input event: typing,
// a changed choice or an attached file. Closing an untouched composer leaves no draft.
// Fail-first on the starting state: a new composer saved a draft communication 650 ms after it
// opened, with no input (W12-10 counted 1 new draft where there were 0). Values are synthetic.

const email = "staff@pmikcmetro.com";

function contextFor(lease: string, purpose: "renewal_owner" | "renewal_tenant") {
  return {
    lane: "renewals" as const,
    entityType: "renewal_lease" as const,
    entityId: lease,
    purpose,
    actionKey: "gmail.renewal_notice.send",
    sourceRefs: [`rentvine:lease:${lease}`],
  };
}

function compositionFor(lease: string, purpose: "renewal_owner" | "renewal_tenant") {
  return {
    context: contextFor(lease, purpose),
    initial: plainCommunicationMessage("Exact reviewed subject", "Saved exact wording"),
    target: {
      to: ["owner@example.invalid"],
      cc: [],
      label: "Synthetic lease",
      blockers: [],
    },
    attachmentNotice: null,
    reviewedTargetHash: "b".repeat(64),
  };
}

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

let saves: Record<string, unknown>[] = [];

function stub(purpose: "renewal_owner" | "renewal_tenant") {
  saves = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("composition")) return reply(compositionFor("115", purpose));
      if (!options?.body) return reply({ profile: null });
      const command = JSON.parse(String(options.body)) as Record<string, unknown>;
      saves.push(command);
      const draft = command.draft as Partial<CommunicationSequence>;
      return reply({
        sequence: {
          id: draft.id,
          context: draft.context,
          initial: draft.initial,
          followUp: null,
          version: 1,
          state: "draft",
          senderEmail: email,
          authorization: null,
          threads: [],
          linkedThreads: [],
        },
        reviewedDraftHash: "c".repeat(64),
      });
    }),
  );
}

beforeEach(() => window.history.replaceState(null, "", "/gmail-hub"));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S281 opening the composer writes nothing (R-S281-6)", () => {
  for (const purpose of ["renewal_owner", "renewal_tenant"] as const) {
    it(`ARCH-S281-3 / AC-S281-5 (${purpose}): open, wait two seconds and close: zero saves; type one character: one draft`, async () => {
      stub(purpose);
      const onClose = vi.fn();
      const view = render(
        <CommunicationComposer
          entry={{ lease: "115", purpose }}
          authenticatedEmail={email}
          onClose={onClose}
          onChanged={vi.fn()}
        />,
      );
      const editor = await screen.findByRole("textbox", { name: "Initial message body" });
      // Past the autosave delay with no input: nothing is saved and the address is unchanged.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      expect(saves).toEqual([]);
      expect(window.location.pathname + window.location.search).toBe("/gmail-hub");
      expect(
        screen.getByText("Not saved yet. Your first change saves a draft."),
      ).toBeInTheDocument();
      // One character from the staff member saves exactly one draft.
      editor.innerHTML = "<p>Saved exact wording.</p>";
      fireEvent.input(editor);
      await waitFor(() => expect(saves).toHaveLength(1));
      expect(saves[0]).toMatchObject({ action: "save", expectedVersion: 0 });
      view.unmount();
    }, 15_000);
  }

  it("BEH-S281-6: closing an untouched composer leaves no draft", async () => {
    stub("renewal_owner");
    const view = render(
      <CommunicationComposer
        entry={{ lease: "115", purpose: "renewal_owner" }}
        authenticatedEmail={email}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await screen.findByRole("textbox", { name: "Initial message body" });
    await new Promise((resolve) => setTimeout(resolve, 900));
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(saves).toEqual([]);
  });
});
