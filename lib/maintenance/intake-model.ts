// Client-safe model for the public tokenized maintenance intake (A5 / 2d). Types only, with NO
// firebase-admin / server imports, so the review UI can share the record shape with the server writer +
// review modules without pulling the Admin SDK into the client bundle. The server modules re-export these
// (mirrors lib/maintenance/ticket-model.ts).

export type UnverifiedIntakeStatus = "unverified" | "promoted" | "dismissed";

export interface UnverifiedIntakeRecord {
  id: string;
  data_mode: "live" | "test";
  status: UnverifiedIntakeStatus;
  source: "public-link";
  property_key: string;
  summary: string;
  description: string;
  contact: string;
  reporter_kind: "external";
  // S109 structured intake plus its deterministic triage. Written by the public writer from the
  // triage rules; the reporter never sets urgency, evidence, or the resource directly.
  issue_type?: string;
  location?: string;
  happening_now?: boolean;
  started_at?: string;
  damage_or_access?: string;
  attempted_steps?: string;
  urgency?: "emergency_fire" | "urgent_flooding" | "normal";
  required_evidence?: readonly "photos"[];
  photos_needed?: boolean;
  intake_complete?: boolean;
  resource_id?: string;
  ip_hash: string | null;
  created_at: string;
  expires_at: string;
  // Set by the review module when the intake leaves the queue (never by the public writer).
  reviewed_by?: string;
  reviewed_at?: string;
  ticket_id?: string;
  dismiss_reason?: string;
}
