// @vitest-environment jsdom

// S249 ARCH-S249-4 / R-S249-4 / AC-S249-3: the automatic start's client fences. (1) it never fires
// when navigator.webdriver is true unless the server named the process the isolated rehearsal;
// (2) with the setting off nothing starts without a click, and "Prepare this batch" still runs;
// (3) nothing is sent until the page is visible and idle for a moment, and the automatic start is
// the only code path that calls the preparation without a click. The fetch seam is counted.
import "@testing-library/jest-dom/vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { StrictMode } from "react";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import {
  AUTOMATIC_START_IDLE_MS,
  KICKOFF_PREPARATION_ROUTE,
  RenewalKickoffPreparation,
  automaticStartAllowed,
  type KickoffPreparationProps,
} from "@/components/lease-renewal/RenewalKickoffPreparation";

const TARGETS = [
  { leaseId: "9101", address: "101 Sample Pl", cycleDateIso: "2026-12-31" },
  { leaseId: "9104", address: "104 Example Ln", cycleDateIso: "2026-12-31" },
];

let fetchMock: ReturnType<typeof vi.fn>;
let webdriver = false;

function props(
  overrides: Partial<KickoffPreparationProps> = {},
): KickoffPreparationProps {
  return {
    targets: TARGETS,
    canPrepare: true,
    automaticStart: { enabled: true, version: 0, canChange: false },
    rehearsal: false,
    ...overrides,
  };
}

const preparationCalls = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url) === KICKOFF_PREPARATION_ROUTE)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  webdriver = false;
  Object.defineProperty(window.navigator, "webdriver", {
    configurable: true,
    get: () => webdriver,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: "prepared",
      message: "The comparison is stored for this cycle.",
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

async function settle(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("S249 automatic start: fence (1) automation", () => {
  it("the pure fence refuses webdriver outside the rehearsal and allows it inside", () => {
    const base = { enabled: true, canPrepare: true, targets: 2, rehearsal: false };
    expect(automaticStartAllowed({ ...base, webdriver: false })).toBe(true);
    expect(automaticStartAllowed({ ...base, webdriver: true })).toBe(false);
    expect(automaticStartAllowed({ ...base, webdriver: true, rehearsal: true })).toBe(
      true,
    );
    expect(automaticStartAllowed({ ...base, webdriver: false, enabled: false })).toBe(
      false,
    );
    expect(automaticStartAllowed({ ...base, webdriver: false, canPrepare: false })).toBe(
      false,
    );
    expect(automaticStartAllowed({ ...base, webdriver: false, targets: 0 })).toBe(false);
  });

  it("a verification-style automated browser opens the batch and sends nothing", async () => {
    webdriver = true;
    render(<RenewalKickoffPreparation {...props()} />);
    await settle(AUTOMATIC_START_IDLE_MS * 10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("React's strict development mode (effects run twice on mount) still starts it, once", async () => {
    render(
      <StrictMode>
        <RenewalKickoffPreparation {...props()} />
      </StrictMode>,
    );
    await settle(AUTOMATIC_START_IDLE_MS + 50);
    await settle(50);
    await settle(AUTOMATIC_START_IDLE_MS * 4);
    expect(preparationCalls().map((call) => call.leaseId)).toEqual(["9101", "9104"]);
  });

  it("inside the isolated rehearsal an automated browser does start it", async () => {
    webdriver = true;
    render(<RenewalKickoffPreparation {...props({ rehearsal: true })} />);
    await settle(AUTOMATIC_START_IDLE_MS + 50);
    await settle(50);
    expect(preparationCalls().map((call) => call.trigger)).toEqual([
      "automatic",
      "automatic",
    ]);
  });
});

describe("S249 automatic start: fence (3) visible and idle, then one lease at a time", () => {
  it("sends nothing before the page has been idle for a moment", async () => {
    render(<RenewalKickoffPreparation {...props()} />);
    await settle(AUTOMATIC_START_IDLE_MS - 100);
    expect(fetchMock).not.toHaveBeenCalled();
    // Activity restarts the wait.
    fireEvent.keyDown(window);
    await settle(AUTOMATIC_START_IDLE_MS - 100);
    expect(fetchMock).not.toHaveBeenCalled();
    await settle(200);
    await settle(50);
    expect(preparationCalls()).toEqual([
      expect.objectContaining({ leaseId: "9101", trigger: "automatic" }),
      expect.objectContaining({ leaseId: "9104", trigger: "automatic" }),
    ]);
  });

  it("stops at the allowance and names the remaining leases", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "allowance_reached",
        message: "Comparison not run: monthly allowance reached",
      }),
    }));
    render(<RenewalKickoffPreparation {...props()} />);
    await settle(AUTOMATIC_START_IDLE_MS + 50);
    await settle(50);
    expect(preparationCalls()).toHaveLength(1);
    expect(
      screen.getAllByText(/Comparison not run: monthly allowance reached/).length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("S249 automatic start: fence (2) the reviewed setting", () => {
  it("with the setting off no call starts without a click, and Prepare this batch still runs", async () => {
    render(
      <RenewalKickoffPreparation
        {...props({ automaticStart: { enabled: false, version: 3, canChange: false } })}
      />,
    );
    await settle(AUTOMATIC_START_IDLE_MS * 10);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Prepare this batch" }));
    await settle(50);
    await settle(50);
    expect(preparationCalls().map((call) => call.trigger)).toEqual(["staff", "staff"]);
  });

  it("a staff member who may not prepare is offered no button and starts nothing", async () => {
    render(<RenewalKickoffPreparation {...props({ canPrepare: false })} />);
    await settle(AUTOMATIC_START_IDLE_MS * 10);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Prepare this batch" })).toBeNull();
  });
});

describe("S249 the automatic start is the only path that calls preparation without a click", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx|mjs)$/.test(name) ? [path] : [];
    });
  }
  it("no app, component or lib file except the batch view's preparation calls the route", () => {
    const callers = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((path) => readFileSync(path, "utf8").includes('kickoff-preparation"'))
      .map((path) => path.replaceAll("\\", "/"));
    expect(callers).toEqual(["components/lease-renewal/RenewalKickoffPreparation.tsx"]);
  });

  it("inside it, the automatic trigger is sent from exactly one place, after both fences", () => {
    const text = readFileSync(
      "components/lease-renewal/RenewalKickoffPreparation.tsx",
      "utf8",
    );
    const automaticCalls = text.match(/prepare\("automatic"/g) ?? [];
    expect(automaticCalls).toHaveLength(1);
    const at = text.indexOf('prepare("automatic"');
    const effect = text.lastIndexOf("useEffect(", at);
    const body = text.slice(effect, at);
    expect(body).toContain("automaticStartAllowed(");
    expect(body).toContain("navigator.webdriver");
    expect(body).toContain("waitUntilVisibleAndIdle(");
  });
});
