import { createHash } from "node:crypto";
import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { expect, vi } from "vitest";

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { Role } from "@/lib/auth/roles";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import type { RenewalLeaseWorkspace } from "@/lib/lease-renewal/desk-model";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import {
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S143-S145 harness: the real RenewalWorkspace over a sample lease, with a stateful fake of the
// existing workspace route that applies the same planner, the same cycle/revision fence and
// conflict refusal, and the same at-most-once operation replay as the real store. Every request
// is recorded so tests can prove that switching and selecting send nothing.

export interface FetchCall {
  readonly method: string;
  readonly url: string;
  readonly body: Record<string, unknown> | null;
}

function preparation(channel: "owner" | "tenant", cycleId: string | null) {
  const inputs = emptyMessagePreparationInputs();
  return {
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId,
    saved: null,
    inputs,
    facts: {
      channel,
      names: [channel === "owner" ? "Fixture Owner" : "Fixture Tenant"],
      address: "318 Cedar Street, Unit 7",
      currentBaseRent: null,
      leaseEndDate: "2026-12-31",
      ownerTerms: null,
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
    },
    sourceFingerprint: "a".repeat(64),
    needsReview: true,
    signatureMatchesActor: false,
    publication: { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
    previousDraftAttempts: [],
  };
}

export interface RouteFake {
  readonly calls: FetchCall[];
  readonly state: () => RenewalWorkspaceState | null;
  /** Replace the stored record, as a concurrent save by another operator would. */
  readonly replace: (state: RenewalWorkspaceState) => void;
  /** Hold the next record response until the returned release is called. */
  readonly holdNextRecord: () => () => void;
  /** Apply the next record on the server, then lose its response on the way back. */
  readonly loseNextRecordResponse: () => void;
  readonly writes: () => FetchCall[];
}

export interface RouteFakeOptions {
  /** Replace the message preparation read, e.g. with a reviewed, publishable preparation. */
  readonly messagePreparation?: (
    channel: "owner" | "tenant",
    cycleId: string | null,
  ) => Record<string, unknown>;
  /** Answer a message preparation POST (draft preview, creation, save); default 404. */
  readonly messagePost?: (body: Record<string, unknown> | null) => Response;
  /** Answer any other lease-renewal route this test drives; default an empty JSON object. */
  readonly other?: (call: FetchCall) => Response | null;
}

export function stubRenewalRoutes(
  initial: RenewalWorkspaceState | null,
  options: RouteFakeOptions = {},
): RouteFake {
  let stored = initial;
  const calls: FetchCall[] = [];
  const replays = new Map<string, { hash: string; state: RenewalWorkspaceState }>();
  let hold: Promise<void> | null = null;
  let loseResponse = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    calls.push({ method, url, body });
    if (url.includes("/api/lease-renewal/message-preparation")) {
      if (method !== "GET")
        return (
          options.messagePost?.(body) ??
          Response.json({ error: "Not handled by this test." }, { status: 404 })
        );
      const channel = url.includes("channel=owner") ? "owner" : "tenant";
      return Response.json(
        options.messagePreparation?.(channel, stored?.cycleId ?? null) ??
          preparation(channel, stored?.cycleId ?? null),
      );
    }
    if (url.includes("/api/lease-renewal/document-handoff"))
      return Response.json({
        snapshot: null,
        blockers: [],
        readiness: { state: "connected" },
        catalogVersion: "fixture",
        attempts: [],
      });
    if (url.includes("/api/lease-renewal/workspace")) {
      if (method === "GET")
        return Response.json({ state: stored, activity: [], observations: [] });
      if (body?.operation === "record") {
        if (hold) await hold;
        const operationId = String(body.operationId);
        const request: Record<string, unknown> = { ...body };
        delete request.operationId;
        const hash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
        const prior = replays.get(operationId);
        if (prior) {
          if (prior.hash !== hash)
            return Response.json(
              { error: "This recorded request changed. Reload before correcting it." },
              { status: 409 },
            );
          return Response.json({ state: prior.state, writeback_paused: true });
        }
        if (!stored)
          return Response.json(
            { error: "Select the reviewed renewal cycle first." },
            { status: 409 },
          );
        if (stored.cycleId !== body.cycleId || stored.revision !== body.expectedRevision)
          return Response.json(
            {
              error:
                "Another operator changed this cycle. Reload and review the current record.",
            },
            { status: 409 },
          );
        stored = planRenewalWorkspaceAction(stored, body.action as never, {
          eventId: operationId,
          actorUid: "fixture-staff",
          recordedAt: "2026-09-30T17:00:00.000Z",
        });
        replays.set(operationId, { hash, state: stored });
        if (loseResponse) {
          // The record is applied; only its response is lost on the way back.
          loseResponse = false;
          throw new TypeError("Failed to fetch");
        }
        return Response.json({ state: stored, writeback_paused: true });
      }
    }
    return options.other?.({ method, url, body }) ?? Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    state: () => stored,
    replace: (state) => {
      stored = state;
    },
    loseNextRecordResponse: () => {
      loseResponse = true;
    },
    holdNextRecord: () => {
      let release: () => void = () => undefined;
      hold = new Promise<void>((resolve) => {
        release = () => {
          hold = null;
          resolve();
        };
      });
      return release;
    },
    writes: () => calls.filter((call) => call.method !== "GET"),
  };
}

export async function settle(rounds = 5) {
  for (let index = 0; index < rounds; index += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

export interface WorkspaceRenderOptions {
  /** A workspace rebuilt by the real builders (e.g. from actionFixture); default: the sample lease. */
  readonly workspace?: RenewalLeaseWorkspace;
  readonly leaseId?: string;
  readonly role?: Role;
  readonly manual?: RenewalWorkspaceState | null;
  readonly manualReadUnavailable?: boolean;
  readonly workflowAvailable?: boolean;
  readonly rentChargeStatus?: readonly RentChargeOutcomeRow[];
  readonly sheetWritebackPaused?: boolean;
  /** Any further existing RenewalWorkspace props, such as a provider panel or read failures. */
  readonly extra?: Partial<ComponentProps<typeof RenewalWorkspace>>;
}

export function workspaceElement(options: WorkspaceRenderOptions = {}) {
  const base =
    options.workspace ??
    getRenewalLeaseWorkspace(options.leaseId ?? "lease-318-cedar-7")!;
  const workspace =
    options.workflowAvailable === false ? { ...base, workflowAvailable: false } : base;
  return (
    <RenewalWorkspace
      {...options.extra}
      workspace={workspace}
      role={options.role ?? "Editor"}
      {...(options.rentChargeStatus
        ? { rentChargeStatus: options.rentChargeStatus }
        : {})}
      {...(options.sheetWritebackPaused ? { sheetWritebackPaused: true } : {})}
      {...(options.manualReadUnavailable
        ? { manualReadUnavailable: true }
        : { manualState: options.manual ?? null })}
    />
  );
}

export async function renderWorkspace(options: WorkspaceRenderOptions = {}) {
  const view = render(workspaceElement(options));
  const workspace = { workflowAvailable: options.workflowAvailable !== false };
  if (workspace.workflowAvailable && !options.manualReadUnavailable) {
    await within(screen.getByRole("region", { name: "Owner approval" })).findByRole(
      "region",
      { name: "Owner message preparation" },
    );
  }
  await settle();
  return view;
}

/** The visible Focus pane region. */
export function focusPane() {
  const pane = screen.getByRole("region", { name: "Focus view" });
  expect(pane).toBeVisible();
  return pane;
}
