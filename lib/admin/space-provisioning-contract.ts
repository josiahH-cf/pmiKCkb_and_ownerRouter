// Browser-safe value contract shared by the S36 review UI and the server-only pilot executor.
// Keep this module free of auth, Firestore, provider, and Node-only imports.
export const SPACE_PROVISION_CONFIRMATION =
  "I confirm this exact one-Space resource plan and one provider attempt.";
export const SPACE_RETIRE_CONFIRMATION =
  "I confirm retirement of only this exact pilot Space data store.";
