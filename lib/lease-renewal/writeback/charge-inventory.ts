import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import {
  leaseDateStateOf,
  RenewalWritebackServiceError,
  type RenewalWritebackProviderReads,
} from "./execution-service";
import { projectRecurringCharge } from "./proposal-contract";

import {
  chargeDateIso,
  type RenewalChargeInventory,
  type RenewalChargeOption,
} from "./charge-inventory-model";
export type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "./charge-inventory-model";

/** Exact lease and full detail inventory; account metadata never changes the S97 receipt projection. */
export async function loadRenewalChargeInventory(
  reads: RenewalWritebackProviderReads,
  leaseId: string,
  asOfDate = businessDateIso(Date.now()),
): Promise<RenewalChargeInventory> {
  const [lease, list] = await Promise.all([
    reads.getLease(leaseId),
    reads.listRecurringCharges(leaseId),
  ]);
  if (String(lease.leaseID ?? "") !== leaseId)
    throw new RenewalWritebackServiceError("provider_shape");
  const ids = list.map((entry) => entry.leaseRecurringChargeID);
  if (
    ids.some((id) => typeof id !== "string" || !/^[1-9]\d*$/.test(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new RenewalWritebackServiceError("provider_shape");
  const charges: RenewalChargeOption[] = [];
  for (const id of ids as string[]) {
    const detail = await reads.getRecurringCharge(leaseId, id);
    const projection = projectRecurringCharge(detail);
    if (projection.leaseID !== leaseId || projection.leaseRecurringChargeID !== id)
      throw new RenewalWritebackServiceError("provider_shape");
    const account =
      detail.account &&
      typeof detail.account === "object" &&
      !Array.isArray(detail.account)
        ? (detail.account as Record<string, unknown>)
        : null;
    const mapped =
      account && String(account.accountID ?? "") === projection.accountID
        ? account
        : null;
    const classification =
      mapped && [true, 1, "1"].includes(mapped.isRent as never)
        ? "rent"
        : mapped && [false, 0, "0"].includes(mapped.isRent as never)
          ? "non_rent"
          : "unknown";
    const start = chargeDateIso(projection.startDate),
      end = chargeDateIso(projection.endDate);
    const current =
      !start || (projection.endDate !== null && !end) || end === asOfDate
        ? null
        : start <= asOfDate && (end === null || end > asOfDate);
    const verifiedCurrent =
      current === null
        ? null
        : (projection.recurringStatusID === 1) === current
          ? current
          : null;
    charges.push({
      id,
      accountId: projection.accountID,
      accountLabel:
        typeof mapped?.name === "string" && mapped.name.trim() ? mapped.name : null,
      classification,
      current: verifiedCurrent,
      projection,
    });
  }
  return { leaseId, leaseDates: leaseDateStateOf(lease), asOfDate, charges };
}
