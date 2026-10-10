"use client";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
interface TicketState {
  tickets: MaintenanceTicketRecord[];
  setTickets: Dispatch<SetStateAction<MaintenanceTicketRecord[]>>;
  createdId: string | null;
  recordCreated: (ticket: MaintenanceTicketRecord) => void;
}
const Tickets = createContext<TicketState | null>(null);
/** The production capture and queue share one current app-ticket projection. */
export function MaintenanceTicketProvider({
  initialTickets,
  children,
}: Readonly<{ initialTickets: MaintenanceTicketRecord[]; children: ReactNode }>) {
  const [tickets, setTickets] = useState(initialTickets),
    [createdId, setCreatedId] = useState<string | null>(null);
  function recordCreated(ticket: MaintenanceTicketRecord) {
    if (ticket.data_mode !== "live") return;
    setTickets((prior) => [ticket, ...prior.filter((t) => t.id !== ticket.id)]);
    setCreatedId(ticket.id);
  }
  return (
    <Tickets.Provider value={{ tickets, setTickets, createdId, recordCreated }}>
      {children}
    </Tickets.Provider>
  );
}
export const useMaintenanceTicketState = () => useContext(Tickets);
