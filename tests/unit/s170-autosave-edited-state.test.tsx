// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTOSAVE_IDLE,
  AutosaveStatus,
  withEdited,
} from "@/components/lease-renewal/AutosaveStatus";
import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import {
  RenewalWorkingRecordProvider,
  WorkingMoneyField,
} from "@/components/lease-renewal/RenewalWorkingRecord";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalMessageFacts } from "@/lib/lease-renewal/renewal-message-content";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

// S170: autosave feedback tells an entry that is not stored yet apart from one that is saving,
// saved or failed. No Save button is added: the entry still saves by itself. Values are synthetic.

vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({
    leaseId: "701",
    state: {
      cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
      termsRevision: 1,
      preparation: null,
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function preparation() {
  const inputs = emptyMessagePreparationInputs();
  const facts: RenewalMessageFacts = {
    channel: "tenant",
    names: ["Emulator Tenant"],
    address: "701 Fixture Lane",
    currentBaseRent: null,
    leaseEndDate: "2026-12-31",
    ownerTerms: {
      rent: 1100,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
      source: "staff:reviewed-owner-terms",
    },
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
  };
  return {
    senderEmail: "example-staff@pmikcmetro.com",
    cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
    saved: null,
    inputs,
    facts,
    sourceFingerprint: "a".repeat(64),
    bodyBaseHash: "b".repeat(64),
    bodyOverride: null,
    subjectOverride: null,
    signatureMatchesActor: false,
    publication: { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const status = () => document.querySelector(".autosave-status") as HTMLElement;

describe("S170 autosave says when an entry is edited and not stored yet", () => {
  it("names the four states and keeps a save in flight or a failure ahead of edited", () => {
    render(<AutosaveStatus state={{ phase: "edited" }} subject="Message" />);
    expect(screen.getByRole("status")).toHaveTextContent("Edited, not saved yet");
    expect(screen.getByRole("status")).toHaveAttribute("data-autosave", "edited");
    expect(screen.queryByRole("button")).toBeNull();

    expect(withEdited(AUTOSAVE_IDLE, true)).toEqual({ phase: "edited" });
    expect(withEdited({ phase: "saved" }, true)).toEqual({ phase: "edited" });
    expect(withEdited({ phase: "saved" }, false)).toEqual({ phase: "saved" });
    expect(withEdited({ phase: "saving" }, true)).toEqual({ phase: "saving" });
    const failed = { phase: "failed", message: "The save was refused." } as const;
    expect(withEdited(failed, true)).toBe(failed);
  });

  it("message wording: edited while typed, saving on leaving the field, edited again for words typed during that save, then saved", async () => {
    const base = preparation();
    const saves: Array<ReturnType<typeof deferred<Response>>> = [];
    const posts: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.body) return Response.json(base);
        posts.push(JSON.parse(String(init.body)));
        const pending = deferred<Response>();
        saves.push(pending);
        return pending.promise;
      }),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const prose = await screen.findByLabelText(
      "Response request (optional wording edit)",
    );
    expect(status()).toHaveAttribute("data-autosave", "idle");

    fireEvent.change(prose, { target: { value: "Please share your next step." } });
    expect(status()).toHaveAttribute("data-autosave", "edited");
    expect(status()).toHaveTextContent("Edited, not saved yet");
    expect(posts).toHaveLength(0);

    fireEvent.blur(prose);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(status()).toHaveTextContent("Saving message");

    // More words arrive while the first save is still in flight.
    fireEvent.change(prose, { target: { value: "Please share your next step today." } });
    expect(status()).toHaveTextContent("Saving message");
    saves[0]!.resolve(Response.json(base));
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "edited"));
    expect(screen.queryByText("Saved")).toBeNull();

    fireEvent.blur(prose);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toMatchObject({
      inputs: { edits: { responseRequest: "Please share your next step today." } },
    });
    saves[1]!.resolve(Response.json(base));
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    expect(status()).toHaveTextContent("Saved");
  });

  it("message wording: an edit that is undone before leaving the field is no longer pending and saves nothing", async () => {
    const base = preparation();
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.body) posts.push(JSON.parse(String(init.body)));
        return Response.json(base);
      }),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const prose = await screen.findByLabelText(
      "Response request (optional wording edit)",
    );
    const original = (prose as HTMLTextAreaElement).value;
    fireEvent.change(prose, { target: { value: "A passing thought." } });
    expect(status()).toHaveAttribute("data-autosave", "edited");
    fireEvent.change(prose, { target: { value: original } });
    fireEvent.blur(prose);
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "idle"));
    expect(posts).toHaveLength(0);
  });

  it("a working amount: edited while typed, saving on leaving the field, then saved", async () => {
    const pending = deferred<{
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }>();
    const requests = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", requests);
    render(
      <RenewalWorkingRecordProvider canEdit initialRecord={null} leaseId="701">
        <WorkingMoneyField field="current_rent" />
      </RenewalWorkingRecordProvider>,
    );
    const rent = screen.getByLabelText("Working current rent");
    const field = () =>
      document.querySelector('[data-working-field="current_rent"] .autosave-status')!;
    expect(field()).toHaveAttribute("data-autosave", "idle");

    fireEvent.change(rent, { target: { value: "1,850.00" } });
    expect(field()).toHaveAttribute("data-autosave", "edited");
    expect(field()).toHaveTextContent("Edited, not saved yet");
    expect(requests).not.toHaveBeenCalled();

    fireEvent.blur(rent);
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(1));
    expect(field()).toHaveTextContent("Saving working current rent");
    const stored: RenewalWorkingRecord = {
      schemaVersion: "renewal-working-record/v1",
      leaseId: "701",
      revision: 1,
      fields: {
        current_rent: {
          value: 1850,
          revision: 1,
          eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000001",
          recordedAt: "2026-10-02T15:00:00.000Z",
          recordedByUid: "editor-1",
          recordedByLabel: "editor1@pmikcmetro.com",
          origin: "staff_entry",
        },
      },
    };
    pending.resolve({ ok: true, status: 200, json: async () => ({ record: stored }) });
    await waitFor(() => expect(field()).toHaveAttribute("data-autosave", "saved"));

    // An amount that cannot be saved stays typed and stays marked as not saved.
    fireEvent.change(rent, { target: { value: "18x" } });
    fireEvent.blur(rent);
    expect(field()).toHaveAttribute("data-autosave", "edited");
    expect(screen.getByText(/Nothing was saved for this field/)).toBeInTheDocument();
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it("every autosaved field that waits for a blur or a pause shows the edited state", () => {
    const root = join(process.cwd(), "components/lease-renewal");
    const owners = [
      "RenewalMessagePreparation.tsx",
      "RenewalWorkingRecord.tsx",
      "OperatingSheetLookup.tsx",
      "LeaseTermReviewControl.tsx",
      "RenewalWorkStatusControl.tsx",
      "RenewalManualWorkspace.tsx",
      "RenewalProgressControls.tsx",
      "RenewalDeskViewMemory.tsx",
    ];
    for (const owner of owners) {
      const source = readFileSync(join(root, owner), "utf8");
      expect(source, owner).toContain("<AutosaveStatus");
      expect(source, owner).toMatch(/withEdited\(|AUTOSAVE_EDITED/);
    }
    // No other component renders the shared status without one of the owners above.
    const shared = readFileSync(join(root, "AutosaveStatus.tsx"), "utf8");
    expect(shared).toContain('state.phase === "edited" ? "Edited, not saved yet" : null');
  });
});
