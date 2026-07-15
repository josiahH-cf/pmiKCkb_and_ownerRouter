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
  listAssignedTickets(
    authority: VendorAssignmentAuthority,
  ): Promise<VendorTicketProjection[]>;
  getAssignedTicket(
    authority: VendorAssignmentAuthority & { ticketId: string },
  ): Promise<VendorTicketProjection | null>;
  isThreadLinked(
    input: VendorAssignmentAuthority & {
      vendorId: string;
      ticketId: string;
      threadId: string;
    },
  ): Promise<boolean>;
}

export interface VendorAssignmentAuthority {
  vendorId: string;
  uid: string;
  email: string;
  dataMode: DataMode;
}

function authorityFor(principal: VendorPrincipal): VendorAssignmentAuthority {
  return {
    vendorId: principal.vendorId,
    uid: principal.uid,
    email: principal.email,
    dataMode: vendorPrincipalDataMode(principal),
  };
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
  return repository.listAssignedTickets(authorityFor(principal));
}

export async function requireAssignedTicket(
  principal: VendorPrincipal,
  ticketId: string,
  repository: VendorAssignmentRepository,
) {
  await assertActiveVendor(principal, repository);
  const ticket = await repository.getAssignedTicket({
    ...authorityFor(principal),
    ticketId,
  });
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
      ...authorityFor(principal),
      ticketId: input.ticketId,
      threadId: input.threadId,
    }))
  ) {
    throw new VendorBoundaryError("Ticket communication not found.", 404);
  }
}
