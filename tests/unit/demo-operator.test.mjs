import { describe, expect, it } from "vitest";
import {
  buildDemoOperatorPlan,
  generateDemoLinksHtml,
  parseDemoOperatorArgs,
} from "../../scripts/demo-operator.mjs";

describe("demo operator", () => {
  it("builds the test-run plan around the existing demo smoke commands", () => {
    const plan = buildDemoOperatorPlan({
      mode: "TestRun",
      noOpenBrowser: true,
      skipInstall: true,
    });

    expect(plan.config.mode).toBe("test-run");
    expect(plan.steps.map((step) => step.name)).toEqual([
      "Check local host tooling",
      "Reset demo data",
      "Start or reuse local dev server",
      "Wait for http://localhost:3000/sign-in",
      "Run local workflow smoke",
      "Dry-run launch skeleton seed",
      "Generate operator links page",
    ]);
    expect(plan.steps.some((step) => step.args?.includes("install"))).toBe(false);
    expect(
      plan.steps.find((step) => step.name === "Run local workflow smoke"),
    ).toMatchObject({
      args: [
        "run",
        "smoke:demo-live",
        "--",
        "--base-url=http://localhost:3000",
        "--timeout-ms=90000",
      ],
      type: "command",
    });
  });

  it("keeps install and browser opening opt-in/out explicit for test runs", () => {
    const plan = buildDemoOperatorPlan({
      mode: "test-run",
    });

    expect(plan.steps[0]).toMatchObject({
      args: ["install"],
      name: "Install dependencies",
    });
    expect(plan.steps.map((step) => step.name)).toContain("Open operator links page");
    expect(plan.steps.map((step) => step.name)).toContain("Open local demo sign-in");
  });

  it("builds the showtime plan with a final reset before the human walkthrough", () => {
    const plan = buildDemoOperatorPlan({
      mode: "Showtime",
      noOpenBrowser: true,
      timeoutMs: 120000,
      useExistingServer: true,
    });

    expect(plan.steps.map((step) => step.name)).toEqual([
      "Reset demo data before show",
      "Use existing local dev server",
      "Wait for http://localhost:3000/sign-in",
      "Run quick local workflow smoke",
      "Reset demo data after smoke",
      "Generate operator links page",
    ]);
    expect(
      plan.steps.find((step) => step.name === "Run quick local workflow smoke").args,
    ).toContain("--timeout-ms=120000");
  });

  it("keeps hosted readiness as an explicit opt-in", () => {
    const defaultPlan = buildDemoOperatorPlan({
      mode: "test-run",
      noOpenBrowser: true,
      skipInstall: true,
    });
    const hostedPlan = buildDemoOperatorPlan({
      includeHostedReadiness: true,
      mode: "test-run",
      noOpenBrowser: true,
      skipInstall: true,
    });

    expect(defaultPlan.steps.map((step) => step.name)).not.toContain(
      "Verify hosted Google sign-in",
    );
    expect(hostedPlan.steps.map((step) => step.name)).toContain(
      "Verify hosted Google sign-in",
    );
    expect(
      hostedPlan.steps.filter((step) => step.name.startsWith("Verify hosted live Ask")),
    ).toHaveLength(4);
  });

  it("builds offline-local rehearsals without Google host checks or Firestore resets", () => {
    const plan = buildDemoOperatorPlan({
      mode: "test-run",
      noOpenBrowser: true,
      offlineLocal: true,
      skipInstall: true,
    });

    expect(plan.config.offlineLocal).toBe(true);
    expect(plan.steps.map((step) => step.name)).toEqual([
      "Start or reuse local dev server",
      "Wait for http://localhost:3000/sign-in",
      "Run local workflow smoke",
      "Dry-run launch skeleton seed",
      "Generate operator links page",
    ]);
    expect(
      plan.steps.find((step) => step.name === "Run local workflow smoke").args,
    ).toContain("--allow-local-fallback");
    expect(
      plan.steps.find((step) => step.name === "Run local workflow smoke").args,
    ).toContain("--no-reset");
  });

  it("builds teardown as reset plus operator-owned server stop", () => {
    const plan = buildDemoOperatorPlan({
      mode: "Teardown",
    });

    expect(plan.steps.map((step) => step.name)).toEqual([
      "Reset demo data after show",
      "Stop operator-started dev server",
    ]);
  });

  it("parses PowerShell-friendly arguments", () => {
    expect(
      parseDemoOperatorArgs([
        "--mode=Showtime",
        "--skip-install",
        "--use-existing-server",
        "--include-hosted-readiness",
        "--offline-local",
        "--no-open-browser",
        "--dry-run",
        "--timeout-ms=120000",
      ]),
    ).toMatchObject({
      dryRun: true,
      includeHostedReadiness: true,
      mode: "showtime",
      noOpenBrowser: true,
      offlineLocal: true,
      skipInstall: true,
      timeoutMs: 120000,
      useExistingServer: true,
    });
  });

  it("generates the human walkthrough links", () => {
    const html = generateDemoLinksHtml("http://localhost:3000");

    expect(html).toContain("PMI KC KB Demo Operator Links");
    expect(html).toContain("http://localhost:3000/sign-in");
    expect(html).toContain("http://localhost:3000/ask");
    expect(html).toContain("http://localhost:3000/spaces/lease-renewals");
    expect(html).toContain("http://localhost:3000/spaces/maintenance-work-order-intake");
    expect(html).toContain("http://localhost:3000/spaces/move-out-deposit-disposition");
    expect(html).toContain("http://localhost:3000/spaces/owner-onboarding");
    expect(html).toContain("http://localhost:3000/approval-queue");
    expect(html).toContain("http://localhost:3000/admin");
  });
});
