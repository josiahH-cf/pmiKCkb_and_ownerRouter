// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpaceDetailClient } from "@/components/spaces/SpaceDetailClient";

const templateRecord = {
  id: "tpl-1",
  space_id: "lease-renewals",
  name: "Owner Renewal Follow-Up",
  owner_uid: "owner-1",
  audience: "Owner" as const,
  channel: "Gmail" as const,
  body: "Original body",
  status: "Draft" as const,
};

const seed = {
  placeholders: [],
  sops: [],
  templates: [templateRecord],
  tools: [],
};

let fetchMock: ReturnType<typeof vi.fn>;

// All five mount GETs return this combined shape; each caller destructures the key it needs, so mode
// flips to "api". PATCH echoes the merged record; DELETE is a 204-style empty ok.
function loadResponse() {
  return {
    ok: true,
    json: async () => ({
      sops: [],
      templates: [templateRecord],
      placeholders: [],
      tools: [],
      changeLog: [],
    }),
  };
}

function patchCalls() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({ template: { ...templateRecord, ...body } }),
      };
    }
    if (method === "DELETE") {
      return { ok: true, json: async () => ({}) };
    }
    return loadResponse();
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderClient(props: Partial<Parameters<typeof SpaceDetailClient>[0]> = {}) {
  return render(
    <SpaceDetailClient
      canApprove
      canEdit
      seed={seed}
      spaceId="lease-renewals"
      spaceName="Lease Renewals"
      {...props}
    />,
  );
}

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  // Wait for "api" mode so mutations hit the routes instead of local seed state.
  await waitFor(() =>
    expect(screen.getByText("Editable API connected.")).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
}

describe("Space detail template editor (F-TMPL-1)", () => {
  it("lets an Editor edit a template body and save through the API", async () => {
    const user = userEvent.setup();
    renderClient({ canSoftDelete: true });
    await openEditor(user);

    const bodyField = screen.getByLabelText("Template body");
    await user.clear(bodyField);
    await user.type(bodyField, "Updated body");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchCalls().length).toBe(1));
    const [url, init] = patchCalls()[0];
    expect(String(url)).toBe("/api/templates/tpl-1");
    expect(JSON.parse(String(init.body))).toMatchObject({ body: "Updated body" });
  });

  it("submits a Draft template for review", async () => {
    const user = userEvent.setup();
    renderClient();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(patchCalls().length).toBe(1));
    expect(JSON.parse(String(patchCalls()[0][1].body))).toMatchObject({
      status: "In Review",
    });
  });

  it("approves a template and sends a review timestamp but not an approver uid (server stamps it)", async () => {
    const user = userEvent.setup();
    renderClient();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Mark Approved" }));
    await waitFor(() => expect(patchCalls().length).toBe(1));
    const body = JSON.parse(String(patchCalls()[0][1].body));
    expect(body).toMatchObject({ status: "Approved" });
    expect(body).toHaveProperty("last_reviewed_at");
    expect(body).not.toHaveProperty("approved_by_uid");
  });

  it("disables Mark Approved for a user without approve capability", async () => {
    const user = userEvent.setup();
    renderClient({ canApprove: false });
    await openEditor(user);
    expect(screen.getByRole("button", { name: "Mark Approved" })).toBeDisabled();
  });

  it("soft-deletes a template with softDelete capability and drops it from the list", async () => {
    const user = userEvent.setup();
    renderClient({ canSoftDelete: true });
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(del).toBeTruthy();
      expect(String(del![0])).toBe("/api/templates/tpl-1");
    });
    await waitFor(() =>
      expect(screen.queryByText("Owner Renewal Follow-Up")).not.toBeInTheDocument(),
    );
  });

  it("disables Delete for a user without softDelete capability", async () => {
    const user = userEvent.setup();
    renderClient({ canSoftDelete: false });
    await openEditor(user);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
