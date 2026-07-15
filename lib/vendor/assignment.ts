import type { DataMode } from "@/lib/data-mode";
import type { VendorPrincipal, VendorTicketProjection } from "@/lib/vendor/model";
import { VendorBoundaryError, vendorPrincipalDataMode } from "@/lib/vendor/model";

export interface VendorAssignmentRepository {
  isVendorActive(
    vendorId: string,
    uid: string,
    email: string,
    dataMode?: DataMode,
  ): Promise<boolean>;
  listAssignedTickets(vendorId: string): Promise<VendorTicketProjection[]>;
  getAssignedTicket(
    vendorId: string,
    ticketId: string,
  ): Promise<VendorTicketProjection | null>;
  isThreadLinked(input: {
    vendorId: string;
    ticketId: string;
    threadId: string;
  }): Promise<boolean>;
}

export async function assertActiveVendor(
  principal: VendorPrincipal,
  repository: Pick<VendorAssignmentRepository, "isVendorActive">,
) {
  if (
    !(await repository.isVendorActive(
      principal.vendorId,
      principal.uid,
      principal.email,
      vendorPrincipalDataMode(principal),
    ))
  ) {
    throw new VendorBoundaryError("Vendor account is unavailable.", 404);
  }
}

export async function listVendorTickets(
  principal: VendorPrincipal,
  repository: VendorAssignmentRepository,
) {
  await assertActiveVendor(principal, repository);
  return repository.listAssignedTickets(principal.vendorId);
}

export async function requireAssignedTicket(
  principal: VendorPrincipal,
  ticketId: string,
  repository: VendorAssignmentRepository,
) {
  await assertActiveVendor(principal, repository);
  const ticket = await repository.getAssignedTicket(principal.vendorId, ticketId);
  if (!ticket) {
    // Deliberately hide whether the guessed ticket exists.
    throw new VendorBoundaryError("Ticket not found.", 404);
  }
  return ticket;
}

export async function requireAssignedThread(
  principal: VendorPrincipal,
  input: { ticketId: string; threadId: string },
  repository: VendorAssignmentRepository,
) {
  await requireAssignedTicket(principal, input.ticketId, repository);
  if (
    !(await repository.isThreadLinked({
      vendorId: principal.vendorId,
      ticketId: input.ticketId,
      threadId: input.threadId,
    }))
  ) {
    throw new VendorBoundaryError("Ticket communication not found.", 404);
  }
}
