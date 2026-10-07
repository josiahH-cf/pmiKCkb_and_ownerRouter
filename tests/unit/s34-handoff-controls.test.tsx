// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { DotloopPacketLinkPanel } from "@/components/lease-renewal/DotloopPacketLinkPanel";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalDocumentHandoff } from "@/components/lease-renewal/RenewalDocumentHandoff";

// S34 (AC-S34-5, AC-S34-7, AC-S34-9, AC-S34-10): the mounted loop choice, version, refresh and
// staff-report controls. Values are synthetic; every effect is a recorded request only.
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({
    leaseId: "701",
    state: { cycleId: "cycle-2027", termsRevision: 1 },
  }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CREATE_KEY_CLOSED =
  "The exact dotloop.loop.create_from_template action is not currently executable; its S34 activation gate remains required.";
const UPLOAD_KEY_CLOSED =
  "The exact dotloop.document.upload action is not currently executable; its S34 activation gate remains required.";

function handoff(overrides: Record<string, unknown> = {}) {
  return {
    snapshot: null,
    blockers: [],
    readiness: { state: "connected" },
    catalogVersion: "fixture",
    attempts: [],
    operations: {
      create: { actionKey: "dotloop.loop.create_from_template", blockers: [] },
      upload: {
        actionKey: "dotloop.document.upload",
        blockers: [
          "Create or link this lease's Dotloop loop before uploading documents.",
        ],
      },
    },
    association: null,
    staffReport: { signatures: null, completion: null },
    ...overrides,
  };
}

const uploaded = {
  artifactId: "a",
  documentRef: "doc-a",
  label: "Renewal agreement",
  contentHash: "1".repeat(64),
  snapshotId: "s-1",
  derivedArtifactId: null,
  receiptId: "up-1",
  dotloopDocumentId: "d-1",
  dotloopFolderId: "f-1",
  documentName: "renewal.pdf",
  uploadedAt: "2026-10-05T12:00:00.000Z",
  uploadedByUid: "editor-1",
  supersedesContentHash: null,
};

const linked = {
  state: "current",
  origin: "linked_existing",
  loopId: "5001",
  loopName: "SYNTHETIC loop",
  loopUrl: "https://www.dotloop.com/m/loop/5001",
  profileId: "profile-1",
  cycleId: "cycle-2027",
  currentCycle: true,
  linkRevision: 3,
  linkedAt: "2026-10-05T12:00:00.000Z",
  reason: "Reviewed",
  folderRecorded: true,
  readback: {
    readBackAt: "2026-10-06T12:00:00.000Z",
    loopStatus: "PRE_OFFER",
    participantCount: 2,
  },
  documents: [uploaded],
  pendingUploads: [],
};

describe("S34 loop choice and document versions", () => {
  it("reviews and links an existing loop, requiring confirmation to reuse it from an earlier cycle", async () => {
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.body) return Response.json(handoff());
        const body = JSON.parse(String(init.body));
        posts.push(body);
        if (body.kind === "loop_review")
          return Response.json({
            observation: {
              loopId: "5001",
              name: "SYNTHETIC loop",
              status: "PRE_OFFER",
              loopUrl: null,
              participants: [
                {
                  fullName: "Synthetic Tenant",
                  email: "tenant@example.test",
                  role: "TENANT",
                },
              ],
            },
            observationHash: "a".repeat(64),
            archived: false,
            recordedForOtherLease: false,
            servedEarlierCycle: true,
            expectedLinkRevision: 2,
          });
        return Response.json({ association: linked });
      }),
    );
    render(<RenewalDocumentHandoff canApprove canLinkLoop canRecordReadback />);
    const input = await screen.findByLabelText("Existing Dotloop loop number or address");
    fireEvent.change(input, {
      target: { value: "https://www.dotloop.com/m/loop/5001/overview" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review existing loop" }));
    const review = await screen.findByRole("group", { name: "Existing loop review" });
    expect(
      within(review).getByText(/Synthetic Tenant · tenant@example.test · TENANT/),
    ).toBeInTheDocument();
    const linkButton = within(review).getByRole("button", {
      name: "Link this loop to the lease",
    });
    fireEvent.change(
      within(review).getByLabelText("Why this loop belongs to this lease"),
      {
        target: { value: "Reviewed the loop with the leasing team" },
      },
    );
    // Reuse from an earlier cycle needs its own confirmation.
    expect(linkButton).toBeDisabled();
    fireEvent.click(within(review).getByRole("checkbox"));
    expect(linkButton).toBeEnabled();
    fireEvent.click(linkButton);
    await screen.findByText("Loop linked to this lease. Nothing changed in Dotloop.");
    expect(posts).toEqual([
      { kind: "loop_review", loopId: "5001", leaseId: "701" },
      {
        kind: "loop_link",
        loopId: "5001",
        observationHash: "a".repeat(64),
        reason: "Reviewed the loop with the leasing team",
        expectedLinkRevision: 2,
        reuseAcrossCycles: true,
        leaseId: "701",
      },
    ]);
  });

  it("names each operation's own key and refuses a second loop while one is linked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          handoff({
            operations: {
              create: {
                actionKey: "dotloop.loop.create_from_template",
                blockers: [CREATE_KEY_CLOSED],
              },
              upload: {
                actionKey: "dotloop.document.upload",
                blockers: [UPLOAD_KEY_CLOSED],
              },
            },
            association: linked,
            documents: [
              {
                artifactId: "a",
                label: "Renewal agreement",
                documentRef: "doc-a",
                status: "successor_needed",
                statusLabel: "Changed since its last upload.",
                history: [uploaded],
              },
            ],
          }),
        ),
      ),
    );
    render(<RenewalDocumentHandoff canApprove canLinkLoop canRecordReadback />);
    const create = await screen.findByRole("button", {
      name: "Preview exact Dotloop packet creation",
    });
    expect(create).toBeDisabled();
    expect(
      within(screen.getByRole("list", { name: "Loop creation needs" })).getByText(
        CREATE_KEY_CLOSED,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Upload needs" })).getByText(
        UPLOAD_KEY_CLOSED,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review successor upload: Renewal agreement" }),
    ).toBeDisabled();
    expect(screen.queryByLabelText("Existing Dotloop loop number or address")).toBeNull();
  });

  it("previews a successor upload into the linked loop and shows refresh and the staff-reported milestone", async () => {
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.body)
          return Response.json(
            handoff({
              operations: {
                create: { actionKey: "dotloop.loop.create_from_template", blockers: [] },
                upload: { actionKey: "dotloop.document.upload", blockers: [] },
              },
              association: linked,
              documents: [
                {
                  artifactId: "a",
                  label: "Renewal agreement",
                  documentRef: "doc-a",
                  status: "successor_needed",
                  statusLabel: "Changed since its last upload.",
                  history: [uploaded],
                },
                {
                  artifactId: "b",
                  label: "Pet addendum",
                  documentRef: "doc-b",
                  status: "uploaded_current",
                  statusLabel:
                    "This exact version is in the loop; its upload receipt is reused.",
                  history: [],
                },
              ],
              staffReport: {
                signatures: {
                  outcome: "done",
                  recordedAt: "2026-10-06T15:00:00.000Z",
                  occurredAt: "2026-10-06",
                  source: "Dotloop loop 5001 signed copy",
                  reason: null,
                },
                completion: null,
              },
            }),
          );
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return Response.json({
          executionId: "packet-upload",
          previewHash: "b".repeat(64),
          packetHash: "c".repeat(64),
          state: "Awaiting Admin",
          operation: "document_upload",
          actionKey: "dotloop.document.upload",
          participants: [],
          artifacts: [{ label: "Renewal agreement", version: "v2" }],
          loopTarget: { loopId: "5001", origin: "linked_existing", folderRecorded: true },
          supersedes: {
            contentHash: "1".repeat(64),
            uploadedAt: "2026-10-05T12:00:00.000Z",
          },
        });
      }),
    );
    render(<RenewalDocumentHandoff canApprove canLinkLoop canRecordReadback />);
    await screen.findByText(/Staff recorded the required signatures complete/);
    expect(
      screen.getByText(/not provider-verified or signed-artifact evidence/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh from Dotloop" })).toBeEnabled();
    expect(screen.queryByText(/Reading this loop again needs/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Review upload: Pet addendum" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Review successor upload: Renewal agreement" }),
    );
    const preview = await screen.findByRole("group", {
      name: "Exact document action preview",
    });
    expect(
      within(preview).getByText("Exact action: dotloop.document.upload."),
    ).toBeInTheDocument();
    expect(within(preview).getByText(/Into loop 5001/)).toBeInTheDocument();
    expect(
      within(preview).getByText(/stays in Dotloop; a person retires it there/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(posts).toEqual([
        {
          kind: "preview",
          operation: "document_upload",
          documentRef: "doc-a",
          leaseId: "701",
        },
      ]),
    );
  });

  it("shows a loop linked for an earlier cycle as needing reuse, not as this cycle's signing loop", () => {
    render(
      <DotloopPacketLinkPanel
        association={{ ...linked, currentCycle: false } as never}
        requiredSigners={["Synthetic Tenant"]}
      />,
    );
    expect(screen.getByText(/served an earlier renewal cycle/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();
    render(
      <DotloopPacketLinkPanel
        association={linked as never}
        requiredSigners={["Synthetic Tenant"]}
      />,
    );
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });
});
