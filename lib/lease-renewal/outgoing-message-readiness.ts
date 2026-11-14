import {
  markedValuesIn,
  ownerTermDateIssue,
  type RenewalMessageContent,
} from "./renewal-message-content";

export const SIGNATURE_SETUP_REQUIRED =
  "Save your sender signature choice before releasing this message. You can save it blank.";
const ADVISORIES = new Set([
  "names",
  "insuranceTransition",
  "responseRequest",
  "recommendationReason",
]);

export function outgoingPayloadReasons(subject: string, body: string): string[] {
  return markedValuesIn(`${subject}\n${body}`).map(
    (fact) => `Fill in ${fact} before releasing this message.`,
  );
}

/** Required facts come from the selected message, never from the full lease checklist. */
export function outgoingRenewalReasons(input: {
  content: Pick<RenewalMessageContent, "missing" | "subject" | "plainText">;
  composedContent?: Pick<RenewalMessageContent, "missing">;
  signatureConfigured: boolean;
  reply: boolean;
}): string[] {
  const reasons = input.signatureConfigured ? [] : [SIGNATURE_SETUP_REQUIRED];
  if (input.reply) return reasons;
  for (const item of input.content.missing)
    if (!ADVISORIES.has(item.field) && item.field !== "signature")
      reasons.push(item.message);
  // S285: editing the body can replace the marker. The owner term still needs saved dates.
  const termDateIssue =
    input.composedContent && ownerTermDateIssue(input.composedContent);
  if (termDateIssue) reasons.push(termDateIssue.message);
  // Unknown or authored placeholders must not escape even when the base text has no gap.
  if (reasons.length === 0)
    reasons.push(
      ...outgoingPayloadReasons(input.content.subject, input.content.plainText),
    );
  return [...new Set(reasons)];
}
