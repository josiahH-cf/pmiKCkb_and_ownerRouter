import { afterEach, describe, expect, it, vi } from "vitest";

const { changeMock, listMock, optionsMock } = vi.hoisted(() => ({
  changeMock: vi.fn(),
  listMock: vi.fn(),
  optionsMock: vi.fn(),
}));

vi.mock("@/lib/firestore/runtime-action-suspensions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/firestore/runtime-action-suspensions")>();
  return {
    ...actual,
    changeRuntimeActionSuspension: changeMock,
    listRuntimeActionSuspensions: listMock,
    listRuntimeSuspensionActionOptions: optionsMock,
  };
});

import { GET, POST } from "@/app/api/admin/runtime-suspension/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { RuntimeSuspensionStoreError } from "@/lib/firestore/runtime-action-suspensions";

const ACTION_KEY = "google_sheets.renewal_checklist.writeback";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const SUSPENSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCESS_KEY_SHAPED_TEST_VALUE = "AK" + "IAIOSFODNN7EXAMPLE";

function setRole(role: "Admin" | "Approver" | "Editor" | null) {
  setAuthResolverForTest(
    role === null
      ? () => null
      : () => ({
          uid: `${role.toLowerCase()}-1`,
          email: `${role.toLowerCase()}-1@pmikcmetro.com`,
          hd: "pmikcmetro.com",
          role,
        }),
  );
}

function body(
  over: Partial<{
    action: "suspend" | "clear";
    actionKey: string;
    reasonCode: string;
    incidentRef: string;
    confirmation: string;
    extra: boolean;
  }> = {},
) {
  return {
    action: "suspend",
    actionKey: ACTION_KEY,
    reasonCode: "provider_outage",
    confirmation: ACTION_KEY,
    ...over,
  };
}

function request(
  payload: unknown,
  headers: Record<string, string> = {
    "idempotency-key": OPERATION_ID,
  },
) {
  return new Request("http://localhost/api/admin/runtime-suspension", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
  listMock.mockResolvedValue({
    suspensions: [],
    unreadableActionKeys: [],
    hasUnknownRecords: false,
  });
  optionsMock.mockReturnValue([]);
  changeMock.mockResolvedValue({
    actionKey: ACTION_KEY,
    status: "suspended",
    suspensionId: SUSPENSION_ID,
    changed: true,
    replayed: false,
  });
});

describe("Admin runtime-suspension route", () => {
  it("GET requires Admin before reading state", async () => {
    setRole(null);
    expect((await GET()).status).toBe(401);
    setRole("Editor");
    expect((await GET()).status).toBe(403);
    setRole("Approver");
    expect((await GET()).status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("GET returns the committed options and current strict records for an Admin", async () => {
    setRole("Admin");
    optionsMock.mockReturnValue([
      { key: "*", label: "All gated live effects", effectTarget: true },
    ]);
    listMock.mockResolvedValue({
      suspensions: [
        {
          action_key: ACTION_KEY,
          state: "suspended",
          suspension_id: SUSPENSION_ID,
          reason_code: "provider_outage",
          suspended_by_uid: "admin-1",
          suspended_by_email: "admin-1@pmikcmetro.com",
          suspended_at: "2026-07-30T12:00:00.000Z",
        },
      ],
      unreadableActionKeys: [],
      hasUnknownRecords: false,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      actions: [{ key: "*", label: "All gated live effects", effectTarget: true }],
      suspensions: [{ action_key: ACTION_KEY, suspension_id: SUSPENSION_ID }],
      unreadableActionKeys: [],
      hasUnknownRecords: false,
    });
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("GET identifies a known unreadable target so an Admin can clear it safely", async () => {
    setRole("Admin");
    listMock.mockResolvedValue({
      suspensions: [],
      unreadableActionKeys: [ACTION_KEY],
      hasUnknownRecords: true,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      actions: [],
      suspensions: [],
      unreadableActionKeys: [ACTION_KEY],
      hasUnknownRecords: true,
    });
  });

  it.each(["Editor", "Approver"] as const)(
    "POST refuses %s before parsing or calling the store",
    async (role) => {
      setRole(role);
      const response = await POST(request({ not: "the schema" }));
      expect(response.status).toBe(403);
      expect(changeMock).not.toHaveBeenCalled();
    },
  );

  it("POST returns 401 before parsing for an unauthenticated request", async () => {
    setRole(null);
    const response = await POST(request({ not: "the schema" }));
    expect(response.status).toBe(401);
    expect(changeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an extra body field", body({ extra: true })],
    ["a confirmation mismatch", body({ confirmation: `${ACTION_KEY} ` })],
    ["an unknown reason", body({ reasonCode: "because" })],
    ["a lowercase incident reference", body({ incidentRef: "inc-42" })],
    ["an incident email", body({ incidentRef: "resident@example.com" })],
    ["a resident-shaped incident reference", body({ incidentRef: "RESIDENT_JANE_DOE" })],
    ["a resident-name-shaped incident reference", body({ incidentRef: "JANE_DOE" })],
    ["a unit-shaped incident reference", body({ incidentRef: "UNIT_4B" })],
    ["an address-shaped incident reference", body({ incidentRef: "OAK_STREET_12" })],
    ["a token-shaped incident reference", body({ incidentRef: "TOKEN_ABC" })],
    [
      "an access-key-shaped incident reference",
      body({ incidentRef: ACCESS_KEY_SHAPED_TEST_VALUE }),
    ],
    ["a compact unit reference", body({ incidentRef: "UNIT4B" })],
    ["a compact resident reference", body({ incidentRef: "RESIDENT123" })],
    ["a compact name reference", body({ incidentRef: "JOHNDOE42" })],
    [
      "a long secret-shaped incident reference",
      body({ incidentRef: "0123456789ABCDEF0123456789ABCDEF" }),
    ],
    ["whitespace around the action key", body({ actionKey: ` ${ACTION_KEY}` })],
  ])("strictly rejects %s before calling the store", async (_label, payload) => {
    setRole("Admin");
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect(changeMock).not.toHaveBeenCalled();
  });

  it("returns a value-free validation error for an adversarial strict-body field", async () => {
    setRole("Admin");
    const response = await POST(
      request({
        ...body(),
        RESIDENT_JANE_DOE: "CUSTOMER_VALUE_123",
      }),
    );
    expect(response.status).toBe(400);
    const responseText = await response.text();
    expect(responseText).not.toContain("RESIDENT_JANE_DOE");
    expect(responseText).not.toContain("CUSTOMER_VALUE_123");
    expect(changeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["non-UUID", { "idempotency-key": "operation-1" }],
    ["uppercase", { "idempotency-key": "11111111-1111-4111-8111-AAAAAAAAAAAA" }],
  ])("rejects a %s idempotency key before calling the store", async (_label, headers) => {
    setRole("Admin");
    const response = await POST(request(body(), headers));
    expect(response.status).toBe(400);
    expect(changeMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid clear precondition header before calling the store", async () => {
    setRole("Admin");
    const response = await POST(
      request(body({ action: "clear", reasonCode: "incident_resolved" }), {
        "idempotency-key": OPERATION_ID,
        "x-expected-suspension-id": "not-a-generation",
      }),
    );
    expect(response.status).toBe(400);
    expect(changeMock).not.toHaveBeenCalled();
  });

  it("passes the exact five-field suspend body and operation id to the store", async () => {
    setRole("Admin");
    const response = await POST(
      request(body({ incidentRef: "INC-42" }), {
        "idempotency-key": OPERATION_ID,
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      suspension: {
        actionKey: ACTION_KEY,
        status: "suspended",
        suspensionId: SUSPENSION_ID,
        changed: true,
        replayed: false,
      },
    });
    expect(changeMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "Admin" }),
      {
        action: "suspend",
        actionKey: ACTION_KEY,
        reasonCode: "provider_outage",
        incidentRef: "INC-42",
        confirmation: ACTION_KEY,
      },
      { operationId: OPERATION_ID },
    );
  });

  it("accepts the documented dotted Sev incident-reference format", async () => {
    setRole("Admin");
    const response = await POST(
      request(body({ incidentRef: "SEV1.2026-001" }), {
        "idempotency-key": OPERATION_ID,
      }),
    );
    expect(response.status).toBe(200);
    expect(changeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ incidentRef: "SEV1.2026-001" }),
      { operationId: OPERATION_ID },
    );
  });

  it("passes the exact expected generation for clear", async () => {
    setRole("Admin");
    await POST(
      request(body({ action: "clear", reasonCode: "incident_resolved" }), {
        "idempotency-key": OPERATION_ID,
        "x-expected-suspension-id": SUSPENSION_ID,
      }),
    );
    expect(changeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "clear" }),
      {
        operationId: OPERATION_ID,
        expectedSuspensionId: SUSPENSION_ID,
      },
    );
  });

  it("returns a typed 409 so the client can reconcile before confirming again", async () => {
    setRole("Admin");
    changeMock.mockRejectedValue(
      new RuntimeSuspensionStoreError(
        "runtime_suspension_conflict",
        "Runtime suspension state changed. Refresh and confirm the current state.",
        409,
      ),
    );
    const response = await POST(
      request(body({ action: "clear", reasonCode: "incident_resolved" }), {
        "idempotency-key": OPERATION_ID,
        "x-expected-suspension-id": SUSPENSION_ID,
      }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "runtime_suspension_conflict",
      error: "Runtime suspension state changed. Refresh and confirm the current state.",
    });
  });

  it("surfaces unknown committed-key membership as a typed 400", async () => {
    setRole("Admin");
    changeMock.mockRejectedValue(
      new RuntimeSuspensionStoreError(
        "runtime_suspension_unknown_action",
        "The runtime suspension target is not a committed Action Registry key.",
        400,
      ),
    );
    const response = await POST(
      request(
        body({
          actionKey: "unknown.action",
          confirmation: "unknown.action",
        }),
      ),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "runtime_suspension_unknown_action",
    });
  });
});
