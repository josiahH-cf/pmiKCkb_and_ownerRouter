// Browser-safe identities. Artifact rendering and content hashing remain on the server.
/** A human-authored label action; it does not classify a message or imply a workflow decision. */
export const GMAIL_MANUAL_LABEL_RULE_REF = "manual-human-review:v1";
export const WORKFLOW_REPLY_POLICY_REF = "workflow-reply:v1.0" as const;

export const GOVERNED_ARTIFACT_REFS = [
  "owner-renewal:v1.0",
  "tenant-renewal:v1.0",
  "maintenance-owner:v1.0",
  "owner-renewal:v2.0",
  "tenant-renewal:v2.0",
] as const;

export type GovernedArtifactRef = (typeof GOVERNED_ARTIFACT_REFS)[number];
