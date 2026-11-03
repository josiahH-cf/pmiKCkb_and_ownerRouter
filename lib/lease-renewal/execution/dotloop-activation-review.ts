import { z } from "zod";

/** S34 passive activation review. No store, provider, gate or mutation dependency. */
const reference = z.string().trim().min(1).max(2_000);
const evidence = z.array(reference).min(1);
const baseline = z
  .object({
    actionKey: z.enum(["dotloop.loop.create_from_template", "dotloop.document.upload"]),
    productionAllowed: z.boolean(),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    registryHash: z.string().regex(/^[a-f0-9]{64}$/),
    connectionGeneration: reference,
    selectionVersion: z.number().int().positive(),
    profileId: reference,
    templateId: reference,
  })
  .strict();
export type DotloopActivationBaseline = z.infer<typeof baseline>;
const packageSchema = z
  .object({
    version: z.literal(1),
    actionKey: z.enum(["dotloop.loop.create_from_template", "dotloop.document.upload"]),
    scope: z.enum(["staff_confirmed_new_loop", "staff_confirmed_existing_loop_upload"]),
    observedAt: reference,
    current: baseline.extend({ productionAllowed: z.literal(false) }).strict(),
    proposed: z
      .object({
        productionAllowed: z.literal(true),
        readiness: z.literal("Approved for Execution"),
        evidenceStatus: z.literal("Documented"),
      })
      .strict(),
    prerequisites: z
      .object({
        actorRoles: z.array(z.enum(["Editor", "Approver", "Admin"])).min(1),
        configurationEvidence: evidence,
        qualificationEvidence: evidence,
        contentEvidence: evidence,
        targetEvidence: evidence,
      })
      .strict(),
    consequences: z
      .object({
        participantContacts: z.enum([
          "documented_contact_write",
          "not_applicable",
          "unknown",
        ]),
        notifications: z.enum(["verified", "unknown"]),
        notificationEvidence: reference,
        nativeTemplateDocuments: z.enum(["reviewed", "not_applicable", "unknown"]),
        nativeDocumentEvidence: reference,
        returnedContent: z.literal("presence_only"),
        correction: reference,
      })
      .strict(),
    procedure: z
      .object({
        backup: reference,
        compareAndSwap: reference,
        readback: reference,
        ambiguity: reference,
        stopConditions: evidence,
      })
      .strict(),
  })
  .strict();
export type DotloopActivationPackage = z.infer<typeof packageSchema>;

/**
 * Completeness is not truth verification or action authority. References must be reviewed by the
 * authorized decision maker; even a complete package executes nothing and never opens a key.
 */
export function reviewDotloopActivationPackage(
  input: unknown,
  current: DotloopActivationBaseline,
  nowIso: string,
): {
  state: "ready_for_review" | "not_ready";
  executionAuthorized: false;
  problems: string[];
} {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success)
    return {
      state: "not_ready",
      executionAuthorized: false,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  const value = parsed.data;
  const problems: string[] = [];
  const expectedScope =
    value.actionKey === "dotloop.document.upload"
      ? "staff_confirmed_existing_loop_upload"
      : "staff_confirmed_new_loop";
  if (value.scope !== expectedScope)
    problems.push("The scope does not match this exact action key.");
  if (value.current.actionKey !== value.actionKey)
    problems.push("The observed closed state belongs to a different action key.");
  const validatedCurrent = baseline.safeParse(current);
  if (!validatedCurrent.success)
    problems.push("The fresh current baseline is unavailable or invalid.");
  else
    for (const key of Object.keys(validatedCurrent.data) as Array<
      keyof DotloopActivationBaseline
    >) {
      if (value.current[key] !== validatedCurrent.data[key])
        problems.push(
          `The ${key} evidence is stale or changed; prepare a current package.`,
        );
    }
  const observedAt = Date.parse(value.observedAt),
    now = Date.parse(nowIso);
  if (
    !Number.isFinite(observedAt) ||
    !Number.isFinite(now) ||
    observedAt > now ||
    now - observedAt > 24 * 60 * 60 * 1_000
  )
    problems.push(
      "The observation time is invalid, future-dated or older than 24 hours; read current state again.",
    );
  if (value.consequences.notifications !== "verified")
    problems.push(
      "Provider notification consequences remain unverified for this exact operation.",
    );
  if (value.actionKey === "dotloop.loop.create_from_template") {
    if (value.consequences.participantContacts !== "documented_contact_write")
      problems.push(
        "New-loop participant/contact consequences must be explicitly documented.",
      );
    if (value.consequences.nativeTemplateDocuments !== "reviewed")
      problems.push(
        "The selected template's native document consequences must be reviewed separately from app PDFs.",
      );
  } else if (
    value.consequences.participantContacts !== "not_applicable" ||
    value.consequences.nativeTemplateDocuments !== "not_applicable"
  ) {
    problems.push(
      "Existing-loop upload cannot include participant/contact changes or template copying.",
    );
  }
  return {
    state: problems.length ? "not_ready" : "ready_for_review",
    executionAuthorized: false,
    problems,
  };
}
