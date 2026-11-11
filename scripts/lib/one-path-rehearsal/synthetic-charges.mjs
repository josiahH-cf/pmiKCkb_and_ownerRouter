// S271: invented RentVine recurring charges for the rehearsal's transport. control.mjs
// `setRecurringCharges` serves them for one fixture lease; the app reads them through its own
// charge inventory (lib/lease-renewal/writeback/charge-inventory.ts). Ids are 61xxx, accounts 41xx
// and every name says Synthetic. Nothing here is a real account, amount or rule.

/** One `{recurringCharge, account}` envelope as RentVine's list and detail reads return it. */
export function syntheticCharge({
  leaseId,
  chargeId,
  accountId,
  accountName,
  isRent,
  amount,
  description,
  startDate,
  endDate = null,
  status = 1,
}) {
  return {
    recurringCharge: {
      leaseRecurringChargeID: String(chargeId),
      leaseID: String(leaseId),
      accountID: String(accountId),
      amount: Number(amount).toFixed(2),
      description,
      dayDue: "1",
      frequency: "1",
      startDate,
      endDate,
      nextChargeDate: null,
      isMoveInCharge: "0",
      isFromImport: "0",
      rentIncreaseID: null,
      importSourceKey: null,
      recurringStatusID: status,
    },
    account: { accountID: String(accountId), name: accountName, isRent: isRent ? 1 : 0 },
  };
}

export const SYNTHETIC_ACCOUNTS = Object.freeze({
  rent: { accountId: "4100", accountName: "Synthetic Rent", isRent: true },
  pet: { accountId: "4101", accountName: "Synthetic Pet Rent", isRent: false },
  rbp: { accountId: "4103", accountName: "Synthetic Resident Benefits", isRent: false },
  insurance: {
    accountId: "4104",
    accountName: "Synthetic Renters Insurance",
    isRent: false,
  },
  misc: { accountId: "4199", accountName: "Synthetic Misc Fee", isRent: false },
});

const charge = (lease, chargeId, account, amount, description, extra = {}) =>
  syntheticCharge({
    leaseId: lease.leaseId,
    chargeId,
    ...SYNTHETIC_ACCOUNTS[account],
    amount,
    description,
    startDate: lease.startDate,
    ...extra,
  });

/**
 * N10-01 (S261): a ready base with a separate pet line (`ready`), and the walkthrough symptom, one
 * rent charge that bills base and pet together (`combined`), which contradicts the contract.
 * `lease` is `{ leaseId, startDate, rent }` as the served fixture row has them.
 */
export function baseRentCharges(lease, kind) {
  if (kind === "ready")
    return [
      charge(lease, "61001", "rent", lease.rent, "Synthetic base rent"),
      charge(lease, "61002", "pet", 40, "Synthetic pet rent"),
    ];
  if (kind === "combined")
    return [
      charge(lease, "61003", "rent", lease.rent + 40, "Synthetic rent and pet rent"),
    ];
  throw new Error(`Unknown base rent charge set ${kind}.`);
}

/**
 * N10-04 (S264): `complete` has the base, two distinct pet lines on one account, an ended pet
 * line, the package and the insurance line; `unmapped` adds a line no mapping names; `drift`
 * changes the package line's description at the same amount; `duplicate` lists one id twice.
 */
export function offerCharges(lease, kind) {
  const complete = [
    charge(lease, "61001", "rent", lease.rent, "Synthetic base rent"),
    charge(lease, "61011", "pet", 40, "Synthetic pet rent, first animal"),
    charge(lease, "61012", "pet", 25, "Synthetic pet rent, second animal", {
      startDate: lease.secondPetStart,
    }),
    charge(lease, "61013", "pet", 15, "Synthetic pet rent, ended", {
      endDate: lease.endedPetEnd,
      status: 3,
    }),
    charge(lease, "61021", "rbp", 30, "Synthetic resident benefits"),
    charge(lease, "61031", "insurance", 12.5, "Synthetic renters insurance"),
  ];
  const misc = charge(lease, "61041", "misc", 18, "Synthetic miscellaneous fee");
  if (kind === "complete") return complete;
  if (kind === "unmapped") return [...complete, misc];
  if (kind === "drift")
    return [...complete, misc].map((entry) =>
      entry.recurringCharge.leaseRecurringChargeID === "61021"
        ? {
            ...entry,
            recurringCharge: {
              ...entry.recurringCharge,
              description: "Synthetic resident benefits, revised description",
            },
          }
        : entry,
    );
  if (kind === "duplicate") return [...complete, misc, complete[2]];
  throw new Error(`Unknown offer charge set ${kind}.`);
}
