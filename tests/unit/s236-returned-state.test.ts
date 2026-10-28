import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PacketPersonInput } from "@/lib/lease-documents/packet-inputs";
import {
  SIGNER_MAP_PENDING_LABEL,
  STAFF_ATTESTATION_LABEL,
  projectReturnedState,
  type ReturnedDocumentInput,
  type ReturnedStateRecord,
} from "@/lib/lease-documents/returned-state";

// S236 ARCH-S236-2/3: synthetic people, maps and staff records only. These prove the projection's
// rules; they are not provider or staff evidence for any real lease.

const CASE = {
  leaseId: "fixture-lease",
  cycleId: "cycle-1",
  snapshotId: "packet_fixture",
};
const person = (
  personId: string,
  fullName: string,
  signerRole: "tenant" | "owner",
  order: number,
): PacketPersonInput => ({
  personId,
  kind: "person",
  fullName,
  email: null,
  emailBasis: null,
  contactRef: null,
  roles: [
    { signerRole, order, dotloopRole: signerRole === "tenant" ? "TENANT" : "LANDLORD" },
  ],
});
const PEOPLE = [
  person("00000000-0000-4000-8000-000000000001", "Sam Example", "tenant", 1),
  person("00000000-0000-4000-8000-000000000002", "Riley Example", "tenant", 2),
  person("00000000-0000-4000-8000-000000000003", "Avery Owner", "owner", 1),
];
const SIGNERS = [
  {
    signerRole: "tenant" as const,
    participantKind: "tenant" as const,
    required: true,
    location: "Tenant signature",
  },
  {
    signerRole: "owner" as const,
    participantKind: "owner" as const,
    required: true,
    location: "Owner signature",
  },
];
const extension: ReturnedDocumentInput = {
  documentKey: "extension",
  label: "the renewal extension",
  contentHash: "a".repeat(64),
  prepared: true,
  uploaded: true,
  signers: SIGNERS,
};
const signed = (
  personId: string,
  signerRole: "tenant" | "owner",
  observedAt = "2026-11-02T16:00:00.000Z",
) => ({
  signerRole,
  personId,
  status: "signed" as const,
  observedAt,
  evidence: {
    kind: "dotloop_observed" as const,
    documentName: "Extension",
    viewedAt: observedAt,
  },
});
const record = (
  signers: ReturnedStateRecord["signers"],
  overrides: Partial<ReturnedStateRecord> = {},
): ReturnedStateRecord => ({
  ...CASE,
  documentContentHash: extension.contentHash,
  sentForSignature: { at: "2026-11-01T15:00:00.000Z", how: "Dotloop" },
  signers,
  recordedByUid: "fixture-staff",
  recordedAt: "2026-11-02T17:00:00.000Z",
  ...overrides,
});
const project = (
  records: ReturnedStateRecord[],
  documents: ReturnedDocumentInput[] = [extension],
  termsChangedAt: string | null = null,
) =>
  projectReturnedState({ ...CASE, documents, people: PEOPLE, records, termsChangedAt });

describe("S236 returned-state projection", () => {
  it("never reaches Fully executed without a reviewed signer map", () => {
    const result = project(
      [record([signed(PEOPLE[0].personId, "tenant")])],
      [{ ...extension, signers: null }],
    );
    expect(result.documents[0].state).toBe(SIGNER_MAP_PENDING_LABEL);
    expect(result.signaturesComplete).toBe(false);
  });

  it("names who still must sign, by name and capacity, with the next action", () => {
    const result = project([record([signed(PEOPLE[0].personId, "tenant")])]);
    const document = result.documents[0];
    expect(document.state).toBe("Partially signed");
    expect(document.attestation).toBe(STAFF_ATTESTATION_LABEL);
    expect(document.stillMustSign).toEqual([
      {
        name: "Riley Example",
        capacity: "tenant",
        nextAction: "Ask Riley Example to sign the renewal extension in Dotloop",
      },
      {
        name: "Avery Owner",
        capacity: "owner",
        nextAction: "Ask Avery Owner to sign the renewal extension in Dotloop",
      },
    ]);
    expect(result.signaturesComplete).toBe(false);
  });

  it("is Fully executed only when every required signer signed the current version", () => {
    const result = project([
      record(
        PEOPLE.map((p) =>
          signed(p.personId, p.roles[0].signerRole as "tenant" | "owner"),
        ),
      ),
    ]);
    expect(result.documents[0]).toMatchObject({
      state: "Fully executed",
      stillMustSign: [],
    });
    expect(result).toMatchObject({ overall: "Fully executed", signaturesComplete: true });
  });

  it("does not count an earlier version, another lease or a signature before the terms changed", () => {
    const all = PEOPLE.map((p) =>
      signed(p.personId, p.roles[0].signerRole as "tenant" | "owner"),
    );
    const earlier = project([record(all, { documentContentHash: "b".repeat(64) })]);
    // Sent status is per document version, so the current version was never sent either.
    expect(earlier.documents[0].state).toBe("Uploaded");
    expect(earlier.documents[0].notes).toContain(
      "Signed an earlier version, not current",
    );
    const otherLease = project([record(all, { leaseId: "another-lease" })]);
    expect(otherLease.documents[0].state).toBe("Uploaded");
    const changed = project([record(all)], [extension], "2026-11-03T00:00:00.000Z");
    expect(changed.documents[0].state).not.toBe("Fully executed");
    expect(changed.documents[0].notes).toContain("Signed before the terms changed");
  });

  it("keeps a declined signer on the still-must-sign list and reports the lowest document state", () => {
    const declined = {
      ...signed(PEOPLE[2].personId, "owner"),
      status: "declined_voided" as const,
    };
    const result = project(
      [
        record([
          signed(PEOPLE[0].personId, "tenant"),
          signed(PEOPLE[1].personId, "tenant"),
          declined,
        ]),
      ],
      [
        extension,
        { ...extension, documentKey: "addendum", label: "the addendum", prepared: false },
      ],
    );
    expect(result.documents[0].notes).toContain("Avery Owner declined or voided");
    expect(result.documents[0].stillMustSign.map((entry) => entry.name)).toEqual([
      "Avery Owner",
    ]);
    expect(result.overall).toBe("Not prepared");
  });
});

describe("S236 ARCH-S236-3 provider metadata never sets a signed state", () => {
  it("keeps Dotloop readback out of the returned-state projection in both directions", () => {
    const source = readFileSync(
      join(process.cwd(), "lib", "lease-documents", "returned-state.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from "@\/lib\/integrations\/dotloop/);
    expect(source).not.toMatch(/loop-association|dotloop-runtime/);
    const dotloopDir = join(process.cwd(), "lib", "integrations", "dotloop");
    for (const file of readdirSync(dotloopDir).filter((name) => name.endsWith(".ts")))
      expect(readFileSync(join(dotloopDir, file), "utf8"), file).not.toMatch(
        /returned-state/,
      );
  });
});
