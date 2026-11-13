// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { RenewalFollowUpStatus } from "@/components/lease-renewal/RenewalFollowUpStatus";
import { RenewalStageHeader } from "@/components/lease-renewal/RenewalStageHeader";
import {
  NOTICE_RULES_ADMIN_HREF,
  buildRenewalFollowUpProjection,
  type RenewalFollowUpProjectionInput,
} from "@/lib/lease-renewal/follow-up-projection";
import { leaseWaitingFor } from "@/lib/lease-renewal/lease-waiting";
import { DEFAULT_NOTICE_RULE_SET } from "@/lib/lease-renewal/notice-rules";
import {
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import type { RenewalWorkspaceAction } from "@/lib/lease-renewal/workspace-state";
import {
  REPLY_AT_MS,
  SENT_AT_MS,
  evidenceInput,
  message,
  recordedState,
} from "@/tests/helpers/outreach-evidence-fixtures";

// S279 on screen: the "Waiting and follow-up" card adds only the next follow-up date and the
// policy note beside the step's waiting line (R-S279-1); the unconfirmed notice rules line names
// its Admin panel, linked for an Admin (R-S279-5); a disagreement reads once, in the stage line,
// with its fix linked to the editor (R-S279-3). Synthetic records only.

afterEach(cleanup);

const LEASE = "4879";
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const UNCONFIRMED =
  "Renewal notice rules are not confirmed. Next: an Admin confirms them in Admin, Renewal notice rules.";

function context(outreach: ReturnType<typeof evidenceInput>): RenewalStageContext {
  return {
    leaseId: LEASE,
    staffRecordUnavailable: false,
    standingAgreement: null,
    housingAssistance: null,
    numbers: { verified: true, openDifferences: 0 },
    term: { monthToMonth: false, reviewNeeded: false },
    moveOutInitiated: false,
    sourceRenewal: null,
    verification: null,
    handStatus: null,
    outreach,
    cycleDateIso: "2026-12-31",
  };
}

function followUp(
  policy: RenewalFollowUpProjectionInput["policy"]["state"] = "missing",
  outreach = evidenceInput([message()]),
) {
  const waiting = leaseWaitingFor(recordedState(LEASE), outreach, {
    leaseId: LEASE,
    cycleDateIso: "2026-12-31",
  });
  return buildRenewalFollowUpProjection({
    leaseId: LEASE,
    asOfIso: "2026-11-06T17:00:00.000Z",
    communicationState: "current",
    links: [],
    policy: {
      state: policy,
      ruleSet: DEFAULT_NOTICE_RULE_SET,
      version: null,
      updatedAtIso: null,
    },
    processFallback: {
      party: "unresolved_source",
      sourceRef: "renewal-process:v1:verify-renewal",
    },
    outreachContact: {
      party: waiting.party,
      lastContactIso: waiting.lastContactIso,
      cycleId: waiting.cycleId,
    },
  });
}

describe("R-S279-1 / BEH-S279-1: the card adds only what the step line does not say", () => {
  it("BEH-S279-1: beside the step's waiting line, the card shows the follow-up date and the policy note, nothing else", () => {
    const { container } = render(
      <RenewalFollowUpStatus projection={followUp()} stepWaitingShown />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Waiting on/);
    expect(text).not.toMatch(/Last (verified )?contact/);
    expect(text).not.toMatch(/an unresolved source/);
    expect(screen.getByText(UNCONFIRMED)).toBeInTheDocument();
    expect(
      screen.getByText("No follow-up date until the renewal notice rules are confirmed"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("span, strong")).toHaveLength(2);
  });

  it("AC-S279-1: on its own, the card names who and the last contact from the lease's evidence", () => {
    const { container } = render(<RenewalFollowUpStatus projection={followUp()} />);
    // The same words as the step's waiting line and the lease status (R-S279-1, word for word).
    expect(screen.getByText("Waiting on the owner")).toBeInTheDocument();
    expect(screen.getByText(/^Last verified contact: 11\/04\/2026/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/an unresolved source/);
    // With nothing sent yet there is no contact to verify.
    cleanup();
    render(
      <RenewalFollowUpStatus
        projection={followUp(
          "missing",
          evidenceInput([
            message({ acceptedAtMs: null, scheduledForMs: SENT_AT_MS + 24 * HOUR }),
          ]),
        )}
      />,
    );
    expect(screen.getByText("No contact recorded yet")).toBeInTheDocument();
    expect(screen.getByText("Waiting on the PMI KC team")).toBeInTheDocument();
  });
});

describe("R-S279-5 / AC-S279-4: the unconfirmed policy line names its owner", () => {
  it("an Editor reads the text; an Admin gets the link to Admin, Renewal notice rules", () => {
    for (const policy of ["missing", "unreadable"] as const) {
      render(<RenewalFollowUpStatus projection={followUp(policy)} />);
      expect(screen.getByText(UNCONFIRMED)).toBeInTheDocument();
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.queryByText(/Ask an Admin to confirm and version/)).toBeNull();
      cleanup();

      render(<RenewalFollowUpStatus admin projection={followUp(policy)} />);
      const line = document.querySelector(
        '[data-renewal-field="notice-rules-unconfirmed"]',
      ) as HTMLElement;
      expect(line).toHaveTextContent(UNCONFIRMED);
      expect(
        within(line).getByRole("link", { name: "Admin, Renewal notice rules" }),
      ).toHaveAttribute("href", NOTICE_RULES_ADMIN_HREF);
      cleanup();
    }
    expect(NOTICE_RULES_ADMIN_HREF).toBe(
      "/admin?task=renewal#admin-renewal-notice-rules",
    );
  });
});

describe("R-S279-3 / AC-S279-3: the check reads once, with its fix linked to the editor", () => {
  it("AC-S279-3: the stage line carries both facts and the fix; the fix opens the response editor", () => {
    const approvedAt = iso(SENT_AT_MS - 2 * 24 * HOUR);
    const actions: { action: RenewalWorkspaceAction; atIso: string }[] = [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
        atIso: approvedAt,
      },
      {
        action: {
          kind: "owner_response",
          outcome: "approved_terms",
          approval: {
            party: { kind: "representative", name: "Sample Agent", capacity: "Manager" },
            channel: { kind: "conversation", participants: "Sample Agent and staff" },
            occurredAt: approvedAt,
          },
        },
        atIso: approvedAt,
      },
      {
        action: { kind: "activity", activity: "tenant_offer", outcome: "done" },
        atIso: iso(SENT_AT_MS),
      },
      {
        action: { kind: "tenant_response", outcome: "awaiting_response" },
        atIso: iso(REPLY_AT_MS + HOUR),
      },
    ];
    const stage = projectRenewalStage(
      recordedState(LEASE, actions),
      context(evidenceInput([message({ audience: "tenant", replyAtMs: REPLY_AT_MS })])),
    );
    const editor = document.createElement("div");
    editor.id = "renewal-manual-tenant_response";
    editor.tabIndex = -1;
    document.body.append(editor);
    render(<RenewalStageHeader canEdit leaseId={LEASE} stage={stage} />);
    const header = screen.getByRole("region", { name: "Current renewal stage" });
    const line = header.querySelector('[data-renewal-field="stage-line"]')!;
    expect(line.textContent).toBe(
      "Needs a check: The staff record says waiting on the tenant. The tenant replied on 11/05/2026. Record the response.",
    );
    const fix = within(header).getByRole("link", { name: "Record the response" });
    expect(fix).toHaveAttribute("href", "#renewal-manual-tenant_response");
    // Once on the screen: no disclosure repeats the sentence.
    expect(
      [...header.querySelectorAll("p")].filter((node) =>
        (node.textContent ?? "").includes("The tenant replied on 11/05/2026"),
      ),
    ).toHaveLength(1);
    expect(within(header).queryByText("Needs a check", { exact: true })).toBeNull();
    editor.remove();
  });
});
