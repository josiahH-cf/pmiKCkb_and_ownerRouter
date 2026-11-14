// Scene actions must choose controls staff can actually see. Guided and Full views can
// retain matching hidden disclosures in the DOM while their visible state settles.
export async function openVisibleHelpSummary(page, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page
    .locator("summary:visible")
    .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) })
    .first()
    .click();
}
