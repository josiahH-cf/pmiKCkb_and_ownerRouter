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
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReturnedDocumentsPanel } from "@/components/lease-renewal/ReturnedDocumentsPanel";
import { STAFF_ATTESTATION_LABEL } from "@/lib/lease-documents/returned-state";
import type { ReturnedStateView } from "@/lib/lease-documents/returned-state-service";

// S236 R-S236-2/3/5 (AC-S236-5): the returned-documents screen shows each document's version,
// state, who still must sign and the staff label, keeps the Dotloop line apart from the records and
// posts one exact change bound to the version shown. Synthetic names and hashes only.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HASH = "b".repeat(64);
const view = (overrides: Partial<ReturnedStateView> = {}): ReturnedStateView => ({
  leaseId: "4821",
  cycleId: "cycle-1",
  snapshotId: "packet_a",
  unavailable: null,
  documents: [
    {
      kind: "renewal_extension",
      label: "the renewal extension",
      title: "Renewal extension",
      contentHash: HASH,
      versionLabel: "Approved filled copy",
      revision: 1,
      state: "Partially signed",
      attestation: STAFF_ATTESTATION_LABEL,
      notes: ["Signed an earlier version, not current"],
      stillMustSign: [
        {
          name: "Riley Example",
          capacity: "tenant",
          nextAction: "Ask Riley Example to sign the renewal extension in Dotloop",
        },
      ],
    },
  ],
  overall: "Partially signed",
  signaturesComplete: false,
  signers: [
    {
      personId: "00000000-0000-4000-8000-000000000002",
      signerRole: "tenant",
      label: "Riley Example (tenant)",
    },
  ],
  packetState: null,
  tracksSignerDetail: true,
  manualCompletion: null,
  packetTermsCurrent: true,
  dotloopShows:
    "Dotloop shows loop status Active, 2 documents present as of Nov 2, 2026, 10:00 AM Central",
  ...overrides,
});

describe("S236 returned documents screen", () => {
  it("shows version, state, who still must sign and the staff label, with the Dotloop line apart", () => {
    render(<ReturnedDocumentsPanel canRecord={false} initialView={view()} />);
    const document = screen.getByRole("article");
    expect(within(document).getByRole("heading", { level: 4 })).toHaveTextContent(
      "Renewal extension",
    );
    expect(
      within(document).getByText(/Approved filled copy · bbbbbbbbbbbb/),
    ).toBeVisible();
    expect(within(document).getByText("Partially signed")).toBeVisible();
    expect(
      within(document).getByText(/Recorded by staff, not provider-verified/),
    ).toBeVisible();
    expect(
      within(document).getByText(
        /Riley Example, tenant\. Ask Riley Example to sign the renewal extension in Dotloop\./,
      ),
    ).toBeVisible();
    expect(
      within(document).getByText("Signed an earlier version, not current"),
    ).toBeVisible();
    // The provider line is outside every document's records and never names a signed state.
    const dotloop = document.ownerDocument.querySelector(
      '[data-renewal-field="dotloop-shows"]',
    );
    expect(document.contains(dotloop)).toBe(false);
    expect(dotloop?.textContent).not.toMatch(/signed|executed/i);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/needs Editor access/)).toBeVisible();
  });

  it("says Fully executed is a staff record, and says why nothing can be recorded without a packet", () => {
    const { unmount } = render(
      <ReturnedDocumentsPanel
        canRecord
        initialView={view({ overall: "Fully executed", signaturesComplete: true })}
      />,
    );
    expect(
      screen.getByText(/Fully executed by staff record, not provider-verified/),
    ).toBeVisible();
    unmount();
    render(
      <ReturnedDocumentsPanel
        canRecord
        initialView={view({
          unavailable: "No current app packet exists for this lease.",
          documents: [],
        })}
      />,
    );
    expect(
      screen.getByText("No current app packet exists for this lease."),
    ).toBeVisible();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("posts one change bound to the version shown and shows the refusal it gets back", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return calls.length === 1
          ? Response.json({
              view: view({
                overall: "Fully executed",
                signaturesComplete: true,
                documents: [
                  {
                    ...view().documents[0],
                    state: "Fully executed",
                    stillMustSign: [],
                    revision: 2,
                  },
                ],
              }),
              duplicate: false,
            })
          : Response.json(
              {
                error:
                  "This document version is no longer current. Reload and review the current version before recording.",
              },
              { status: 409 },
            );
      }),
    );
    render(<ReturnedDocumentsPanel canRecord initialView={view()} />);
    fireEvent.change(screen.getByLabelText("Signer"), {
      target: { value: "00000000-0000-4000-8000-000000000002:tenant" },
    });
    fireEvent.change(screen.getByLabelText("When you observed it"), {
      target: { value: "2026-11-02T10:05" },
    });
    fireEvent.change(screen.getByLabelText("Document name in Dotloop"), {
      target: { value: "Renewal extension" },
    });
    fireEvent.change(screen.getByLabelText("When you viewed it"), {
      target: { value: "2026-11-02T10:06" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record signer result" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("article")).getByText("Fully executed"),
      ).toBeVisible(),
    );
    expect(calls[0]).toMatchObject({
      leaseId: "4821",
      cycleId: "cycle-1",
      snapshotId: "packet_a",
      kind: "renewal_extension",
      documentContentHash: HASH,
      expectedRevision: 1,
      change: {
        kind: "signer",
        signerRole: "tenant",
        personId: "00000000-0000-4000-8000-000000000002",
        status: "signed",
        evidence: { kind: "dotloop_observed", documentName: "Renewal extension" },
      },
    });
    expect((calls[0] as { operationId: string }).operationId).toMatch(/^[0-9a-f-]{36}$/);

    fireEvent.change(screen.getByLabelText("Sent for signature on"), {
      target: { value: "2026-11-02T09:00" },
    });
    fireEvent.change(screen.getByLabelText("How it was sent"), {
      target: { value: "Dotloop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record sent for signature" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /version is no longer current/,
    );
    expect((calls[1] as { expectedRevision: number }).expectedRevision).toBe(2);
  });
});
