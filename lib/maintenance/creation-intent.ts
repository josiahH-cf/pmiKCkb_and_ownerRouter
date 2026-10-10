// Client-safe capture command and result boundary; no provider or Firestore dependency.
import { z } from "zod";
export const CreateMaintenanceTicketInputSchema = z.object({
  data_mode: z.literal("live").default("live"),
  creation_id: z.string().uuid().optional(),
  summary: z.string().trim().min(1).max(400),
  description: z.string().trim().min(1).max(50000),
  priority: z.string().trim().min(1).max(80),
  priority_provenance: z.enum(["auto-inferred", "operator-set"]).default("operator-set"),
  unit: z
    .object({
      unitId: z.string().trim().min(1).max(160),
      label: z.string().trim().min(1).max(400),
      confidence: z.literal("Verified"),
    })
    .strict(),
  photo_refs: z.array(z.string().max(1000)).max(50).default([]),
  space_id: z.string().max(160).default("maintenance-work-order-intake"),
  source_trigger_key: z.string().max(300).optional(),
});
export const CreateLiveMaintenanceTicketInputSchema =
  CreateMaintenanceTicketInputSchema.omit({ source_trigger_key: true })
    .extend({
      creation_id: z.string().uuid(),
      space_id: z
        .literal("maintenance-work-order-intake")
        .default("maintenance-work-order-intake"),
    })
    .strict();
export type MaintenanceCreationCommand = z.infer<
  typeof CreateLiveMaintenanceTicketInputSchema
>;
export const maintenanceTicketHref = (id: string) =>
  `/maintenance?${new URLSearchParams({ ticket_id: id })}`;
export const CreatedTicketSchema = z
  .object({
    id: z.string().min(1).max(160),
    data_mode: z.literal("live"),
    status: z.enum([
      "Open",
      "Waiting on Response",
      "Waiting on Vendor",
      "Scheduled",
      "Closed",
    ]),
    summary: z.string(),
    description: z.string(),
    priority: z.string(),
    priority_provenance: z.string(),
    unit: z.object({ unitId: z.string(), label: z.string() }).nullable(),
    photo_refs: z.array(z.string()),
    reporter: z.object({
      kind: z.enum(["staff", "external"]),
      uid: z.string().optional(),
      name: z.string().optional(),
      contact: z.string().optional(),
    }),
    labels: z.array(z.string()),
    space_id: z.string(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .passthrough();
