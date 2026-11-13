import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/workflows", () => ({
  getProcessDefinition: vi.fn(),
  listProcessDefinitions: vi.fn(),
  listWorkflowRuns: vi.fn(async () => []),
  startWorkflowRun: vi.fn(),
  updateProcessDefinition: vi.fn(),
}));
vi.mock("@/lib/publication/process-definition-readback", () => ({
  readProcessDefinitionPublication: vi.fn(async () => ({ state: "not_published" })),
}));
vi.mock("@/lib/lease-renewal/live-desk", () => ({
  loadLiveRenewalDesk: vi.fn(async () => ({ status: "read_error" })),
}));

import { GET as GET_ANTICIPATED_WORK } from "@/app/api/anticipated-work/route";
import { PATCH as PATCH_DEFINITION } from "@/app/api/process-definitions/[definitionId]/route";
import { POST as POST_RUN } from "@/app/api/process-definitions/[definitionId]/runs/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";
import {
  listProcessDefinitions,
  startWorkflowRun,
  updateProcessDefinition,
} from "@/lib/firestore/workflows";
import {
  GUIDANCE_ONLY_PROCESS_DEFINITION_IDS,
  GUIDANCE_ONLY_RUN_START_REFUSAL,
} from "@/lib/processes/guidance-only";

// S286 R-S286-2 and BEH-S286-2 at the route: a direct request to start a run for any renewal
// definition is refused with the staff sentence before the run start service is reached. R-S286-1:
// the anticipated-work lane offers no renewal start. R-S286-5: a renewal definition saves with the
// run owner and approver left empty. The repository is doubled; no store is touched.

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(startWorkflowRun).mockReset();
  vi.mocked(updateProcessDefinition).mockReset();
  vi.mocked(listProcessDefinitions).mockReset();
});

const ROLES = ["Editor", "Approver", "Admin"] as const;

function signIn(role: (typeof ROLES)[number]) {
  setAuthResolverForTest(() => ({
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
    uid: `${role.toLowerCase()}-1`,
  }));
}

function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/process-definitions", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });
}

function definitionContext(definitionId: string) {
  return { params: Promise.resolve({ definitionId }) };
}

describe("BEH-S286-2 the run start route", () => {
  for (const definitionId of GUIDANCE_ONLY_PROCESS_DEFINITION_IDS)
    for (const role of ROLES)
      it(`BEH-S286-2 refuses a ${definitionId} start from an ${role} with the staff sentence`, async () => {
        signIn(role);
        const response = await POST_RUN(
          jsonRequest({ expected_revision: "a".repeat(64), note: "Synthetic start." }),
          definitionContext(definitionId),
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: GUIDANCE_ONLY_RUN_START_REFUSAL });
        expect(startWorkflowRun).not.toHaveBeenCalled();
      });

  it("AC-S286-2 refuses a renewal start with an empty body too", async () => {
    signIn("Editor");
    const response = await POST_RUN(
      new Request("http://localhost/api/process-definitions/lease-renewal/runs", {
        method: "POST",
      }),
      definitionContext("lease-renewal"),
    );
    expect(response.status).toBe(409);
    expect(startWorkflowRun).not.toHaveBeenCalled();
  });

  it("BEH-S286-2 still passes a start on another Space to the run start service", async () => {
    signIn("Editor");
    vi.mocked(startWorkflowRun).mockResolvedValue({ id: "run-1" } as WorkflowRunRecord);
    const response = await POST_RUN(
      jsonRequest({ note: "Synthetic start." }),
      definitionContext("move-in"),
    );
    expect(response.status).toBe(201);
    expect(startWorkflowRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startWorkflowRun).mock.calls[0][1]).toBe("move-in");
  });
});

describe("R-S286-1 the anticipated-work lane offers no renewal start", () => {
  it("R-S286-1 leaves the three renewal definitions out of the startable set", async () => {
    signIn("Admin");
    vi.mocked(listProcessDefinitions).mockResolvedValue([
      { id: "lease-renewal", status: "Active" },
      { id: "owner-renewal-outreach", status: "Active" },
      { id: "tenant-renewal-notice", status: "Draft" },
      { id: "move-in", status: "Draft" },
      { id: "custom-retired", status: "Retired" },
    ] as ProcessDefinitionRecord[]);

    const body = (await (await GET_ANTICIPATED_WORK()).json()) as {
      startableDefinitionIds: string[];
    };

    expect(body.startableDefinitionIds).toEqual(["move-in"]);
  });
});

describe("R-S286-5 the definition save route", () => {
  it("R-S286-5 accepts a renewal save with the run owner and approver left empty and never sends them", async () => {
    signIn("Editor");
    vi.mocked(updateProcessDefinition).mockResolvedValue({
      id: "owner-renewal-outreach",
    } as ProcessDefinitionRecord);

    const response = await PATCH_DEFINITION(
      jsonRequest(
        {
          expected_revision: "b".repeat(64),
          name: "Owner Renewal Outreach + Comp Lookup",
          owner_uid: "",
          default_approver_uid: "",
        },
        "PATCH",
      ),
      definitionContext("owner-renewal-outreach"),
    );

    expect(response.status).toBe(200);
    const input = vi.mocked(updateProcessDefinition).mock.calls[0][2];
    expect(input).toMatchObject({ name: "Owner Renewal Outreach + Comp Lookup" });
    expect(input).not.toHaveProperty("owner_uid");
    expect(input).not.toHaveProperty("default_approver_uid");
  });

  it("R-S286-5 still requires the fields on a non-renewal definition", async () => {
    signIn("Editor");
    const response = await PATCH_DEFINITION(
      jsonRequest(
        {
          expected_revision: "b".repeat(64),
          name: "Move-In",
          owner_uid: "",
          default_approver_uid: "",
        },
        "PATCH",
      ),
      definitionContext("move-in"),
    );

    expect(response.status).toBe(400);
    expect(updateProcessDefinition).not.toHaveBeenCalled();
  });
});
