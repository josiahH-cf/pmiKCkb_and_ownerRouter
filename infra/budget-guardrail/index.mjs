// Cloud Functions (2nd gen) entrypoint for the budget kill switch. The Cloud Billing budget
// publishes a notification to the trigger topic; this disables the project's billing once
// cumulative cost reaches the cap. Tests import handler.mjs / decide.mjs directly, not this file,
// so the functions-framework dependency lives only here (installed at deploy time).

import functions from "@google-cloud/functions-framework";

import { handleBudgetEvent } from "./handler.mjs";

functions.cloudEvent("budgetGuardrail", async (cloudEvent) => {
  await handleBudgetEvent(cloudEvent);
});
