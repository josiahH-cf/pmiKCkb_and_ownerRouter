// Display stages for newly authored maintenance process guidance. Existing published definitions,
// ticket stages, provider receipts and stored run histories are not migrated by this vocabulary.
export const MAINTENANCE_STAGES = [
  "Capture and location",
  "Assessment and troubleshooting",
  "Estimate and owner authority",
  "Vendor coordination",
  "Work and contributions",
  "PMI review and closure",
  "History and reports",
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

// Vendor TRADES for the vendor-assignment SUGGESTION (M-5). We can deterministically suggest the trade
// a work order needs. Actual vendor selection uses the separately verified roster and current
// assignment contract; a trade suggestion never assigns. "General" is the fallback.
export const MAINTENANCE_TRADES = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliance",
  "General",
] as const;

export type MaintenanceTrade = (typeof MAINTENANCE_TRADES)[number];

// Keyword → trade taxonomy for the vendor-assignment suggestion. Starter set, kept conservative to
// avoid false specifics; the team validates it before any auto-routing (mirrors the emergency-keyword
// posture). The trade with the most keyword hits wins; ties resolve by MAINTENANCE_TRADES order.
export const MAINTENANCE_TRADE_KEYWORDS: Record<
  Exclude<MaintenanceTrade, "General">,
  readonly string[]
> = {
  Plumbing: [
    "leak",
    "leaking",
    "flood",
    "flooding",
    "water",
    "toilet",
    "faucet",
    "drain",
    "pipe",
    "sewage",
    "burst",
    "clog",
    "clogged",
    "sink",
    "shower",
    "plumb",
  ],
  Electrical: [
    "electrical",
    "spark",
    "sparking",
    "outlet",
    "breaker",
    "wiring",
    "power outage",
    "shock",
    "light fixture",
  ],
  HVAC: [
    "no heat",
    "furnace",
    "hvac",
    "thermostat",
    "air conditioning",
    "ac unit",
    "heater",
    "cooling",
    "heating",
  ],
  Appliance: [
    "appliance",
    "refrigerator",
    "fridge",
    "stove",
    "oven",
    "dishwasher",
    "washer",
    "dryer",
    "microwave",
    "garbage disposal",
    "disposal",
  ],
};

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
