import { z } from "zod";
import { MessagePreparationInputsSchema } from "./renewal-message-preparation";

export const SenderSignatureChoiceSchema = z
  .object({
    actorUid: z.string().min(1),
    email: z.string().email(),
    revision: z.number().int().positive(),
    operationId: z.string().uuid(),
    updatedAt: z.string().datetime(),
    signature: MessagePreparationInputsSchema.shape.signature,
  })
  .strict();
export type SenderSignatureChoice = z.infer<typeof SenderSignatureChoiceSchema>;
export const SaveSenderSignatureChoiceSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    signature: MessagePreparationInputsSchema.shape.signature,
  })
  .strict();

export type SenderSignatureEvidence = {
  uid: string;
  email: string;
  revision: number;
  contentHash: string;
  choice: "blank" | "filled";
};
