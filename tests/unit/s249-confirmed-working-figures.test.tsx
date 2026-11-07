// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RenewalWorkingRecordProvider,
  WorkingDateField,
  WorkingMoneyField,
} from "@/components/lease-renewal/RenewalWorkingRecord";
import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import { RentToRecommendField } from "@/components/lease-renewal/RenewalKickoffFields";
import {
  RenewalNowCardProvider,
  nowSlotKey,
  useRenewalNowCard,
} from "@/components/lease-renewal/RenewalNowCardContext";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import { projectRenewalPreparation } from "@/lib/lease-renewal/renewal-preparation";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { fixtureWorkingRecord } from "@/tests/helpers/rent-charge-fixtures";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({ leaseId: "9101", state: null }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// UX-033/034: use the actual shared field provider and actual message transport controls. Only
// the HTTP seam is deterministic. No message is sent, scheduled or created at a real provider.
const preparation = projectRenewalPreparation({
  numbers: {
    contractualRent: 1400,
    rentCharges: [1400],
    leaseEndIso: "2026-12-31",
    workingRent: null,
    sheetRent: null,
    sheetEndIso: null,
    sourceReadable: true,
  },
  comparison: {
    state: "stored",
    comparison: {
      observationId: "synthetic-comparison",
      observedAtIso: "2026-11-06T15:00:00Z",
      source: "Synthetic comparison",
      rangeLow: 1300,
      rangeHigh: 1600,
      compCount: 1,
      comps: [{ rent: 1400, distanceMiles: 0.4 }],
    },
  },
  typedRent: null,
  agreementRent: null,
  currentRent: 1400,
  ownerRecipient: { state: "ready" },
  signature: true,
  templateApproved: true,
  address: "101 Sample Pl",
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Call = { url: string; body: Record<string, unknown> | null };
function server() {
  let record: RenewalWorkingRecord | null = null;
  let messageRevision = 0;
  const calls: Call[] = [];
  const queue: Array<(body: Record<string, unknown>) => Promise<Response>> = [];
  const compositionQueue: Array<(response: Response) => Promise<Response>> = [];
  const sequenceQueue: Array<(response: Response) => Promise<Response>> = [];
  const inputs = {
    ...emptyMessagePreparationInputs(),
    signature: {
      name: "Example Staff",
      role: null,
      phone: null,
      hours: null,
      website: null,
      source: "Synthetic staff entry",
    },
  };
  function facts(): RenewalMessageFacts {
    const rent = Number(record?.fields.terms_rent?.value ?? 1400);
    return {
      channel: "owner",
      names: ["Example Owner"],
      firstNames: ["Example"],
      address: "101 Sample Pl",
      currentBaseRent: { value: 1400, source: "Synthetic source" },
      leaseEndDate: "2026-12-31",
      ownerTerms: null,
      range: { low: 1300, high: 1600, source: "Synthetic comparison" },
      suggestedRent: {
        value: rent,
        source: "Synthetic working rent",
        kind: "working_offer",
      },
      comps: [
        {
          address: "102 Sample Pl",
          rent: 1400,
          source: "Synthetic comparison",
          distanceMiles: 0.4,
        },
      ],
      trend: null,
      sparseCompsQualification: null,
      charges: inputs.charges,
      insuranceTransition: null,
      leaseOrigin: null,
      otherChargesComparison: null,
      informationForm: null,
      insuranceFlyer: null,
      rbpFlyer: null,
      signature: { ...inputs.signature, email: "example@pmikcmetro.com" },
      attachments: [],
    };
  }
  function projection() {
    return {
      senderEmail: "example@pmikcmetro.com",
      cycleId: null,
      saved: messageRevision
        ? {
            revision: messageRevision,
            inputs,
            signatureEmail: "example@pmikcmetro.com",
            signatureActorUid: "example-editor",
          }
        : null,
      inputs,
      facts: facts(),
      sourceFingerprint: "a".repeat(64),
      bodyBaseHash: "b".repeat(64),
      bodyOverride: null,
      subjectOverride: null,
      signatureMatchesActor: true,
      signatureOrigin: { kind: "none" },
      retainedSignature: null,
      chargeInventory: null,
      publication: { status: "approved", ref: "synthetic-owner:v1" },
      notices: [],
      policyGates: [],
      draftAttempt: null,
      previousDraftAttempts: [],
      recipients: { status: "ready", to: "owner@example.invalid", cc: [] },
    };
  }
  function accept(body: Record<string, unknown>) {
    const field = String(body.field);
    const next = fixtureWorkingRecord(
      {
        [field]: {
          value: body.value as number | string | null,
          revision: Number(body.expectedRevision) + 1,
        },
      },
      (record?.revision ?? 0) + 1,
    );
    record = { ...next, leaseId: "9101", fields: { ...record?.fields, ...next.fields } };
    return Response.json({ record });
  }
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    calls.push({ url, body });
    if (url.startsWith("/api/lease-renewal/working-record"))
      return body ? (queue.shift()?.(body) ?? accept(body)) : Response.json({ record });
    if (url.startsWith("/api/lease-renewal/message-preparation")) {
      if (body?.kind === "draft")
        return Response.json({
          status: "blocked",
          channel: "owner",
          reasons: ["Synthetic preview stop."],
          providerCallAttempted: false,
        });
      if (body) messageRevision++;
      return Response.json(projection());
    }
    const composed = composeRenewalMessage(facts());
    const initial = {
      subject: composed.subject,
      paragraphs: [[{ text: composed.plainText }]],
    };
    if (url.startsWith("/api/gmail-hub/composition")) {
      const response = Response.json({
        context: {
          purpose: "renewal_owner",
          entityType: "renewal_lease",
          entityId: "9101",
        },
        initial,
        target: { to: ["owner@example.invalid"], cc: [], blockers: [] },
        reviewedTargetHash: "synthetic-target",
        carriedRecommendation: null,
      });
      return compositionQueue.shift()?.(response) ?? response;
    }
    if (url === "/api/gmail-hub/sequences" && body?.action === "save") {
      const draft = body.draft as { id: string; initial: typeof initial };
      const response = Response.json({
        sequence: {
          id: draft.id,
          version: Number(body.expectedVersion) + 1,
          initial: draft.initial,
          threads: [],
        },
        reviewedDraftHash: "synthetic-draft",
      });
      return sequenceQueue.shift()?.(response) ?? response;
    }
    throw new Error(`Unexpected synthetic request: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return {
    calls,
    queue,
    compositionQueue,
    sequenceQueue,
    accept,
    record: () => record,
    writes: () =>
      calls.filter(
        (call) => call.url === "/api/lease-renewal/working-record" && call.body,
      ),
    compositions: () =>
      calls.filter((call) => call.url.startsWith("/api/gmail-hub/composition")),
  };
}

function Now() {
  const context = useRenewalNowCard();
  const primary = context?.primaries["ask-owner"];
  return (
    <section aria-label="Now">
      {primary ? (
        <button disabled={primary.disabled} onClick={primary.run} type="button">
          {primary.label}
        </button>
      ) : null}
      {primary?.reason ? (
        <p data-primary-reason role="status">
          {primary.reason}
        </p>
      ) : null}
      {(["message-preview", "review-and-send"] as const).map((slot) => (
        <div
          key={slot}
          data-renewal-now-slot-key={nowSlotKey("ask-owner", slot)}
          ref={context?.slotRef}
        />
      ))}
    </section>
  );
}

function mount(
  initialRecord: RenewalWorkingRecord | null = null,
  extra: "terms" | "current" | null = null,
) {
  return render(
    <RenewalWorkingRecordProvider canEdit leaseId="9101" initialRecord={initialRecord}>
      {extra === "terms" ? (
        <WorkingMoneyField field="terms_rent" label="Retained Full rent" />
      ) : null}
      {extra === "current" ? <WorkingMoneyField field="current_rent" /> : null}
      <RenewalNowCardProvider preparation={preparation}>
        <Now />
        <WorkingDateField
          field="terms_effective_date"
          label="Unrelated owner-message date"
        />
        <RenewalMessagePreparation canEdit channel="owner" />
      </RenewalNowCardProvider>
    </RenewalWorkingRecordProvider>,
  );
}
async function recommended() {
  return (await screen.findByLabelText("Rent to recommend")) as HTMLInputElement;
}
async function review() {
  fireEvent.click(await screen.findByRole("button", { name: "Review and send" }));
}

describe("a reviewed message uses confirmed working figures", () => {
  it("waits for a delayed rent, then saves newer typing before opening the exact review", async () => {
    const api = server();
    const slow = deferred<Response>();
    api.queue.push(() => slow.promise);
    mount();
    const input = await recommended();
    fireEvent.change(input, { target: { value: "1499" } });
    fireEvent.blur(input);
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    await review();
    expect(api.compositions()).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Saving rent to recommend")).toBeVisible();
    fireEvent.change(input, { target: { value: "1511" } });
    await act(async () => slow.resolve(api.accept(api.writes()[0]!.body!)));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("$1,511.00");
    expect(dialog).not.toHaveTextContent("$1,499.00");
    expect(input).toHaveValue("1511");
    expect(
      api.writes().map((call) => [call.body!.value, call.body!.expectedRevision]),
    ).toEqual([
      [1499, 0],
      [1511, 1],
    ]);
    expect(api.writes().every((call) => !("editorVersion" in call.body!))).toBe(true);
    expect(api.calls.every((call) => call.url.startsWith("/api/"))).toBe(true);
  });

  it("keeps a refused rent, focuses its recovery and prepares no review until a real retry succeeds", async () => {
    const api = server();
    const slow = deferred<Response>();
    api.queue.push(() => slow.promise);
    mount(null, "terms");
    const input = await recommended();
    fireEvent.change(input, { target: { value: "1499" } });
    fireEvent.blur(input);
    await review();
    await act(async () =>
      slow.resolve(
        Response.json({ error: "Synthetic save unavailable." }, { status: 503 }),
      ),
    );
    await screen.findByText(/Rent to recommend is not confirmed/);
    expect(input).toHaveValue("1499");
    expect(input).toHaveFocus();
    expect(api.compositions()).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      within(screen.getByRole("region", { name: "Owner message" })).getByRole("button", {
        name: "Try again",
      }),
    );
    await within(screen.getByRole("region", { name: "Owner message" })).findByText(
      "Saved",
    );
    await waitFor(() =>
      expect(screen.queryByText(/Rent to recommend is not confirmed/)).toBeNull(),
    );
    await review();
    expect(await screen.findByRole("dialog")).toHaveTextContent("$1,499.00");
    expect(api.record()?.fields.terms_rent?.value).toBe(1499);
  });

  it("focuses the actual generated-id current-rent field after its own save fails", async () => {
    const api = server();
    api.queue.push(async () =>
      Response.json({ error: "Synthetic save unavailable." }, { status: 503 }),
    );
    mount(null, "current");
    await recommended();
    const input = screen.getByLabelText("Working current rent");
    expect(input.id.startsWith("renewal-")).toBe(false);
    fireEvent.change(input, { target: { value: "1401" } });
    fireEvent.blur(input);
    await screen.findByText(/Save failed/);
    await review();
    await screen.findByText(/Working current rent is not confirmed/);
    expect(input).toHaveFocus();
    expect(api.compositions()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Saved");
    await waitFor(() =>
      expect(screen.queryByText(/Working current rent is not confirmed/)).toBeNull(),
    );
  });

  for (const interval of ["composition", "sequence"] as const) {
    it(`keeps a newer confirmed rent out of an older review while ${interval} is delayed`, async () => {
      const api = server();
      const started = deferred<Response>();
      const released = deferred<Response>();
      const queue = interval === "composition" ? api.compositionQueue : api.sequenceQueue;
      queue.push((response) => {
        started.resolve(response);
        return released.promise;
      });
      mount();
      const input = await recommended();
      fireEvent.change(input, { target: { value: "1499" } });
      fireEvent.blur(input);
      await within(screen.getByRole("region", { name: "Owner message" })).findByText(
        "Saved",
      );
      await review();
      const response = await started.promise;
      fireEvent.change(input, { target: { value: "1511" } });
      fireEvent.blur(input);
      await waitFor(() => expect(api.record()?.fields.terms_rent?.value).toBe(1511));
      await within(screen.getByRole("region", { name: "Owner message" })).findByText(
        "Saved",
      );
      await act(async () => released.resolve(response));
      await screen.findAllByText(/Working figures changed while this review was loading/);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.querySelector("[data-primary-reason]")).toHaveTextContent(
        "Choose Review and send again",
      );
      expect(input).toHaveValue("1511");
      await review();
      expect(await screen.findByRole("dialog")).toHaveTextContent("$1,511.00");
      const saves = api.calls.filter((call) => call.url === "/api/gmail-hub/sequences");
      if (interval === "composition") expect(saves).toHaveLength(1);
      else {
        expect(saves).toHaveLength(2);
        expect((saves[1]!.body!.draft as { id: string }).id).toBe(
          (saves[0]!.body!.draft as { id: string }).id,
        );
        expect(saves[1]!.body!.expectedVersion).toBe(1);
      }
    });
  }

  for (const transport of [
    "Schedule",
    "Create Gmail draft instead",
    "Open in Communications",
  ]) {
    it(`${transport} keeps the same refused financial entry and starts no stale transport`, async () => {
      const api = server();
      api.queue.push(async () =>
        Response.json({ error: "Synthetic save unavailable." }, { status: 503 }),
      );
      const close = vi.fn();
      const replace = vi.fn();
      vi.spyOn(window, "open").mockReturnValue({
        opener: window,
        close,
        location: { replace },
      } as unknown as Window);
      mount();
      const input = await recommended();
      fireEvent.change(input, { target: { value: "1499" } });
      fireEvent.blur(input);
      await screen.findByText(/Save failed/);
      const control = screen.getByRole(
        transport === "Open in Communications" ? "link" : "button",
        { name: transport },
      );
      fireEvent.click(control);
      expect(
        (await screen.findAllByText(/Rent to recommend is not confirmed/)).length,
      ).toBeGreaterThan(0);
      expect(input).toHaveValue("1499");
      expect(api.compositions()).toHaveLength(0);
      expect(api.calls.filter((call) => call.body?.kind === "draft")).toHaveLength(0);
      expect(replace).not.toHaveBeenCalled();
      if (transport === "Open in Communications") expect(close).toHaveBeenCalledOnce();
      if (transport === "Create Gmail draft instead") {
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(input).toHaveFocus());
        const user = userEvent.setup();
        await user.tab();
        await screen.findByText("Saved");
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(api.record()?.fields.terms_rent?.value).toBe(1499);
        expect(api.calls.filter((call) => call.body?.kind === "draft")).toHaveLength(0);
      }
    });
  }

  it("copies the displayed bytes while a figure is unconfirmed and makes the condition visible", async () => {
    const api = server();
    api.queue.push(async () =>
      Response.json({ error: "Synthetic save unavailable." }, { status: 503 }),
    );
    class LocalClipboardItem {
      constructor(readonly items: Record<string, Blob>) {}
    }
    const write = vi.fn<(items: LocalClipboardItem[]) => Promise<void>>(
      async () => undefined,
    );
    vi.stubGlobal("ClipboardItem", LocalClipboardItem);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });
    mount();
    const input = await recommended();
    fireEvent.change(input, { target: { value: "1499" } });
    fireEvent.blur(input);
    await screen.findByText(/Save failed/);
    const shown = screen.getByRole("document", { name: "Message preview" }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByText(/Working figures were unconfirmed when this copy began/);
    expect(write).toHaveBeenCalledOnce();
    const blob = write.mock.calls[0]![0][0]!.items["text/plain"]!;
    const copied = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(copied.replace(/\s+/g, "").trim()).toBe(shown!.replace(/\s+/g, "").trim());
    expect(api.compositions()).toHaveLength(0);
  });

  it("a blank untouched working field and an unrelated invalid field leave the prepared owner review usable", async () => {
    const api = server();
    mount({
      ...fixtureWorkingRecord({
        terms_effective_date: { value: "2027-01-01", revision: 1 },
      }),
      leaseId: "9101",
    });
    await recommended();
    fireEvent.change(screen.getByLabelText("Unrelated owner-message date"), {
      target: { value: "" },
    });
    expect(screen.getByText("Edited, not saved yet")).toBeVisible();
    await review();
    expect(await screen.findByRole("dialog")).toHaveTextContent("$1,400.00");
    expect(api.writes()).toHaveLength(0);
    expect(screen.getByLabelText("Unrelated owner-message date")).toHaveValue("");
  });
});

describe("only the entry a response carried is acknowledged", () => {
  for (const field of ["current_rent", "terms_rent"]) {
    it(`retains newer ${field} typing after an earlier successful response, then saves it against that confirmed revision`, async () => {
      const api = server();
      const slow = deferred<Response>();
      api.queue.push(() => slow.promise);
      render(
        <RenewalWorkingRecordProvider canEdit leaseId="9101">
          <WorkingMoneyField field={field} label="Synthetic working amount" />
        </RenewalWorkingRecordProvider>,
      );
      const input = screen.getByLabelText("Synthetic working amount");
      fireEvent.change(input, { target: { value: "1507" } });
      fireEvent.blur(input);
      await waitFor(() => expect(api.writes()).toHaveLength(1));
      fireEvent.change(input, { target: { value: "1511" } });
      await act(async () => slow.resolve(api.accept(api.writes()[0]!.body!)));
      expect(input).toHaveValue("1511");
      expect(screen.getByText("Edited, not saved yet")).toBeVisible();
      expect(screen.queryByText("Saved")).toBeNull();
      expect(api.record()?.fields[field]?.value).toBe(1507);
      fireEvent.blur(input);
      await screen.findByText("Saved");
      expect(api.record()?.fields[field]?.value).toBe(1511);
      expect(api.writes()[1]!.body).toMatchObject({ value: 1511, expectedRevision: 1 });
    });
  }

  for (const field of ["terms_effective_date", "terms_end_date"]) {
    it(`retains and saves a newer ${field} choice after the older in-flight choice`, async () => {
      const api = server();
      const slow = deferred<Response>();
      api.queue.push(() => slow.promise);
      render(
        <RenewalWorkingRecordProvider canEdit leaseId="9101">
          <WorkingDateField field={field} label="Synthetic date" />
        </RenewalWorkingRecordProvider>,
      );
      const input = screen.getByLabelText("Synthetic date");
      fireEvent.change(input, { target: { value: "2027-01-01" } });
      await waitFor(() => expect(api.writes()).toHaveLength(1));
      fireEvent.change(input, { target: { value: "2027-02-01" } });
      expect(input).toHaveValue("2027-02-01");
      expect(api.writes()).toHaveLength(1);
      await act(async () => slow.resolve(api.accept(api.writes()[0]!.body!)));
      await screen.findByText("Saved");
      expect(input).toHaveValue("2027-02-01");
      expect(api.record()?.fields[field]?.value).toBe("2027-02-01");
      expect(api.writes()[1]!.body).toMatchObject({
        value: "2027-02-01",
        expectedRevision: 1,
      });
    });
  }

  it("retains the same unsaved rent through the Full and Guided editors before the one normal save", async () => {
    const api = server();
    function Views() {
      const [guided, setGuided] = useState(false);
      return (
        <>
          <button
            data-renewal-view-switch="true"
            onClick={() => setGuided((value) => !value)}
            type="button"
          >
            Change view
          </button>
          {guided ? (
            <RentToRecommendField preparation={preparation} />
          ) : (
            <WorkingMoneyField field="terms_rent" />
          )}
        </>
      );
    }
    render(
      <RenewalWorkingRecordProvider canEdit leaseId="9101">
        <Views />
      </RenewalWorkingRecordProvider>,
    );
    const full = screen.getByLabelText("Working renewal rent");
    fireEvent.change(full, { target: { value: "1511" } });
    fireEvent.blur(full, {
      relatedTarget: screen.getByRole("button", { name: "Change view" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Change view" }));
    expect(await recommended()).toHaveValue("1511");
    expect(api.writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Change view" }));
    const restored = screen.getByLabelText("Working renewal rent");
    expect(restored).toHaveValue("1511");
    fireEvent.blur(restored);
    await screen.findByText("Saved");
    expect(api.record()?.fields.terms_rent?.value).toBe(1511);
  });
});
