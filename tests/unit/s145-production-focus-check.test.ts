import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  classifyRequest,
  maskedRequest,
  parseFocusCheckArgs,
  workspacePaths,
} from "@/scripts/check-production-focus";
import { describeSignatureDifference } from "@/scripts/lib/renewal-focus-signature.mjs";

// S145 (FV-03, FV-89, FV-90): the production read-only Focus check refuses anything but an exact,
// explicit live target and a managed profile outside the repository, counts every lease-renewal
// request and write the switch could cause, and reports structure only.

const ORIGIN = "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app";
const profile = mkdtempSync(join(tmpdir(), "s145-focus-profile-"));
const live = [
  "--live",
  `--base-url=${ORIGIN}`,
  `--expected-commit=${"a".repeat(40)}`,
  "--expected-revision=pmi-kc-app-rmexample-abc123",
  "--service=pmi-kc-app",
  `--profile=${profile}`,
];

afterAll(() => rmSync(profile, { recursive: true, force: true }));

describe("S145 production Focus check arguments", () => {
  it("accepts only an explicit live, exact Cloud Run target and a profile outside the repository", () => {
    expect(parseFocusCheckArgs(live)).toMatchObject({
      origin: ORIGIN,
      expectedCommit: "a".repeat(40),
      expectedRevision: "pmi-kc-app-rmexample-abc123",
      leases: 3,
      report: null,
    });
    expect(() => parseFocusCheckArgs(live.filter((arg) => arg !== "--live"))).toThrow(
      "explicit_live_required",
    );
    expect(() =>
      parseFocusCheckArgs(
        live.map((arg) =>
          arg.startsWith("--base-url=") ? "--base-url=http://localhost:3000" : arg,
        ),
      ),
    ).toThrow("production_origin_invalid");
    expect(() =>
      parseFocusCheckArgs(
        live.map((arg) =>
          arg.startsWith("--profile=") ? `--profile=${process.cwd()}` : arg,
        ),
      ),
    ).toThrow("managed_profile_must_be_outside_repository");
  });

  it("requires at least three and at most ten lease workspaces", () => {
    expect(parseFocusCheckArgs([...live, "--leases=5"]).leases).toBe(5);
    expect(() => parseFocusCheckArgs([...live, "--leases=2"])).toThrow(
      "lease_count_invalid",
    );
    expect(() => parseFocusCheckArgs([...live, "--leases=11"])).toThrow(
      "lease_count_invalid",
    );
  });
});

describe("S145 production Focus check helpers", () => {
  it("keeps only same-origin lease workspace paths in desk order", () => {
    expect(
      workspacePaths(
        [
          "/lease-renewal/live/desk/lease/101?desk=v%3D2",
          null,
          "https://example.invalid/lease-renewal/live/desk/lease/102",
          "/lease-renewal",
          "/lease-renewal/live/desk/lease/101?desk=v%3D2",
          `${ORIGIN}/lease-renewal/live/desk/lease/103`,
        ],
        ORIGIN,
      ),
    ).toEqual([
      "/lease-renewal/live/desk/lease/101?desk=v%3D2",
      "/lease-renewal/live/desk/lease/103",
    ]);
  });

  it("counts lease-renewal requests and any write, and masks blocked requests", () => {
    expect(
      classifyRequest("GET", `${ORIGIN}/api/lease-renewal/workspace?leaseId=1`, ORIGIN),
    ).toEqual({ app: true, write: false });
    expect(classifyRequest("POST", `${ORIGIN}/api/work`, ORIGIN)).toEqual({
      app: false,
      write: true,
    });
    expect(classifyRequest("GET", `${ORIGIN}/api/notifications`, ORIGIN)).toEqual({
      app: false,
      write: false,
    });
    expect(
      maskedRequest("post", `${ORIGIN}/api/lease-renewal/lease/4821/x?leaseId=4821`),
    ).toBe("POST /api/lease-renewal/lease/#/x");
  });

  it("describes a signature difference without any page value", () => {
    const before = JSON.stringify({
      sectionIds: ["renewal-section-owner"],
      copy: ["renewal-section-owner:Private owner text"],
      controls: ["input::Source:typed value"],
      hidden: 0,
    });
    const after = JSON.stringify({
      sectionIds: ["renewal-section-owner"],
      copy: ["renewal-section-owner:Changed private text"],
      controls: ["input::Source:other value"],
      hidden: 3,
    });
    const described = describeSignatureDifference(before, after);
    expect(described).toBe(
      "copy 1->1 at [0] sections renewal-section-owner; controls 1->1 at [0]; hidden 0->3",
    );
    expect(described).not.toMatch(/private|typed|value/i);
  });
});
