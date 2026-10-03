import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recoveryFixture } from "../helpers/release-recovery-fixture.mjs";
import { writeReceipt } from "../../scripts/production-assurance-receipts.mjs";
import { revisionCarriesSheetWriteback } from "../../lib/production-assurance/sheet-writeback-expectation.mjs";
import {
  executeSafeRecovery,
  prepareRecoveryBaseline,
  predecessorActualTemplate,
  readRecoveryBaseline,
  recoveryReference,
  verifyRecoveryAvailability,
} from "../../scripts/release-recovery.mjs";
const roots = [];
function fixture(options) {
  const root = mkdtempSync(join(tmpdir(), "release-recovery-"));
  roots.push(root);
  return recoveryFixture(root, options);
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const recover = (h, dependencies = {}) =>
  executeSafeRecovery(h.reference, {
    client: h.client,
    stateRoot: h.root,
    candidateRevision: h.candidate,
    verifyRecovered: h.verifyRecovered,
    assertLock: () => {},
    wait: async () => {},
    ...dependencies,
  });

// S159: the recovery target keeps the captured predecessor's actual configuration. The default
// fixture predecessor reads Sheet=false, the production truth at the S159 release.
describe("shared receipt-bound predecessor recovery", () => {
  describe.each(["prepare", "recover"])("%s release ownership", (mode) => {
    function setup() {
      const h = fixture(
        mode === "recover"
          ? { prepared: true, serving: "pmi-kc-app-candidate-isolated" }
          : {},
      );
      const run = (assertLock) =>
        mode === "prepare"
          ? prepareRecoveryBaseline(h.input, { ...h.deps, assertLock })
          : recover(h, { assertLock });
      const claimPath = join(
        h.root,
        `recovery-${h.input.runId}-${mode === "prepare" ? "preparation-dispatch" : "traffic-attempt"}.json`,
      );
      const resultPath = join(
        h.root,
        `recovery-${h.input.runId}-${mode === "prepare" ? "baseline" : "verified"}.json`,
      );
      return { h, run, claimPath, resultPath };
    }
    it("defaults to real kernel ownership before any provider read or mutation", async () => {
      const { h, run, claimPath } = setup();
      await expect(run(undefined)).rejects.toThrow("release_kernel_lock_required");
      expect(h.state.reads).toHaveLength(0);
      expect(h.state.patches).toHaveLength(0);
      expect(existsSync(claimPath)).toBe(false);
    });
    it("rechecks ownership after provider reads before claiming dispatch", async () => {
      const { h, run, claimPath } = setup();
      let calls = 0;
      await expect(
        run(() => {
          if (++calls === 2) throw new Error("release_lock_lost");
        }),
      ).rejects.toThrow("release_lock_lost");
      expect(h.state.reads.length).toBeGreaterThan(0);
      expect(h.state.patches).toHaveLength(0);
      expect(existsSync(claimPath)).toBe(false);
    });
    it("retains an immutable dispatch claim if ownership is lost at the final boundary", async () => {
      const { h, run, claimPath } = setup();
      let calls = 0;
      await expect(
        run(() => {
          if (++calls === 3) throw new Error("release_lock_lost");
        }),
      ).rejects.toThrow("release_lock_lost");
      const claimBytes = readFileSync(claimPath, "utf8");
      expect(h.state.patches).toHaveLength(0);
      await expect(run(() => {})).rejects.toThrow(
        mode === "prepare"
          ? "recovery_preparation_outcome_unresolved"
          : "recovery_dispatch_outcome_unresolved",
      );
      expect(readFileSync(claimPath, "utf8")).toBe(claimBytes);
      expect(h.state.patches).toHaveLength(0);
    });
    it("will not mint a completion receipt after ownership loss during assurance", async () => {
      const { h, run, resultPath } = setup();
      let calls = 0;
      await expect(
        run(() => {
          if (++calls === 4) throw new Error("release_lock_lost");
        }),
      ).rejects.toThrow("release_lock_lost");
      expect(h.state.patches).toHaveLength(1);
      expect(existsSync(resultPath)).toBe(false);
      await expect(run(() => {})).resolves.toBeTruthy();
      expect(h.state.patches).toHaveLength(1);
      expect(existsSync(resultPath)).toBe(true);
    });
  });
  it("prepares one zero-traffic clone from complete predecessor config while the current template differs", async () => {
    const h = fixture();
    const result = await prepareRecoveryBaseline(h.input, h.deps);
    expect(h.state.patches).toHaveLength(1);
    expect(
      h.state.patches[0].data.template.containers[0].env.find((e) => e.name === "OTHER")
        .value,
    ).toBe("original");
    expect(h.state.patches[0].data.template.containers[0].resources).toEqual(
      h.source.containers[0].resources,
    );
    expect(h.state.patches[0].data.template.serviceAccount).toBe(h.source.serviceAccount);
    expect(h.state.service.trafficStatuses.filter((r) => r.percent > 0)).toEqual([
      { revision: h.original, percent: 100 },
    ]);
    expect(result.receipt.targetFingerprint).toBe(
      h.fingerprint(h.state.revisions.get(h.target)),
    );
    expect(
      readFileSync(join(h.root, `recovery-${h.input.runId}-original.json`), "utf8"),
    ).not.toContain("PRIVATE_BINDING");
    await prepareRecoveryBaseline(h.input, h.deps);
    expect(h.state.patches).toHaveLength(1);
  });
  it("reconciles lost preparation replies against the same durable target without a second mutation", async () => {
    const h = fixture();
    h.state.fail = "after";
    await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow(
      "lost_after_dispatch",
    );
    h.state.fail = null;
    expect((await prepareRecoveryBaseline(h.input, h.deps)).receipt.targetRevision).toBe(
      h.target,
    );
    expect(h.state.patches).toHaveLength(1);
  });
  it("rebinds a distinct held zero-traffic candidate while cloning only canonical source and preserving other tags", async () => {
    const h = fixture();
    h.input.tagPreviousRevision = h.candidate;
    h.state.service.trafficStatuses[1].revision = h.candidate;
    h.state.service.trafficStatuses.push({
      revision: "pmi-kc-app-old-recovery",
      percent: 0,
      tag: "old-recovery",
      uri: "https://old-recovery---pmi-kc-app-isolated.a.run.app",
    });
    const result = await prepareRecoveryBaseline(h.input, h.deps);
    expect(result.receipt.tagPreviousRevision).toBe(h.candidate);
    expect(result.receipt.originalBaseline.expectedRevision).toBe(h.original);
    expect(result.receipt.imageDigests).toEqual(h.source.containers.map((c) => c.image));
    expect(h.state.patches[0].data.traffic).toContainEqual({
      type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
      revision: "pmi-kc-app-old-recovery",
      percent: 0,
      tag: "old-recovery",
    });
    const intent = JSON.parse(
      readFileSync(
        join(h.root, `recovery-${h.input.runId}-preparation-intent.json`),
        "utf8",
      ),
    );
    expect(intent).toMatchObject({
      schemaVersion: "pmi-kc-recovery-preparation-intent.v2",
      tagPreviousRevision: h.candidate,
    });
    expect(h.state.reads.some((url) => url.endsWith(`/revisions/${h.candidate}`))).toBe(
      false,
    );
  });
  it("retains the original distinct tag binding across a lost reply and refuses a changed checkpoint binding", async () => {
    const h = fixture();
    h.input.tagPreviousRevision = h.candidate;
    h.state.service.trafficStatuses[1].revision = h.candidate;
    h.state.fail = "after";
    await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow(
      "lost_after_dispatch",
    );
    const intentPath = join(h.root, `recovery-${h.input.runId}-preparation-intent.json`);
    const bytes = readFileSync(intentPath, "utf8");
    h.state.fail = null;
    await expect(
      prepareRecoveryBaseline({ ...h.input, tagPreviousRevision: h.target }, h.deps),
    ).rejects.toThrow("recovery_preparation_intent_mismatch");
    const result = await prepareRecoveryBaseline(h.input, h.deps);
    expect(result.receipt.tagPreviousRevision).toBe(h.candidate);
    expect(readFileSync(intentPath, "utf8")).toBe(bytes);
    expect(h.state.patches).toHaveLength(1);
  });
  it.each([
    "no_claim",
    "wrong_claim",
    "wrong_run",
    "legacy_intent",
    "changed_unrelated_tag",
  ])(
    "refuses %s after preparation without redispatch or a new baseline",
    async (kind) => {
      const h = fixture();
      h.state.fail = "after";
      await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow(
        "lost_after_dispatch",
      );
      h.state.fail = null;
      const claimPath = join(
        h.root,
        `recovery-${h.input.runId}-preparation-dispatch.json`,
      );
      const intentPath = join(
        h.root,
        `recovery-${h.input.runId}-preparation-intent.json`,
      );
      if (kind === "no_claim") unlinkSync(claimPath);
      if (kind === "wrong_claim" || kind === "wrong_run") {
        const claim = JSON.parse(readFileSync(claimPath, "utf8"));
        claim[kind === "wrong_claim" ? "intentHash" : "runId"] =
          kind === "wrong_claim"
            ? `sha256:${"0".repeat(64)}`
            : "00000000-0000-4000-8000-000000000001";
        writeFileSync(claimPath, JSON.stringify(claim));
      }
      if (kind === "legacy_intent") {
        const intent = JSON.parse(readFileSync(intentPath, "utf8"));
        intent.schemaVersion = "pmi-kc-recovery-preparation-intent.v1";
        writeFileSync(intentPath, JSON.stringify(intent));
      }
      if (kind === "changed_unrelated_tag")
        h.state.service.trafficStatuses.push({
          revision: h.original,
          percent: 0,
          tag: "unexpected",
        });
      await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow();
      expect(h.state.patches).toHaveLength(1);
      expect(existsSync(h.path)).toBe(false);
    },
  );
  it.each([
    "missing",
    "wrong_revision",
    "duplicate_tag",
    "duplicate_origin",
    "tag_with_positive_other_traffic",
    "unknown_target_without_claim",
  ])("refuses fresh %s before mutation", async (kind) => {
    const h = fixture();
    if (kind === "missing") h.state.service.trafficStatuses.pop();
    if (kind === "wrong_revision")
      h.state.service.trafficStatuses[1].revision = h.candidate;
    if (kind === "duplicate_tag")
      h.state.service.trafficStatuses.push({ ...h.state.service.trafficStatuses[1] });
    if (kind === "duplicate_origin")
      h.state.service.trafficStatuses.push({
        ...h.state.service.trafficStatuses[1],
        tag: "cand-other",
      });
    if (kind === "tag_with_positive_other_traffic")
      h.state.service.trafficStatuses[1].percent = 1;
    if (kind === "unknown_target_without_claim")
      h.state.revisions.set(h.target, h.recovered);
    await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow();
    expect(h.state.patches).toHaveLength(0);
    expect(existsSync(h.path)).toBe(false);
  });
  it("preserves canonical 100% traffic when the authorized tag originally carries that allocation", async () => {
    const h = fixture();
    h.state.service.trafficStatuses = [
      { ...h.state.service.trafficStatuses[1], percent: 100 },
    ];
    const result = await prepareRecoveryBaseline(h.input, h.deps);
    expect(result.receipt.tagPreviousRevision).toBe(h.original);
    expect(h.state.service.trafficStatuses).toHaveLength(2);
    expect(h.state.service.trafficStatuses).toEqual(
      expect.arrayContaining([
        { revision: h.target, percent: 0, tag: h.input.tag, uri: h.input.tagOrigin },
        { revision: h.original, percent: 100 },
      ]),
    );
  });
  it("accepts provider traffic ordering changes without dropping any binding", async () => {
    const h = fixture();
    const request = h.client.request;
    h.client.request = async (input) => {
      const result = await request(input);
      if (result.data?.trafficStatuses) result.data.trafficStatuses.reverse();
      return result;
    };
    await expect(prepareRecoveryBaseline(h.input, h.deps)).resolves.toBeTruthy();
    expect(h.state.patches).toHaveLength(1);
  });
  it.each(["extra", "missing", "duplicate", "changed"])(
    "refuses %s unrelated traffic after dispatch",
    async (kind) => {
      const h = fixture();
      h.state.service.trafficStatuses.push({
        revision: h.original,
        percent: 0,
        tag: "preserve",
        uri: "https://preserve---pmi-kc-app-isolated.a.run.app",
      });
      const request = h.client.request;
      h.client.request = async (input) => {
        const result = await request(input);
        if (input.method === "PATCH") {
          const rows = h.state.service.trafficStatuses;
          const i = rows.findIndex((r) => r.tag === "preserve");
          if (kind === "extra")
            rows.push({ revision: h.original, percent: 0, tag: "extra" });
          if (kind === "missing") rows.splice(i, 1);
          if (kind === "duplicate") rows.push({ ...rows[i] });
          if (kind === "changed") rows[i].revision = h.candidate;
        }
        return result;
      };
      await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow(
        "recovery_zero_traffic_binding_mismatch",
      );
      expect(h.state.patches).toHaveLength(1);
      expect(existsSync(h.path)).toBe(false);
    },
  );
  it("does not redispatch preparation when a durable claim has an unknown outcome and no revision", async () => {
    const h = fixture();
    h.state.fail = "before";
    await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow();
    h.state.fail = null;
    await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow(
      "recovery_preparation_outcome_unresolved",
    );
    expect(h.state.patches).toHaveLength(1);
  });
  it("refuses unknown configuration, mutable images and duplicate Sheet flags", () => {
    const h = fixture();
    expect(() =>
      predecessorActualTemplate(
        { ...h.source, futureSecurityControl: "x" },
        h.target,
        h.receipt.imageDigests,
      ),
    ).toThrow("recovery_unmapped_configuration_field");
    expect(() =>
      predecessorActualTemplate(h.source, h.target, ["registry.invalid/image:tag"]),
    ).toThrow("recovery_digest_required");
    const duplicate = structuredClone(h.source);
    duplicate.containers[0].env.push({
      name: "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED",
      value: "false",
    });
    expect(() =>
      predecessorActualTemplate(duplicate, h.target, h.receipt.imageDigests),
    ).toThrow("recovery_sheet_flag_ambiguous");
  });
  it.each(["true", "FALSE", undefined])(
    "refuses a target flag %s that differs from the predecessor's false before any recovery mutation",
    async (flag) => {
      const h = fixture({ prepared: true, serving: "pmi-kc-app-candidate-isolated" });
      h.state.revisions.get(h.target).containers[0].env =
        flag === undefined
          ? []
          : [{ name: "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", value: flag }];
      expect(
        revisionCarriesSheetWriteback(
          h.state.revisions.get(h.target),
          h.receipt.predecessorSheetWriteback,
        ),
      ).toBe(false);
      await expect(recover(h)).rejects.toThrow("recovery_target_unverified");
      expect(h.state.patches).toHaveLength(0);
    },
  );
  it("requires fresh original 100% traffic and exact Ready digest/config before promotion", async () => {
    const h = fixture({ prepared: true });
    await expect(
      verifyRecoveryAvailability(h.receipt, { client: h.client }),
    ).resolves.toBe(true);
    h.state.revisions.get(h.target).conditions = [];
    await expect(
      verifyRecoveryAvailability(h.receipt, { client: h.client }),
    ).rejects.toThrow("recovery_revision_not_ready");
    h.state.revisions.get(h.target).conditions = [
      { type: "Ready", state: "CONDITION_SUCCEEDED" },
    ];
    h.state.service.trafficStatuses[0].revision = h.candidate;
    await expect(
      verifyRecoveryAvailability(h.receipt, { client: h.client }),
    ).rejects.toThrow("recovery_serving_traffic_changed");
  });
  it("binds supplemental receipt contents and run against substitution", async () => {
    const h = fixture({ prepared: true });
    expect(() =>
      readRecoveryBaseline({
        ...h.reference,
        runId: "00000000-0000-4000-8000-000000000000",
      }),
    ).toThrow("recovery_receipt_mismatch");
    writeFileSync(
      h.path,
      JSON.stringify({ ...h.receipt, targetFingerprint: `sha256:${"e".repeat(64)}` }),
    );
    expect(() => readRecoveryBaseline(h.reference)).toThrow(
      "recovery_receipt_hash_mismatch",
    );
  });
  it("one globally shared recovery attempt serves both callers and repeats terminal readback without effects", async () => {
    const h = fixture({ prepared: true, serving: "pmi-kc-app-candidate-isolated" });
    const originalBytes = readFileSync(h.path, "utf8");
    expect((await recover(h)).state).toBe("ROLLED_BACK_VERIFIED");
    expect((await recover(h)).state).toBe("ROLLED_BACK_VERIFIED");
    expect(h.state.patches).toHaveLength(1);
    expect(readFileSync(h.path, "utf8")).toBe(originalBytes);
  });
  it("lost traffic response is reconciled without redispatch, including canonical assurance failure", async () => {
    const h = fixture({ prepared: true, serving: "pmi-kc-app-candidate-isolated" });
    h.state.fail = "after";
    await expect(recover(h)).rejects.toThrow("lost_after_dispatch");
    h.state.fail = null;
    h.state.monitoring = false;
    await expect(recover(h)).rejects.toThrow("recovery_assurance_failed");
    h.state.monitoring = true;
    await expect(recover(h)).resolves.toMatchObject({ state: "ROLLED_BACK_VERIFIED" });
    expect(h.state.patches).toHaveLength(1);
  });
  it("unchanged traffic is not proof of nondispatch; restart remains held on one claim", async () => {
    const h = fixture({ prepared: true, serving: "pmi-kc-app-candidate-isolated" });
    h.state.fail = "before";
    await expect(recover(h)).rejects.toThrow();
    h.state.fail = null;
    await expect(recover(h)).rejects.toThrow("recovery_dispatch_outcome_unresolved");
    expect(h.state.patches).toHaveLength(1);
  });
  it("rejects unrelated traffic, security drift and candidate identity substitution", async () => {
    const h = fixture({ prepared: true, serving: "pmi-kc-app-unrelated" });
    await expect(recover(h)).rejects.toThrow("recovery_unexpected_traffic");
    h.state.service.invokerIamDisabled = true;
    await expect(recover(h)).rejects.toThrow("recovery_service_controls_changed");
    expect(h.state.patches).toHaveLength(0);
  });
  it.each([
    "original",
    "preparation-intent",
    "preparation-dispatch",
    "preparation-operation",
    "baseline",
  ])(
    "retains preparation crash after durable %s without creating a second target",
    async (boundary) => {
      const h = fixture();
      const persist = (path, value) => {
        writeReceipt(path, value);
        if (path.endsWith(`-${boundary}.json`)) throw new Error("simulated_crash");
      };
      await expect(
        prepareRecoveryBaseline(h.input, { ...h.deps, persist }),
      ).rejects.toThrow("simulated_crash");
      if (boundary === "preparation-dispatch")
        await expect(prepareRecoveryBaseline(h.input, h.deps)).rejects.toThrow(
          "recovery_preparation_outcome_unresolved",
        );
      else
        await expect(prepareRecoveryBaseline(h.input, h.deps)).resolves.toMatchObject({
          receipt: { targetRevision: h.target },
        });
      expect(h.state.patches.length).toBeLessThanOrEqual(1);
    },
  );
  it.each(["traffic-attempt", "traffic-operation", "verified"])(
    "retains recovery crash after durable %s without another traffic dispatch",
    async (boundary) => {
      const h = fixture({ prepared: true, serving: "pmi-kc-app-candidate-isolated" });
      const persist = (path, value) => {
        writeReceipt(path, value);
        if (path.endsWith(`-${boundary}.json`)) throw new Error("simulated_crash");
      };
      await expect(
        executeSafeRecovery(h.reference, {
          client: h.client,
          stateRoot: h.root,
          candidateRevision: h.candidate,
          verifyRecovered: h.verifyRecovered,
          assertLock: () => {},
          persist,
        }),
      ).rejects.toThrow("simulated_crash");
      if (boundary === "traffic-attempt")
        await expect(recover(h)).rejects.toThrow("recovery_dispatch_outcome_unresolved");
      else
        await expect(recover(h)).resolves.toMatchObject({
          state: "ROLLED_BACK_VERIFIED",
        });
      expect(h.state.patches.length).toBeLessThanOrEqual(1);
    },
  );
  it("copied receipts and concurrent callers share one claim, while a changed claim is rejected", async () => {
    const h = fixture({ prepared: true, serving: "pmi-kc-app-candidate-isolated" });
    const copy = join(h.root, "copied-supplement.json");
    copyFileSync(h.path, copy);
    const copiedReference = recoveryReference(copy, h.receipt);
    const outcomes = await Promise.allSettled([
      recover(h),
      executeSafeRecovery(copiedReference, {
        client: h.client,
        stateRoot: h.root,
        candidateRevision: h.candidate,
        verifyRecovered: h.verifyRecovered,
        assertLock: () => {},
      }),
    ]);
    expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(h.state.patches).toHaveLength(1);
    writeFileSync(
      join(h.root, `recovery-${h.input.runId}-traffic-attempt.json`),
      JSON.stringify({
        binding: { runId: h.input.runId, candidateRevision: "pmi-kc-app-substitute" },
      }),
    );
    await expect(recover(h)).rejects.toThrow("recovery_global_claim_mismatch");
  });
  it("fresh last-safe-boundary failures consume neither candidate nor recovery authority", async () => {
    const h = fixture({ prepared: true });
    h.state.revisions.get(h.target).containers[0].image =
      `registry.invalid/substitute@sha256:${"f".repeat(64)}`;
    await expect(
      verifyRecoveryAvailability(h.receipt, { client: h.client }),
    ).rejects.toThrow("recovery_availability_unverified");
    await expect(
      verifyRecoveryAvailability(h.receipt, {
        client: h.client,
        now: () => Date.parse(h.receipt.issuedAt) + 7200001,
      }),
    ).rejects.toThrow("recovery_baseline_stale");
    expect(h.state.patches).toHaveLength(0);
  });
});
