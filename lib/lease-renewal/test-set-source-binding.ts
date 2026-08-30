import { S63RunError } from "@/lib/lease-renewal/test-set-run-output";

/**
 * The secure designation names a row, but the row must prove its own RentVine lease identity. A
 * configured row number is not sufficient: absent links, unit links, or a different lease all fail
 * closed before any app-plane baseline write.
 */
export function assertTestSetSheetBindingIdentity(input: {
  leaseId: string;
  rowJoinId: string | null;
}): void {
  if (input.rowJoinId !== `lease:${input.leaseId}`) {
    throw new S63RunError("source_identity_mismatch");
  }
}
