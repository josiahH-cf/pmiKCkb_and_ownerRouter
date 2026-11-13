import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REHEARSAL_RENTVINE_LATENCY_MAX_MS,
  setOwnerEmail,
  setRentvineLatency,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  loadNovember5Mix,
  readNovember5Mix,
  rentvineStandInResponse,
} from "../../scripts/lib/one-path-rehearsal/november-5-mix.mjs";

// S284 W12-03 (test-only): the rehearsal transport serves another synthetic address for one
// lease's first owner only while its control flag names that lease, as RentVine would after the
// owner's contact changed, and answers one named read path slowly only while its latency flag is
// set. Without the flags every row is served exactly as before.

const mix = loadNovember5Mix(readNovember5Mix(), "2026-11-13");
const url = (path) => new URL("https://pmikcmetro.rentvine.com/api/manager/" + path);
const exported = (flags) =>
  rentvineStandInResponse(mix, url("leases/export"), flags).body;
const owners = (rows, leaseId) =>
  rows.find((row) => row.lease.leaseID === leaseId).portfolio.owners;

const temporary = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function rehearsalIn() {
  const dir = mkdtempSync(join(tmpdir(), "s284-w12-03-hooks-"));
  temporary.push(dir);
  return {
    groups: { working_month: [9101, 9102] },
    files: { rentvineControl: join(dir, "rentvine-control.json") },
  };
}

describe("S284 W12-03 owner address in the rehearsal transport", () => {
  it("serves every row unchanged without the flag", () => {
    expect(exported({})).toEqual(exported(undefined));
    expect(owners(exported({}), 9101)[0].email).toBe("jordan.sample@example.invalid");
  });

  it("changes only the named lease's first owner address", () => {
    const flags = { ownerEmails: { 9101: "jordan.sample.changed@example.invalid" } };
    const rows = exported(flags);
    expect(owners(rows, 9101)[0]).toMatchObject({
      name: "Jordan Sample",
      email: "jordan.sample.changed@example.invalid",
    });
    const before = exported({});
    for (const row of rows.filter((entry) => entry.lease.leaseID !== 9101))
      expect(row).toEqual(
        before.find((entry) => entry.lease.leaseID === row.lease.leaseID),
      );
    expect(rows.find((row) => row.lease.leaseID === 9101).lease).toEqual(
      before.find((row) => row.lease.leaseID === 9101).lease,
    );
  });

  it("the hook writes and clears the flag, refusing other leases and real addresses", () => {
    const rehearsal = rehearsalIn();
    setOwnerEmail(rehearsal, 9101, "jordan.sample.changed@example.invalid");
    expect(JSON.parse(readFileSync(rehearsal.files.rentvineControl, "utf8"))).toEqual({
      ownerEmails: { 9101: "jordan.sample.changed@example.invalid" },
    });
    setOwnerEmail(rehearsal, 9101, null);
    expect(JSON.parse(readFileSync(rehearsal.files.rentvineControl, "utf8"))).toEqual({
      ownerEmails: {},
    });
    expect(() => setOwnerEmail(rehearsal, 9999, "a@example.invalid")).toThrow(
      /existing fixture lease/,
    );
    expect(() => setOwnerEmail(rehearsal, 9101, "owner@pmikcmetro.com")).toThrow(
      /example\.invalid/,
    );
  });
});

describe("S284 W12-03 RentVine latency in the rehearsal transport", () => {
  it("the hook names one read path and a bounded delay, and clears it", () => {
    const rehearsal = rehearsalIn();
    setRentvineLatency(rehearsal, "leases/export", 1500);
    expect(JSON.parse(readFileSync(rehearsal.files.rentvineControl, "utf8"))).toEqual({
      rentvineLatency: { path: "leases/export", ms: 1500 },
    });
    setRentvineLatency(rehearsal, null);
    expect(JSON.parse(readFileSync(rehearsal.files.rentvineControl, "utf8"))).toEqual({});
    expect(() =>
      setRentvineLatency(
        rehearsal,
        "leases/export",
        REHEARSAL_RENTVINE_LATENCY_MAX_MS + 1,
      ),
    ).toThrow(/milliseconds/);
    expect(() => setRentvineLatency(rehearsal, "https://example.com/x", 100)).toThrow(
      /read path/,
    );
  });

  it("the provider boundary applies it to the named RentVine path only", () => {
    const preload = readFileSync(
      join(process.cwd(), "tests/browser/renewal-novdec-journey-network.mjs"),
      "utf8",
    );
    expect(preload).toContain("const latency = rentvineLatencyMs(path);");
    expect(preload).toContain("latency && latency.path === path");
    expect(preload).toContain("Math.min(5000,");
  });
});
