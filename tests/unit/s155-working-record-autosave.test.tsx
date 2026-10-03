// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RenewalWorkingRecordProvider,
  WorkingDateField,
  WorkingMoneyField,
} from "@/components/lease-renewal/RenewalWorkingRecord";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

// S155/S157: a completed valid working field saves by itself with saving / saved / failed
// feedback, an unfinished or refused entry stays in its control, a retry reuses the same request,
// and an older response never replaces a newer saved value. Values are synthetic.

const LEASE = "701";
const RECORDED_AT = "2026-10-02T15:00:00.000Z";

function record(
  fields: Record<string, { value: number | string | null; revision: number }>,
  revision: number,
): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: LEASE,
    revision,
    fields: Object.fromEntries(
      Object.entries(fields).map(([field, entry]) => [
        field,
        {
          value: entry.value,
          revision: entry.revision,
          eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000000${entry.revision}`,
          recordedAt: RECORDED_AT,
          recordedByUid: "editor-1",
          recordedByLabel: "editor1@pmikcmetro.com",
          origin: "staff_entry" as const,
        },
      ]),
    ),
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function posted(call: unknown[]) {
  const init = call[1] as { method?: string; body?: string };
  return JSON.parse(init.body ?? "{}") as Record<string, unknown>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderFields(initialRecord: RenewalWorkingRecord | null = null) {
  return render(
    <RenewalWorkingRecordProvider canEdit initialRecord={initialRecord} leaseId={LEASE}>
      <WorkingMoneyField
        field="current_rent"
        source={{ label: "RentVine", value: 1800 }}
      />
      <WorkingMoneyField field="terms_rent" />
      <WorkingDateField field="terms_effective_date" />
    </RenewalWorkingRecordProvider>,
  );
}

function rentInput() {
  return screen.getByLabelText("Working current rent") as HTMLInputElement;
}

describe("S155 autosaved working fields", () => {
  it("BEH-S155-1/3: a completed amount saves on leaving the field, with no Save button, and shows Saved only after the stored value returns", async () => {
    const pending = deferred<ReturnType<typeof jsonResponse>>();
    fetchMock.mockReturnValueOnce(pending.promise);
    renderFields();

    expect(screen.queryByRole("button", { name: /^save/i })).not.toBeInTheDocument();
    fireEvent.change(rentInput(), { target: { value: "1,850.00" } });
    fireEvent.blur(rentInput());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/lease-renewal/working-record");
    expect(posted(fetchMock.mock.calls[0])).toMatchObject({
      leaseId: LEASE,
      field: "current_rent",
      value: 1850,
      expectedRevision: 0,
      origin: "staff_entry",
    });
    expect(screen.getByText("Saving working current rent")).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    pending.resolve(
      jsonResponse(200, {
        record: record({ current_rent: { value: 1850, revision: 1 } }, 1),
      }),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByText(/Entered by editor1@pmikcmetro.com/)).toBeInTheDocument();
    // The source value stays visible beside the retained working value.
    expect(
      screen.getByText(/differs from the working value \$1,850.00/),
    ).toBeInTheDocument();
  });

  it("BEH-S155-2/AC-S155-1: an unfinished amount saves nothing and stays typed while another completed field saves", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        record: record({ terms_effective_date: { value: "2027-01-01", revision: 1 } }, 1),
      }),
    );
    renderFields();

    fireEvent.change(rentInput(), { target: { value: "18x" } });
    fireEvent.blur(rentInput());
    expect(screen.getByText(/Enter an amount such as 1850.00/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Working renewal effective date"), {
      target: { value: "2027-01-01" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(posted(fetchMock.mock.calls[0])).toMatchObject({
      field: "terms_effective_date",
      value: "2027-01-01",
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(rentInput().value).toBe("18x");
  });

  it("BEH-S155-4/5: a lost response keeps the entry and a retry sends the same request once more", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        record: record({ current_rent: { value: 1850, revision: 1 } }, 1),
      }),
    );
    renderFields();

    fireEvent.change(rentInput(), { target: { value: "1850" } });
    fireEvent.blur(rentInput());
    expect(
      await screen.findByText(/Save failed\. The save did not finish\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your entry is kept\./)).toBeInTheDocument();
    expect(rentInput().value).toBe("1850");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls.map(posted);
    expect(second.operationId).toBe(first.operationId);
    expect(second).toEqual(first);
  });

  it("BEH-S155-6: another operator's change of the same value is shown as a conflict, the entry is kept, and other fields still save", async () => {
    const current = record({ current_rent: { value: 1900, revision: 2 } }, 2);
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (init?.method !== "POST") return jsonResponse(200, { record: current });
      const body = JSON.parse((init as { body: string }).body) as { field: string };
      return body.field === "current_rent"
        ? jsonResponse(409, {
            error:
              "Another operator changed this value. Your entry is kept; review the current value before saving again.",
          })
        : jsonResponse(200, {
            record: record(
              {
                current_rent: { value: 1900, revision: 2 },
                terms_rent: { value: 1995, revision: 1 },
              },
              3,
            ),
          });
    });
    renderFields(record({ current_rent: { value: 1800, revision: 1 } }, 1));

    fireEvent.change(rentInput(), { target: { value: "1850" } });
    fireEvent.blur(rentInput());
    expect(await screen.findByText(/Changed elsewhere\./)).toBeInTheDocument();
    expect(rentInput().value).toBe("1850");
    expect(screen.getByRole("button", { name: "Save my entry" })).toBeInTheDocument();

    const termsRent = screen.getByLabelText("Working renewal rent") as HTMLInputElement;
    fireEvent.change(termsRent, { target: { value: "1995" } });
    fireEvent.blur(termsRent);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          (call) => (call[1] as { method?: string } | undefined)?.method === "POST",
        ),
      ).toHaveLength(2),
    );
    await waitFor(() => expect(screen.getAllByText("Saved")).toHaveLength(1));
    // The unsaved rent entry survived the other field's save and the reload.
    expect(rentInput().value).toBe("1850");
  });

  it("BEH-S155-5: an older response arriving late never replaces the newer saved value", async () => {
    const slow = deferred<ReturnType<typeof jsonResponse>>();
    fetchMock.mockReturnValueOnce(slow.promise);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        record: record({ current_rent: { value: 1875, revision: 2 } }, 2),
      }),
    );
    renderFields();

    fireEvent.change(rentInput(), { target: { value: "1850" } });
    fireEvent.blur(rentInput());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(rentInput(), { target: { value: "1875" } });
    fireEvent.blur(rentInput());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    slow.resolve(
      jsonResponse(200, {
        record: record({ current_rent: { value: 1850, revision: 1 } }, 1),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/differs from the working value \$1,875.00/),
      ).toBeInTheDocument(),
    );
    expect(rentInput().value).toBe("1875");
    expect(screen.queryByText(/working value \$1,850.00/)).not.toBeInTheDocument();
  });

  it("BEH-S157-8: adopting the observed source value is one app save that names the source", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        record: {
          ...record({ current_rent: { value: 1800, revision: 2 } }, 2),
          fields: {
            current_rent: {
              ...record({ current_rent: { value: 1800, revision: 2 } }, 2).fields
                .current_rent,
              origin: "adopted_source",
              sourceLabel: "RentVine",
            },
          },
        },
      }),
    );
    renderFields(record({ current_rent: { value: 1850, revision: 1 } }, 1));

    fireEvent.click(screen.getByRole("button", { name: "Use the RentVine value" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(posted(fetchMock.mock.calls[0])).toMatchObject({
      field: "current_rent",
      value: 1800,
      expectedRevision: 1,
      origin: "adopted_source",
      sourceLabel: "RentVine",
    });
    expect(await screen.findByText(/Taken from RentVine by/)).toBeInTheDocument();
    // Only the app's own working-record route was called: no provider route.
    expect(
      fetchMock.mock.calls.every(
        (call) => call[0] === "/api/lease-renewal/working-record",
      ),
    ).toBe(true);
  });

  it("BEH-S167-7: a reader without edit authority sees the values with no editable control", () => {
    render(
      <RenewalWorkingRecordProvider
        canEdit={false}
        initialRecord={record({ current_rent: { value: 1850, revision: 1 } }, 1)}
        leaseId={LEASE}
      >
        <WorkingMoneyField field="current_rent" />
      </RenewalWorkingRecordProvider>,
    );
    expect(rentInput()).toBeDisabled();
    expect(rentInput().value).toBe("1850");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
