// S266 (AC-S266-3): synthetic program and vendor records for the future RentVine program-source
// readiness contract. Every name, id, contact and note is invented. No provider is read: these
// are the shapes a later, separately authorized read would have to supply.

import type {
  ProgramSourceCandidate,
  ProgramSourceCapability,
  ProgramSourceMapping,
  ProgramSourcePolicy,
} from "@/lib/lease-renewal/housing-assistance-source";
import type { HousingAssistanceValue } from "@/lib/lease-renewal/working-record";

export const NOW = "2026-11-10T18:00:00.000Z";

export const PROGRAM = "Example Housing Program";

/** The staff fact on a verified assisted lease, with staff-recorded contact and notes. */
export const ASSISTED: HousingAssistanceValue = {
  status: "yes",
  program: PROGRAM,
  contact: "SYNTHETIC staff contact, 555-0100",
  notes: "SYNTHETIC staff note about the renewal packet",
};

/** A read that does not exist today: approved only in this synthetic contract check. */
export const APPROVED_READ: ProgramSourceCapability = {
  read: "approved",
  suggestions: "authorized",
};

export const POLICY: ProgramSourcePolicy = {
  approvedFields: ["contact", "notes"],
  maxAgeDays: 30,
};

/** The data steward's exact mapping from the staff program to one provider record id. */
export const MAPPING: ProgramSourceMapping = {
  program: PROGRAM,
  providerId: "SYNTHETIC-V-1001",
  verifiedBy: "Program data steward",
  verifiedAt: "2026-11-01T15:00:00.000Z",
};

/** The verified provider record the mapping names. */
export const VERIFIED: ProgramSourceCandidate = {
  providerId: "SYNTHETIC-V-1001",
  kind: "vendor",
  name: PROGRAM,
  maintainedBy: "business",
  active: true,
  observedAt: "2026-11-09T15:00:00.000Z",
  fields: {
    contact: "SYNTHETIC provider contact, 555-0199",
    notes: ASSISTED.status === "yes" ? (ASSISTED.notes ?? "") : "",
  },
  provenance: {
    system: "rentvine",
    reference: "vendor:SYNTHETIC-V-1001",
    retrievedAt: "2026-11-09T15:00:00.000Z",
  },
};

/** A second vendor whose name differs from the program by one word. */
export const SIMILAR: ProgramSourceCandidate = {
  ...VERIFIED,
  providerId: "SYNTHETIC-V-1002",
  name: `${PROGRAM} West`,
  fields: { contact: "SYNTHETIC other contact, 555-0142" },
  provenance: {
    system: "rentvine",
    reference: "vendor:SYNTHETIC-V-1002",
    retrievedAt: "2026-11-09T15:00:00.000Z",
  },
};
