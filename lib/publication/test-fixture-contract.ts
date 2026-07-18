export const TEST_PUBLICATION_SPACE_ID = "lease-renewals";
export const TEST_PUBLICATION_FIXTURE_KEY = "audit:trusted-publication:v1";

export const TEST_PUBLICATION_CONFIRMATIONS = Object.freeze({
  continuePinnedRun: "START VERSION-PINNED TEST RUN",
  publishRevision: "PUBLISH EXACT TEST PUBLICATION REVISION",
  restoreBaseline: "RESTORE TEST PUBLICATION BASELINE",
  rollbackBaseline: "ROLL BACK TEST PUBLICATION TO BASELINE",
});

export type TestPublicationFixtureOperation =
  | "continue_pinned_run"
  | "publish_revision"
  | "restore_baseline"
  | "rollback_baseline";
