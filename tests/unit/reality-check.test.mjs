import { describe, expect, it } from "vitest";
import { REQUIRED_GCP_APIS } from "../../scripts/preflight-gcp-setup.mjs";
import { NOT_COVERED, summarizeReality } from "../../scripts/reality-check.mjs";

// A synthetic fetchLiveState() result where everything matches the recorded map.
function inSyncLive(projectId = "sample-kb-fixture-prod") {
  return {
    credentials_available: true,
    enabled_services: [...REQUIRED_GCP_APIS],
    firestore_database: { locationId: "us-central1", type: "FIRESTORE_NATIVE" },
    firebase_project: { projectId },
    errors: [],
  };
}

describe("summarizeReality", () => {
  const projectId = "sample-kb-fixture-prod";

  it("reports in-sync when project, APIs, and Firestore all match", () => {
    const report = summarizeReality({ projectId, live: inSyncLive(projectId) });

    expect(report.verdict).toBe("in-sync");
    expect(report.dimensions.every((entry) => entry.state === "in-sync")).toBe(true);
    expect(report.not_covered).toEqual(NOT_COVERED);
  });

  it("flags drift when a required API is missing", () => {
    const live = inSyncLive(projectId);
    live.enabled_services = REQUIRED_GCP_APIS.slice(1); // drop one required API

    const report = summarizeReality({ projectId, live });
    const apis = report.dimensions.find(
      (entry) => entry.name === "Required APIs enabled",
    );

    expect(report.verdict).toBe("drift");
    expect(apis.state).toBe("drift");
    expect(apis.missing).toContain(REQUIRED_GCP_APIS[0]);
  });

  it("flags drift when Firestore is not in Native mode", () => {
    const live = inSyncLive(projectId);
    live.firestore_database = { locationId: "us-central1", type: "DATASTORE_MODE" };

    const report = summarizeReality({ projectId, live });
    const firestore = report.dimensions.find(
      (entry) => entry.name === "Firestore database",
    );

    expect(firestore.state).toBe("drift");
    expect(report.verdict).toBe("drift");
  });

  it("flags drift when the live project id differs from the recorded one", () => {
    const live = inSyncLive("some-other-project");

    const report = summarizeReality({ projectId, live });
    const project = report.dimensions.find((entry) => entry.name === "Project identity");

    expect(project.state).toBe("drift");
    expect(report.verdict).toBe("drift");
  });

  it("reports unverified (not a failure) when there are no credentials", () => {
    const report = summarizeReality({
      projectId,
      live: { credentials_available: false, errors: ["ADC unavailable"] },
    });

    expect(report.verdict).toBe("unverified");
    expect(report.dimensions).toEqual([]);
    expect(report.reason).toContain("application-default login");
    expect(report.not_covered).toEqual(NOT_COVERED);
  });
});
