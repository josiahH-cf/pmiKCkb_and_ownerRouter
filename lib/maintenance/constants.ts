// Maintenance Work Order Intake shared vocabulary (S4). Metadata only — no runtime trigger, queue, or
// external write. The RentVine work-order create stays gated (Action Registry production_allowed:false).

// The intake stage model: field capture -> match -> draft -> notice -> assignment -> (gated) write.
export const MAINTENANCE_STAGES = [
  "Capture",
  "Location match",
  "Work-order draft",
  "Owner notice",
  "Vendor assignment",
  "System-of-record update",
  "Closeout",
] as const;

export const MAINTENANCE_PRIORITIES = ["Emergency", "High", "Normal", "Low"] as const;

// Keywords that escalate a captured issue to Emergency priority when no explicit priority is given.
// Health/safety + property-damage signals; calibrated with the team before any auto-routing goes live.
export const MAINTENANCE_EMERGENCY_KEYWORDS = [
  "leak",
  "leaking",
  "flood",
  "flooding",
  "fire",
  "smoke",
  "gas",
  "carbon monoxide",
  "no heat",
  "no water",
  "sewage",
  "burst",
  "sparking",
  "electrical",
] as const;

// Planned reads (read-before-write) and outputs of the intake flow.
export const MAINTENANCE_PLANNED_READS = [
  "Reporter identity (PMI account)",
  "Location → RentVine unit match",
  "Property/owner context",
  "Existing open work orders for the unit",
] as const;

export const MAINTENANCE_PLANNED_OUTPUTS = [
  "Structured work-order draft",
  "Owner notice draft",
  "Vendor assignment preview",
  "Approval package",
] as const;
