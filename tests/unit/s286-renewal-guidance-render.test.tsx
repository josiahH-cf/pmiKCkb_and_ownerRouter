// @vitest-environment jsdom
// S286 rendered checks on synthetic data: the renewal Space guidance (R-S286-1, BEH-S286-1,
// AC-S286-1), an earlier renewal run kept as a record (R-S286-3, BEH-S286-3, AC-S286-3) and the
// renewal definition form (R-S286-5, AC-S286-5). Nothing here reaches a store or a provider.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProcessSummaryPanel } from "@/components/spaces/ProcessSummaryPanel";
import { RenewalProcessGuidance } from "@/components/spaces/RenewalProcessGuidance";
import { ProcessDefinitionDetailClient } from "@/components/workflows/ProcessDefinitionDetailClient";
import { WorkflowRunClient } from "@/components/workflows/WorkflowRunClient";
import type {
  ProcessDefinitionRecord,
  WorkflowRunRecord,
  WorkflowRunStepCheckRecord,
  WorkflowRunTimelineRecord,
} from "@/lib/firestore/types";
import {
  OWNER_RENEWAL_OUTREACH_STEP_TITLES,
  buildOwnerRenewalOutreachProcessTemplate,
} from "@/lib/lease-renewal/owner-renewal-outreach/process-template";
import {
  GUIDANCE_ONLY_RUN_RECORD_NOTICE,
  GUIDANCE_ONLY_RUN_START_REFUSAL,
  GUIDANCE_ONLY_STAFF_FIELD_NOTE,
} from "@/lib/processes/guidance-only";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const template = buildOwnerRenewalOutreachProcessTemplate({
  ownerUid: "process-owner-PLACEHOLDER",
  approverUid: "process-approver-PLACEHOLDER",
  sourceLinks: [
    { label: "Synthetic procedure", url: "https://example.test/procedure" },
    { label: "Synthetic wording", url: "https://example.test/wording" },
    { label: "Synthetic market notes", url: "javascript:alert(1)" },
  ],
});

function ownerDefinition(
  overrides: Partial<ProcessDefinitionRecord> = {},
): ProcessDefinitionRecord {
  return {
    ...template,
    id: "owner-renewal-outreach",
    space_id: "owner-renewal-outreach",
    required_starting_inputs: template.required_starting_inputs ?? [],
    source_links: template.source_links ?? [],
    action_references: [],
    steps: template.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      title: step.title,
      ...(step.description ? { description: step.description } : {}),
    })),
    status: "Active",
    active_version_id: "renewal-version-1",
    revision: "c".repeat(64),
    created_by_uid: "fixture-admin",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  } as ProcessDefinitionRecord;
}

const DESK = "/lease-renewal/live/desk";

describe("BEH-S286-1 the renewal Space guidance", () => {
  it("BEH-S286-1 shows the six published steps and source links under How this work is done, with the desk link and no Start run", () => {
    render(
      <RenewalProcessGuidance
        definition={ownerDefinition()}
        definitionId="owner-renewal-outreach"
        deskHref={DESK}
      />,
    );

    const guidance = screen.getByRole("region", { name: "How this work is done" });
    const steps = within(guidance).getAllByRole("list")[0];
    expect(within(steps).getAllByRole("listitem")).toHaveLength(6);
    for (const title of OWNER_RENEWAL_OUTREACH_STEP_TITLES)
      expect(within(guidance).getByText(title)).toBeInTheDocument();
    expect(
      within(guidance).getByRole("link", { name: "Synthetic procedure" }),
    ).toHaveAttribute("href", "https://example.test/procedure");
    // A non-web source shows as text, never as a link.
    expect(within(guidance).getByText("Synthetic market notes")).toBeInTheDocument();
    expect(
      within(guidance).queryByRole("link", { name: "Synthetic market notes" }),
    ).toBeNull();
    expect(
      within(guidance).getByRole("link", { name: "Open the Renewal Desk" }),
    ).toHaveAttribute("href", DESK);
    // R-S286-5: reviewers keep their way to the process content.
    expect(
      within(guidance).getByRole("link", { name: "View full process →" }),
    ).toHaveAttribute("href", "/processes/owner-renewal-outreach");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("Start run")).toBeNull();
  });

  it.each([
    ["no process", null],
    ["a draft", ownerDefinition({ status: "Draft", active_version_id: undefined })],
    ["a draft with a prior version", ownerDefinition({ status: "Draft" })],
    ["a retired process", ownerDefinition({ status: "Retired" })],
  ])(
    "AC-S286-1 with %s reads the desk sentence with the same link",
    (_label, definition) => {
      render(
        <RenewalProcessGuidance
          definition={definition}
          definitionId="owner-renewal-outreach"
          deskHref="/lease-renewal/live/desk/lease/4821"
        />,
      );
      expect(screen.getByText("Renewals are worked on the Renewal Desk.")).toBeVisible();
      expect(screen.getByRole("link", { name: "Open the Renewal Desk" })).toHaveAttribute(
        "href",
        "/lease-renewal/live/desk/lease/4821",
      );
      expect(screen.queryByText(OWNER_RENEWAL_OUTREACH_STEP_TITLES[0])).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );
});

describe("BEH-S286-3 an earlier renewal run on its run page", () => {
  const steps = ownerDefinition().steps;
  const run: WorkflowRunRecord = {
    id: "earlier-renewal-run",
    data_mode: "live",
    definition_id: "owner-renewal-outreach",
    space_id: "owner-renewal-outreach",
    definition_version_id: "renewal-version-1",
    process_name: "Owner Renewal Outreach + Comp Lookup",
    status: "In Progress",
    owner_uid: "process-approver-PLACEHOLDER",
    next_action: steps[0].title,
    due_date: "2026-11-10",
    started_by_uid: "fixture-editor",
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
  };
  const checks: WorkflowRunStepCheckRecord[] = [
    {
      id: `earlier-renewal-run_${steps[0].id}`,
      run_id: run.id,
      definition_id: run.definition_id,
      step_id: steps[0].id,
      step_title: steps[0].title,
      status: "Checked",
      created_at: "2026-11-02T00:00:00.000Z",
      updated_at: "2026-11-02T00:00:00.000Z",
    },
    {
      id: `earlier-renewal-run_${steps[1].id}`,
      run_id: run.id,
      definition_id: run.definition_id,
      step_id: steps[1].id,
      step_title: steps[1].title,
      status: "Skipped",
      reason: "Synthetic reason.",
      created_at: "2026-11-02T00:00:00.000Z",
      updated_at: "2026-11-02T00:00:00.000Z",
    },
  ];
  const timeline: WorkflowRunTimelineRecord[] = [
    {
      id: "timeline-1",
      run_id: run.id,
      actor_uid: "fixture-editor",
      event_type: "started",
      summary: "Synthetic start of the earlier run.",
      new_status: "In Progress",
      created_at: "2026-11-01T12:00:00.000Z",
    },
  ];

  it.each([true, false])(
    "BEH-S286-3 opens read only with its pinned steps and history (edit access %s)",
    (canEdit) => {
      render(
        <WorkflowRunClient
          canEdit={canEdit}
          initialChecks={checks}
          initialRun={run}
          initialSteps={steps}
          initialTimeline={timeline}
        />,
      );

      expect(screen.getByText(GUIDANCE_ONLY_RUN_RECORD_NOTICE)).toBeVisible();
      const checklist = screen.getByRole("heading", { name: "Checklist" })
        .parentElement as HTMLElement;
      const rows = within(checklist).getAllByRole("listitem");
      expect(rows).toHaveLength(6);
      expect(rows[0]).toHaveTextContent(`${steps[0].title}: Done`);
      expect(rows[1]).toHaveTextContent(
        `${steps[1].title}: Skipped (Reason: Synthetic reason.)`,
      );
      expect(rows[2]).toHaveTextContent(`${steps[2].title}: To do`);
      expect(
        within(checklist).getByRole("link", { name: "Open the Renewal Desk" }),
      ).toHaveAttribute("href", DESK);
      expect(screen.getByText("Synthetic start of the earlier run.")).toBeVisible();
      expect(screen.getByText("renewal-version-1")).toBeVisible();
      // No outcome, checklist or note control.
      expect(screen.queryByRole("button", { name: "Complete run" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Fail run" })).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("heading", { name: "Outcome" })).toBeNull();
      // AC-S286-3: no next action on the record.
      const nextAction = screen
        .getByText("Next Action")
        .parentElement!.querySelector("strong");
      expect(nextAction).toHaveTextContent(/^None$/);
    },
  );

  it("BEH-S286-3 keeps the outcome controls for a run on another Space", () => {
    render(
      <WorkflowRunClient
        canEdit
        initialChecks={[]}
        initialRun={{
          ...run,
          id: "move-in-run",
          definition_id: "move-in",
          space_id: "move-in",
        }}
        initialSteps={steps}
        initialTimeline={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Fail run" })).toBeEnabled();
    expect(screen.queryByText(GUIDANCE_ONLY_RUN_RECORD_NOTICE)).toBeNull();
  });

  it("AC-S286-3 leaves the record out of the process summary and keeps another run", () => {
    render(
      <ProcessSummaryPanel
        definition={ownerDefinition()}
        definitionId="owner-renewal-outreach"
        runs={[run, { ...run, id: "custom-run", definition_id: "custom-def" }]}
      />,
    );
    const runs = screen.getByRole("heading", { name: "Recent runs" })
      .nextElementSibling as HTMLElement;
    const rows = within(runs).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(`In Progress: ${steps[0].title}`);

    cleanup();
    render(
      <ProcessSummaryPanel
        definition={ownerDefinition()}
        definitionId="owner-renewal-outreach"
        runs={[run]}
      />,
    );
    expect(screen.getByText("No workflow runs yet.")).toBeVisible();
  });
});

describe("R-S286-5 the renewal definition form", () => {
  it("R-S286-5 shows the run owner and approver as not used and offers no Start run", () => {
    render(
      <ProcessDefinitionDetailClient
        canEdit
        initialDefinition={ownerDefinition({ status: "Draft" })}
        initialRuns={[]}
      />,
    );

    expect(screen.getAllByText(GUIDANCE_ONLY_STAFF_FIELD_NOTE)).toHaveLength(2);
    expect(screen.getByText(/Owner UID/)).toBeInTheDocument();
    expect(screen.getByText(/Approver UID/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Owner UID" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Approver UID" })).toBeNull();
    expect(screen.queryByDisplayValue("process-owner-PLACEHOLDER")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start run" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Start run" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Renewal work" })).toBeVisible();
    expect(screen.getByText(GUIDANCE_ONLY_RUN_START_REFUSAL)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open the Renewal Desk" })).toHaveAttribute(
      "href",
      DESK,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("AC-S286-5 saves a renewal definition without sending the unused staff fields", async () => {
    const user = userEvent.setup();
    const saved = ownerDefinition({ status: "Draft", name: "Edited outreach" });
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => Response.json({ definition: saved, runs: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ProcessDefinitionDetailClient
        canEdit
        initialDefinition={ownerDefinition({ status: "Draft" })}
        initialRuns={[]}
      />,
    );

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Edited outreach");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/process-definitions/owner-renewal-outreach");
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ name: "Edited outreach" });
    expect(body).not.toHaveProperty("owner_uid");
    expect(body).not.toHaveProperty("default_approver_uid");
    expect(await screen.findByText("Process definition saved.")).toBeVisible();
  });

  it("AC-S286-5 keeps both inputs and Start run on a non-renewal definition", () => {
    render(
      <ProcessDefinitionDetailClient
        canEdit
        initialDefinition={ownerDefinition({
          id: "move-in",
          space_id: "move-in",
          status: "Draft",
          owner_uid: "staff-owner-1",
          default_approver_uid: "staff-approver-1",
        })}
        initialRuns={[]}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Owner UID" })).toHaveValue(
      "staff-owner-1",
    );
    expect(screen.getByRole("textbox", { name: "Approver UID" })).toHaveValue(
      "staff-approver-1",
    );
    expect(screen.getByRole("button", { name: "Start run" })).toBeEnabled();
    expect(screen.queryByText(GUIDANCE_ONLY_STAFF_FIELD_NOTE)).toBeNull();
  });
});
