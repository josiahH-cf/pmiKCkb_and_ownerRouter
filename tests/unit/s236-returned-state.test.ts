import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PacketPersonInput } from "@/lib/lease-documents/packet-inputs";
import type { LeaseArtifactKind } from "@/lib/lease-documents/packet-types";
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
  kind: "renewal_extension",
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
  kind: "renewal_extension",
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
        {
          ...extension,
          kind: "lead_disclosure",
          label: "the lead disclosure",
          prepared: false,
        },
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

describe("PR160 review: latest observation per signer and per-document version binding", () => {
  const T1 = "2026-11-02T15:00:00.000Z";
  const T2 = "2026-11-02T18:00:00.000Z";
  const tenantsSigned = [
    signed(PEOPLE[0].personId, "tenant"),
    signed(PEOPLE[1].personId, "tenant"),
  ];
  const ownerAt = (status: "signed" | "declined_voided", observedAt: string) => ({
    ...signed(PEOPLE[2].personId, "owner", observedAt),
    status,
  });
  const ext = extension;
  const addendum: ReturnedDocumentInput = {
    ...extension,
    kind: "lead_disclosure",
    label: "the lead disclosure",
    contentHash: "c".repeat(64),
  };
  const bound = (
    kind: LeaseArtifactKind,
    signers: ReturnedStateRecord["signers"],
    overrides: Partial<ReturnedStateRecord> = {},
  ): ReturnedStateRecord => ({ ...record(signers, overrides), kind });

  it("a later declined or voided observation is not signed, whatever the input order", () => {
    for (const owner of [
      [ownerAt("signed", T1), ownerAt("declined_voided", T2)],
      [ownerAt("declined_voided", T2), ownerAt("signed", T1)],
    ]) {
      const result = project(
        [bound("renewal_extension", [...tenantsSigned, ...owner])],
        [ext],
      );
      expect(result.documents[0].state).toBe("Partially signed");
      expect(result.signaturesComplete).toBe(false);
      expect(result.documents[0].stillMustSign.map((entry) => entry.name)).toEqual([
        "Avery Owner",
      ]);
    }
  });

  it("a later signed observation counts, whatever the input order (positive control)", () => {
    for (const owner of [
      [ownerAt("declined_voided", T1), ownerAt("signed", T2)],
      [ownerAt("signed", T2), ownerAt("declined_voided", T1)],
    ]) {
      const result = project(
        [bound("renewal_extension", [...tenantsSigned, ...owner])],
        [ext],
      );
      expect(result.documents[0].state).toBe("Fully executed");
      expect(result.signaturesComplete).toBe(true);
    }
  });

  it("the latest observation also wins across two records for the same version, in either order", () => {
    // The later-recorded record carries the earlier observation, so neither array position nor
    // recording time decides; the observed time does.
    const declinedRecord = bound(
      "renewal_extension",
      [...tenantsSigned, ownerAt("declined_voided", T2)],
      { recordedAt: "2026-11-02T19:00:00.000Z" },
    );
    const signedRecord = bound("renewal_extension", [ownerAt("signed", T1)], {
      recordedAt: "2026-11-02T20:00:00.000Z",
    });
    for (const records of [
      [declinedRecord, signedRecord],
      [signedRecord, declinedRecord],
    ]) {
      const result = project(records, [ext]);
      expect(result.signaturesComplete).toBe(false);
      expect(result.documents[0].stillMustSign.map((entry) => entry.name)).toEqual([
        "Avery Owner",
      ]);
    }
  });

  it("equal-time conflicting or invalid observations never establish a signature", () => {
    for (const owner of [
      [ownerAt("signed", T2), ownerAt("declined_voided", T2)],
      [ownerAt("declined_voided", T2), ownerAt("signed", T2)],
      [ownerAt("signed", "not-a-date")],
    ]) {
      const result = project(
        [bound("renewal_extension", [...tenantsSigned, ...owner])],
        [ext],
      );
      expect(result.documents[0].state).toBe("Partially signed");
      expect(result.signaturesComplete).toBe(false);
    }
  });

  it("keeps the terms-change safeguard on the latest signed observation", () => {
    const result = project(
      [bound("renewal_extension", [...tenantsSigned, ownerAt("signed", T2)])],
      [ext],
      "2026-11-03T00:00:00.000Z",
    );
    expect(result.signaturesComplete).toBe(false);
    expect(result.documents[0].notes).toContain("Signed before the terms changed");
  });

  it("binds the earlier-version note to the same document's actually signed superseded version", () => {
    const allSigned = [...tenantsSigned, ownerAt("signed", T2)];
    // A current-version record for the extension says nothing about the lead disclosure.
    const other = project([bound("renewal_extension", allSigned)], [ext, addendum]);
    expect(other.documents[0].state).toBe("Fully executed");
    expect(other.documents[1].notes).not.toContain(
      "Signed an earlier version, not current",
    );
    // A superseded version with no signed observation produces no warning.
    for (const signers of [[], [ownerAt("declined_voided", T2)]]) {
      const unsigned = project(
        [bound("lead_disclosure", signers, { documentContentHash: "d".repeat(64) })],
        [ext, addendum],
      );
      expect(unsigned.documents[1].notes).not.toContain(
        "Signed an earlier version, not current",
      );
    }
    // Only that document's signed superseded version warns, and it never counts.
    const superseded = project(
      [bound("lead_disclosure", allSigned, { documentContentHash: "d".repeat(64) })],
      [ext, addendum],
    );
    expect(superseded.documents[1].notes).toContain(
      "Signed an earlier version, not current",
    );
    expect(superseded.documents[1].state).not.toBe("Fully executed");
    expect(superseded.documents[0].notes).not.toContain(
      "Signed an earlier version, not current",
    );
    // Each superseded version is judged on its own: a later decline on another old version does
    // not hide a signed one, and neither counts toward the current version.
    const twoOld = project(
      [
        bound("lead_disclosure", [ownerAt("signed", T1)], {
          documentContentHash: "d".repeat(64),
        }),
        bound("lead_disclosure", [ownerAt("declined_voided", T2)], {
          documentContentHash: "e".repeat(64),
        }),
      ],
      [ext, addendum],
    );
    expect(twoOld.documents[1].notes).toContain("Signed an earlier version, not current");
    expect(twoOld.documents[1].state).toBe("Uploaded");
  });

  it("names the record that needs verification and fails closed on an unreadable terms-change time", () => {
    const conflict = project(
      [
        bound("renewal_extension", [
          ...tenantsSigned,
          ownerAt("signed", T2),
          ownerAt("declined_voided", T2),
        ]),
      ],
      [ext],
    );
    expect(conflict.documents[0].notes).toContain(
      "Needs verification: records for Avery Owner disagree at the same time",
    );
    const invalid = project(
      [bound("renewal_extension", [...tenantsSigned, ownerAt("signed", "not-a-date")])],
      [ext],
    );
    expect(invalid.documents[0].notes).toContain(
      "Needs verification: a record for Avery Owner has no valid date",
    );
    const all = [...tenantsSigned, ownerAt("signed", T2)];
    expect(project([bound("renewal_extension", all)], [ext]).signaturesComplete).toBe(
      true,
    );
    expect(
      project([bound("renewal_extension", all)], [ext], "not-a-date").signaturesComplete,
    ).toBe(false);
  });
});
