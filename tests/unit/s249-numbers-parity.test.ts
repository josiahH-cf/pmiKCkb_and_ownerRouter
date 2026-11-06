// S249 review fix E (ARCH-S249-1): one preparation projection gives the same numbers item on the
// desk and on the lease page from the same inputs. The desk reads no rent charges (that would be a
// per-lease RentVine read), so the shared item never reads them on either surface; the lease
// page's own charge read is an extra fact beside it. Synthetic values only.
import { describe, expect, it } from "vitest";

import {
  kickoffFactsFor,
  UNREAD_KICKOFF_SUPPORT,
} from "@/lib/lease-renewal/kickoff-facts";
import { projectRenewalPreparation } from "@/lib/lease-renewal/renewal-preparation";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

// ---- E: one numbers answer on the desk and the lease page ----------------------------------------

describe("S249 E (ARCH-S249-1): the desk and the lease page give the same numbers item", () => {
  const working = null as RenewalWorkingRecord | null;
  const base = {
    leaseId: "9101",
    cycleDateIso: "2026-12-31",
    contractualRent: 1350,
    leaseEndIso: "2026-12-31",
    workingCurrentRent: null,
    address: "101 Sample Pl",
    dataCheck: null,
    manual: null,
    working,
    sourceReadable: true,
    ownerRecipient: { state: "ready" as const },
    support: UNREAD_KICKOFF_SUPPORT,
  };

  it("a differing rent charge read on the lease page leaves the shared item as the desk shows it", () => {
    const desk = projectRenewalPreparation(kickoffFactsFor(base));
    const lease = projectRenewalPreparation(
      kickoffFactsFor({ ...base, rentCharges: [1400] }),
    );
    expect(lease.numbers).toEqual(desk.numbers);
    expect(lease.items).toEqual(desk.items);
    expect(lease.sendable).toBe(desk.sendable);
    expect(desk.numbers.line).toBe("Numbers agree");
    expect((desk.numbers as { chargesNote?: string }).chargesNote).toBe(
      "This check reads the lease rent and dates; the rent charges are read in Rent and charges on the lease.",
    );
    // The lease page's own read is an extra fact with its fix; the desk has none.
    expect((desk as { charges?: unknown }).charges).toBeNull();
    expect((lease as { charges?: unknown }).charges).toEqual({
      state: "difference",
      line: "The RentVine rent charge is $1,400 and the lease rent is $1,350",
      fix: { label: "Review rent and charges", target: "renewal-rent-and-charges" },
    });
  });

  it("the charge fact agrees for one matching charge and names two charges or none", () => {
    const charges = (rentCharges: number[] | null) =>
      (
        projectRenewalPreparation(kickoffFactsFor({ ...base, rentCharges })) as {
          charges?: { state: string; line: string } | null;
        }
      ).charges;
    expect(charges([1350])?.state).toBe("agree");
    expect(charges([1350, 100])?.line).toBe(
      "RentVine lists 2 current rent charges; one is expected",
    );
    expect(charges([])?.state).toBe("difference");
    expect(charges(null)).toBeNull();
  });
});
