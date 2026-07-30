// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeSuspensionAdminPanel } from "@/components/admin/RuntimeSuspensionAdminPanel";
import type {
  RuntimeActionSuspensionRecord,
  RuntimeSuspensionActionOption,
} from "@/lib/firestore/runtime-action-suspensions";
import {
  RUNTIME_SUSPENSION_EXPECTED_ID_HEADER,
  RUNTIME_SUSPENSION_OPERATION_ID_HEADER,
  RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION,
} from "@/lib/operations/runtime-suspension-policy";

const ACTION_KEY = "gmail.renewal_notice.draft_create";
const OPERATION_ID = "0198f2c8-4f89-7a20-8f61-1e1d42af3ff1";
const SUSPENSION_ID = "0198f2c8-4f89-7a20-8f61-1e1d42af3ff2";

const actions: RuntimeSuspensionActionOption[] = [
  { key: "*", label: "All gated live effects", effectTarget: true },
  {
    key: ACTION_KEY,
    label: "Create renewal notice draft",
    effectTarget: true,
  },
];

const suspension: RuntimeActionSuspensionRecord = {
  action_key: ACTION_KEY,
  state: "suspended",
  suspension_id: SUSPENSION_ID,
  reason_code: "provider_outage",
  incident_ref: "INC-2048",
  suspended_by_uid: "admin-1",
  suspended_by_email: "admin@pmikcmetro.com",
  suspended_at: "2026-07-30T12:45:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel(
  options: {
    actions?: RuntimeSuspensionActionOption[];
    suspensions?: RuntimeActionSuspensionRecord[];
    unreadableActionKeys?: string[];
    hasUnknownRecords?: boolean;
    unavailableNote?: string;
  } = {},
) {
  return render(
    <RuntimeSuspensionAdminPanel
      initialActions={options.actions ?? actions}
      initialSnapshot={{
        suspensions: options.suspensions ?? [],
        unreadableActionKeys: options.unreadableActionKeys ?? [],
        hasUnknownRecords: options.hasUnknownRecords ?? false,
      }}
      unavailableNote={options.unavailableNote}
    />,
  );
}

function stubOperationId() {
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => OPERATION_ID),
  });
}

describe("RuntimeSuspensionAdminPanel", () => {
  it("renders the Sev-1 first action in plain language", () => {
    const { container } = renderPanel();

    expect(
      screen.getByText(
        /For a Sev-1 incident, stop the affected Production action here first/,
      ),
    ).toHaveTextContent("Do not wait for a deploy.");
    expect(container.textContent).not.toContain("—");
    expect(container.textContent).not.toMatch(
      /\b(?:control plane|source of truth|PMI handles)\b/i,
    );
  });

  it("exposes an out-of-scope source record for clear only, never for a new stop", async () => {
    const user = userEvent.setup();
    const readActionKey = "rentvine.lease.read";
    const readRepairOption: RuntimeSuspensionActionOption = {
      key: readActionKey,
      label: "Read Rentvine leases — clear existing record only",
      effectTarget: false,
    };
    renderPanel({
      actions: [...actions, readRepairOption],
      suspensions: [
        {
          ...suspension,
          action_key: readActionKey,
        },
      ],
    });

    await user.selectOptions(screen.getByLabelText(/^Production action/), readActionKey);
    await user.type(screen.getByLabelText(/^Exact confirmation/), readActionKey);
    expect(
      screen.getByText(
        "This read-only source is outside the effect-stop scope. This option is available only to clear its existing record.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update this action stop" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: `Prepare to clear ${readActionKey}` }),
    );
    await user.type(screen.getByLabelText(/^Exact confirmation/), readActionKey);
    expect(screen.getByRole("button", { name: "Clear this action stop" })).toBeEnabled();
  });

  it("prepares a generation-bound clear and requires byte-exact typed confirmation", async () => {
    stubOperationId();
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          suspension: {
            actionKey: ACTION_KEY,
            status: "clear",
            changed: true,
            replayed: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          actions,
          suspensions: [],
          unreadableActionKeys: [],
          hasUnknownRecords: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel({ suspensions: [suspension] });

    expect(screen.getByText("Provider outage")).toBeInTheDocument();
    expect(screen.getByText("INC-2048")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: `Prepare to clear ${ACTION_KEY}` }),
    );

    const confirmation = screen.getByLabelText(/^Exact confirmation/);
    const submit = screen.getByRole("button", {
      name: "Clear this action stop",
    });
    expect(submit).toBeDisabled();
    await user.type(confirmation, `${ACTION_KEY} `);
    expect(submit).toBeDisabled();
    await user.clear(confirmation);
    await user.type(confirmation, ACTION_KEY);
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, request] = fetchMock.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string>; method: string },
    ];
    expect(JSON.parse(request.body)).toEqual({
      action: "clear",
      actionKey: ACTION_KEY,
      reasonCode: "incident_resolved",
      incidentRef: "INC-2048",
      confirmation: ACTION_KEY,
    });
    expect(request.headers[RUNTIME_SUSPENSION_OPERATION_ID_HEADER]).toBe(OPERATION_ID);
    expect(request.headers[RUNTIME_SUSPENSION_EXPECTED_ID_HEADER]).toBe(SUSPENSION_ID);
    expect(
      await screen.findByText("No runtime suspensions are active."),
    ).toBeInTheDocument();
  });

  it("retries an ambiguous response with the same operation id and unchanged body", async () => {
    stubOperationId();
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(
        Response.json({
          suspension: {
            actionKey: ACTION_KEY,
            status: "suspended",
            suspensionId: SUSPENSION_ID,
            changed: false,
            replayed: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          actions,
          suspensions: [suspension],
          unreadableActionKeys: [],
          hasUnknownRecords: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    await user.selectOptions(screen.getByLabelText(/^Production action/), ACTION_KEY);
    await user.type(screen.getByLabelText(/^Exact confirmation/), ACTION_KEY);
    await user.click(screen.getByRole("button", { name: "Stop this action now" }));

    expect(await screen.findByText(/outcome is unknown/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry the same change" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const firstRequest = fetchMock.mock.calls[0][1] as {
      body: string;
      headers: Record<string, string>;
    };
    const retryRequest = fetchMock.mock.calls[1][1] as {
      body: string;
      headers: Record<string, string>;
    };
    expect(retryRequest.body).toBe(firstRequest.body);
    expect(retryRequest.headers[RUNTIME_SUSPENSION_OPERATION_ID_HEADER]).toBe(
      firstRequest.headers[RUNTIME_SUSPENSION_OPERATION_ID_HEADER],
    );
    expect(
      await screen.findByText(/earlier change was found and was not applied twice/i),
    ).toBeInTheDocument();
  });

  it("treats a malformed 200 as ambiguous and retries the exact request", async () => {
    stubOperationId();
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ suspension: {} }))
      .mockResolvedValueOnce(
        Response.json({
          suspension: {
            actionKey: ACTION_KEY,
            status: "suspended",
            suspensionId: SUSPENSION_ID,
            changed: false,
            replayed: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          actions,
          suspensions: [suspension],
          unreadableActionKeys: [],
          hasUnknownRecords: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    await user.selectOptions(screen.getByLabelText(/^Production action/), ACTION_KEY);
    await user.type(screen.getByLabelText(/^Exact confirmation/), ACTION_KEY);
    await user.click(screen.getByRole("button", { name: "Stop this action now" }));

    expect(await screen.findByText(/outcome is unknown/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry the same change" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const firstRequest = fetchMock.mock.calls[0][1] as {
      body: string;
      headers: Record<string, string>;
    };
    const retryRequest = fetchMock.mock.calls[1][1] as {
      body: string;
      headers: Record<string, string>;
    };
    expect(retryRequest.body).toBe(firstRequest.body);
    expect(retryRequest.headers[RUNTIME_SUSPENSION_OPERATION_ID_HEADER]).toBe(
      firstRequest.headers[RUNTIME_SUSPENSION_OPERATION_ID_HEADER],
    );
    expect(
      await screen.findByText(/earlier change was found and was not applied twice/i),
    ).toBeInTheDocument();
  });

  it("repairs a known unreadable record with the explicit unreadable clear precondition", async () => {
    stubOperationId();
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          suspension: {
            actionKey: ACTION_KEY,
            status: "clear",
            changed: true,
            replayed: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          actions,
          suspensions: [],
          unreadableActionKeys: [],
          hasUnknownRecords: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel({ unreadableActionKeys: [ACTION_KEY] });

    expect(
      screen.getByText(
        "This known action has an unreadable stop record. It remains closed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No runtime suspensions are active."),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: `Prepare to repair and clear ${ACTION_KEY}`,
      }),
    );
    await user.type(screen.getByLabelText(/^Exact confirmation/), ACTION_KEY);
    await user.click(screen.getByRole("button", { name: "Clear this action stop" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, request] = fetchMock.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string>; method: string },
    ];
    expect(JSON.parse(request.body)).toEqual({
      action: "clear",
      actionKey: ACTION_KEY,
      reasonCode: "incident_resolved",
      confirmation: ACTION_KEY,
    });
    expect(request.headers[RUNTIME_SUSPENSION_EXPECTED_ID_HEADER]).toBe(
      RUNTIME_SUSPENSION_UNREADABLE_EXPECTATION,
    );
    expect(
      await screen.findByText("No runtime suspensions are active."),
    ).toBeInTheDocument();
  });

  it("warns about unknown records without exposing an unknown identifier or claiming empty", () => {
    const unknownDocumentId = "uncommitted.secret-action";
    renderPanel({
      unreadableActionKeys: [unknownDocumentId],
      hasUnknownRecords: true,
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "One or more stop records use an unknown action key. Their identifiers are hidden.",
    );
    expect(screen.queryByText(unknownDocumentId)).not.toBeInTheDocument();
    expect(
      screen.queryByText("No runtime suspensions are active."),
    ).not.toBeInTheDocument();
  });

  it("does not treat an unavailable list as empty and enables changes only after refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        actions,
        suspensions: [],
        unreadableActionKeys: [],
        hasUnknownRecords: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel({ unavailableNote: "Current suspension state is unavailable." });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Current suspension state is unavailable.",
    );
    expect(
      screen.queryByText("No runtime suspensions are active."),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Production action/)).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Refresh current stops" }));
    expect(
      await screen.findByText("No runtime suspensions are active."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Production action/)).toBeEnabled();
  });
});
