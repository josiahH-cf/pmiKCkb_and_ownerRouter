import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publication/test-fixture", () => ({
  continueTestPublicationToPinnedRun: vi.fn(),
  inspectTestPublicationFixture: vi.fn(),
  publishTestPublicationRevision: vi.fn(),
  restoreTestPublicationBaseline: vi.fn(),
  rollbackTestPublicationToBaseline: vi.fn(),
}));

import { GET, POST } from "@/app/api/spaces/[spaceId]/publications/test-fixture/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  continueTestPublicationToPinnedRun,
  inspectTestPublicationFixture,
  publishTestPublicationRevision,
  restoreTestPublicationBaseline,
  rollbackTestPublicationToBaseline,
} from "@/lib/publication/test-fixture";
import {
  TEST_PUBLICATION_CONFIRMATIONS,
  TEST_PUBLICATION_SPACE_ID,
} from "@/lib/publication/test-fixture-contract";

const readyStatus = {
  active_revision: "baseline" as const,
  active_version_id: "version-1",
  active_version_number: 1,
  authority: "repository-owned exact Test fixture contract" as const,
  baseline_version_id: "version-1",
  capture_task_id: "capture-1",
  capture_task_status: "resolved" as const,
  continuation_ready: false,
  data_mode: "test" as const,
  fixture_key: "audit:trusted-publication:v1" as const,
  live_evidence_eligible: false as const,
  policy_ready: true,
  rollback_available: true,
  scanner_boundary: "exact-hash-only; no Live scanner claim" as const,
  state: "ready" as const,
  pinned_process_definition_version_id: null,
  pinned_publication_version_id: "version-1",
  pinned_test_run_id: null,
  version_count: 1,
};

function context(spaceId = TEST_PUBLICATION_SPACE_ID) {
  return { params: Promise.resolve({ spaceId }) };
}

function request(body: unknown) {
  return new Request(
    `http://localhost/api/spaces/${TEST_PUBLICATION_SPACE_ID}/publications/test-fixture`,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
}

beforeEach(() => {
  setAuthResolverForTest(() => ({
    email: "admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
    scopes: ["renewals"],
    uid: "admin-1",
  }));
  vi.mocked(inspectTestPublicationFixture).mockResolvedValue(readyStatus);
  vi.mocked(restoreTestPublicationBaseline).mockResolvedValue({
    changed: false,
    effect: "unchanged",
    status: readyStatus,
  });
  vi.mocked(continueTestPublicationToPinnedRun).mockResolvedValue({
    changed: true,
    effect: "continued",
    status: {
      ...readyStatus,
      continuation_ready: true,
      pinned_process_definition_version_id: "process-version-1",
      pinned_test_run_id: "publication_test_run_1",
    },
  });
  vi.mocked(publishTestPublicationRevision).mockResolvedValue({
    changed: true,
    effect: "published",
    status: { ...readyStatus, active_revision: "revision", state: "revision_active" },
  });
  vi.mocked(rollbackTestPublicationToBaseline).mockResolvedValue({
    changed: true,
    effect: "rolled_back",
    status: readyStatus,
  });
});

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

describe("Test publication fixture route", () => {
  it("reads and executes each exact confirmed operation for a scoped Admin", async () => {
    expect((await GET(new Request("http://localhost"), context())).status).toBe(200);
    expect(inspectTestPublicationFixture).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
    );

    const operations = [
      [
        "continue_pinned_run",
        TEST_PUBLICATION_CONFIRMATIONS.continuePinnedRun,
        continueTestPublicationToPinnedRun,
      ],
      [
        "restore_baseline",
        TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
        restoreTestPublicationBaseline,
      ],
      [
        "publish_revision",
        TEST_PUBLICATION_CONFIRMATIONS.publishRevision,
        publishTestPublicationRevision,
      ],
      [
        "rollback_baseline",
        TEST_PUBLICATION_CONFIRMATIONS.rollbackBaseline,
        rollbackTestPublicationToBaseline,
      ],
    ] as const;
    for (const [operation, confirmation, runtime] of operations) {
      const response = await POST(request({ operation, confirmation }), context());
      expect(response.status).toBe(200);
      expect(runtime).toHaveBeenCalledWith(
        expect.objectContaining({ uid: "admin-1" }),
        confirmation,
      );
    }
  });

  it("rejects stale confirmation, wrong Space, and non-Admin before mutation", async () => {
    expect(
      (
        await POST(
          request({ operation: "restore_baseline", confirmation: "stale" }),
          context(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            operation: "restore_baseline",
            confirmation: TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
          }),
          context("maintenance-work-order-intake"),
        )
      ).status,
    ).toBe(404);

    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["renewals"],
      uid: "editor-1",
    }));
    expect((await GET(new Request("http://localhost"), context())).status).toBe(403);
    expect(restoreTestPublicationBaseline).not.toHaveBeenCalled();
  });
});
