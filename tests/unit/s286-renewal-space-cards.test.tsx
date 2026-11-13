// @vitest-environment jsdom
// S286 R-S286-4, BEH-S286-4 and AC-S286-4: a renewal Space card reads "Guidance" when its process
// has a published version and "Worked on the Renewal Desk" otherwise, in the neutral reference
// tone, never "Needs a process" in the blocked tone. A missing connection still comes first, and
// every other Space keeps its state. R-S286-6: the directory says read, not run. Synthetic data.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageCapability: vi.fn(async () => ({
    uid: "fixture-editor",
    email: "fixture-editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  })),
}));
vi.mock("@/lib/firestore/workflows", () => ({
  listProcessDefinitions: vi.fn(async () => []),
}));
vi.mock("@/lib/connections/connector-presence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/connections/connector-presence")>()),
  readConnectorPresence: vi.fn(),
}));
vi.mock("@/lib/approval/needs-decision-gather", () => ({
  gatherNeedsDecisionInbox: vi.fn(async () => ({
    rows: [],
    counts: { total: 0, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 0 },
  })),
  renewalWaitingCount: vi.fn(() => 0),
}));

import SpacesPage from "@/app/spaces/page";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import type { ProcessDefinitionRecord } from "@/lib/firestore/types";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import {
  SPACE_CARD_STATE_LABEL,
  SPACE_CARD_STATE_TONE,
  computeSpaceCardState,
} from "@/lib/space-card-state";
import { launchSpaces, type LaunchSpace } from "@/lib/spaces";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Every required connector value present, so only the process state decides a card. */
const ALL_PRESENT = new Proxy({} as Record<string, boolean>, { get: () => true });
const NONE_PRESENT: Record<string, boolean> = {};

const RENEWAL_SPACES = launchSpaces.filter(
  (space) => space.processCategory === "Renewals",
) as LaunchSpace[];
const moveIn = launchSpaces.find((space) => space.id === "move-in")!;

type DefinitionState = { status: string; active_version_id?: string };
const DEFINITION_STATES: ReadonlyArray<[string, DefinitionState | null, string]> = [
  ["no definition", null, "renewal-desk"],
  ["a draft", { status: "Draft" }, "renewal-desk"],
  [
    "a draft with a prior version",
    { status: "Draft", active_version_id: "v-1" },
    "renewal-desk",
  ],
  ["a pending definition", { status: "Pending Approval" }, "renewal-desk"],
  [
    "a published definition",
    { status: "Active", active_version_id: "v-1" },
    "renewal-guidance",
  ],
  ["an Active definition with no version", { status: "Active" }, "renewal-desk"],
  [
    "a retired definition",
    { status: "Retired", active_version_id: "v-1" },
    "renewal-desk",
  ],
];

function definitionsWith(space: LaunchSpace, state: DefinitionState | null) {
  return new Map(state ? [[space.processDefinitionId!, state]] : []);
}

describe("R-S286-4 renewal card state", () => {
  for (const space of RENEWAL_SPACES)
    it.each(DEFINITION_STATES)(
      `BEH-S286-4 ${space.id} with %s reads its guidance state in the neutral tone`,
      (_label, state, expected) => {
        const card = computeSpaceCardState(
          space,
          definitionsWith(space, state),
          ALL_PRESENT,
        );
        expect(card).toBe(expected);
        expect(SPACE_CARD_STATE_TONE[card]).toBe("reference");
        expect(card).not.toBe("needs-a-process");
      },
    );

  it("AC-S286-4 labels the two states exactly", () => {
    expect(SPACE_CARD_STATE_LABEL["renewal-guidance"]).toBe("Guidance");
    expect(SPACE_CARD_STATE_LABEL["renewal-desk"]).toBe("Worked on the Renewal Desk");
    expect(SPACE_CARD_STATE_TONE["renewal-guidance"]).toBe("reference");
    expect(SPACE_CARD_STATE_TONE["renewal-desk"]).toBe("reference");
  });

  it("AC-S286-4 reads the desk state for a bare id set and for an unread definition set", () => {
    for (const space of RENEWAL_SPACES) {
      expect(computeSpaceCardState(space, new Set(), ALL_PRESENT)).toBe("renewal-desk");
      expect(
        computeSpaceCardState(space, new Set([space.processDefinitionId!]), ALL_PRESENT),
      ).toBe("renewal-desk");
      expect(computeSpaceCardState(space, new Map(), ALL_PRESENT, true)).toBe(
        "renewal-desk",
      );
    }
  });

  it("AC-S286-4 still shows a missing connection first", () => {
    const leaseRenewals = RENEWAL_SPACES.find((space) => space.id === "lease-renewals")!;
    expect(
      computeSpaceCardState(
        leaseRenewals,
        definitionsWith(leaseRenewals, { status: "Active", active_version_id: "v-1" }),
        NONE_PRESENT,
      ),
    ).toBe("connections-needed");
  });

  it("AC-S286-4 keeps every other Space's state", () => {
    expect(computeSpaceCardState(moveIn, new Map(), ALL_PRESENT)).toBe("needs-a-process");
    expect(
      computeSpaceCardState(
        moveIn,
        new Map([["move-in", { status: "Draft" }]]),
        ALL_PRESENT,
      ),
    ).toBe("draft-process");
    expect(
      computeSpaceCardState(
        moveIn,
        new Map([["move-in", { status: "Active", active_version_id: "v-1" }]]),
        ALL_PRESENT,
      ),
    ).toBe("published-process");
    expect(computeSpaceCardState(moveIn, new Set(["move-in"]), ALL_PRESENT)).toBe(
      "has-a-process",
    );
    expect(computeSpaceCardState(moveIn, new Map(), ALL_PRESENT, true)).toBe(
      "status-unavailable",
    );
    expect(computeSpaceCardState(moveIn, new Map(), NONE_PRESENT)).toBe(
      "connections-needed",
    );
  });
});

function card(name: RegExp) {
  return screen.getByRole("heading", { name }).closest("a") as HTMLElement;
}

describe("BEH-S286-4 the Internal Processes directory", () => {
  it("BEH-S286-4 shows Guidance or the desk state on the three renewal cards and never Needs a process", async () => {
    vi.mocked(readConnectorPresence).mockReturnValue(ALL_PRESENT);
    vi.mocked(listProcessDefinitions).mockResolvedValue([
      { id: "owner-renewal-outreach", status: "Active", active_version_id: "v-1" },
      { id: "tenant-renewal-notice", status: "Draft" },
      // Lease Renewal has no stored definition.
    ] as ProcessDefinitionRecord[]);

    render(await SpacesPage());

    const owner = card(/Owner Renewal Outreach/);
    const tenant = card(/Tenant Renewal Notice/);
    const lease = card(/^Lease Renewals$/);
    const pill = (element: HTMLElement) =>
      element.querySelector(".space-card-state-pill") as HTMLElement;
    expect(pill(owner)).toHaveTextContent(/^Guidance$/);
    expect(pill(tenant)).toHaveTextContent(/^Worked on the Renewal Desk$/);
    expect(pill(lease)).toHaveTextContent(/^Worked on the Renewal Desk$/);
    for (const element of [owner, tenant, lease]) {
      expect(pill(element)).toHaveAttribute("data-tone", "reference");
      expect(within(element).queryByText("Needs a process")).toBeNull();
      expect(within(element).queryByText(/checklist/i)).toBeNull();
    }
    expect(screen.queryByText("Lease work and review")).toBeNull();
    // Another Space with no stored process keeps its own state.
    expect(
      card(/^Move-In$/).querySelector(".space-card-state-pill") as HTMLElement,
    ).toHaveTextContent(/^Needs a process$/);
    // R-S286-6: read, not run; the desk card still works leases.
    expect(within(owner).getByText("Read how owner outreach is done")).toBeVisible();
    expect(
      within(tenant).getByText("Read how the tenant offer and documents are done"),
    ).toBeVisible();
    expect(within(lease).getByText("Work leases on the Renewals desk")).toBeVisible();
    expect(lease).toHaveAttribute("href", "/lease-renewal");
    expect(owner).toHaveAttribute("href", "/spaces/owner-renewal-outreach?tab=process");
  });

  it("AC-S286-4 reads the desk state on every renewal card when the definitions cannot be read", async () => {
    vi.mocked(readConnectorPresence).mockReturnValue(ALL_PRESENT);
    vi.mocked(listProcessDefinitions).mockRejectedValue(new Error("unavailable"));

    render(await SpacesPage());

    for (const name of [
      /Owner Renewal Outreach/,
      /Tenant Renewal Notice/,
      /^Lease Renewals$/,
    ])
      expect(
        card(name).querySelector(".space-card-state-pill") as HTMLElement,
      ).toHaveTextContent(/^Worked on the Renewal Desk$/);
  });

  it("AC-S286-4 keeps the connection state first on the Lease Renewals card", async () => {
    vi.mocked(readConnectorPresence).mockReturnValue(NONE_PRESENT);
    vi.mocked(listProcessDefinitions).mockResolvedValue([]);

    render(await SpacesPage());

    const lease = card(/^Lease Renewals$/);
    const pill = lease.querySelector(".space-card-state-pill") as HTMLElement;
    expect(pill).toHaveTextContent(/^Connections needed$/);
    expect(pill).toHaveAttribute("data-tone", "attention");
    expect(
      screen.queryByText("Needs a process", { selector: ".space-card-state-pill" }),
    ).not.toBeInTheDocument();
  });
});
