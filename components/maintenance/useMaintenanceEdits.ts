"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { fetchWithDeadline as fetch, waitFailureMessage } from "@/lib/ui/fetch-lifetime";
import { CreatedTicketSchema } from "@/lib/maintenance/creation-intent";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
type Pending = {
  actor: string;
  ticketId: string;
  command: Record<string, unknown> & { operationId: string; expectedVersion: number };
};
export function useMaintenanceEdits(
  actor: string | undefined,
  tickets: MaintenanceTicketRecord[],
  onTicket: (ticket: MaintenanceTicketRecord) => void,
) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | null>(null),
    [status, setStatus] = useState(""),
    [conflictId, setConflictId] = useState<string | null>(null);
  const live = useRef(true),
    running = useRef(false),
    context = useRef({ actor, tickets, onTicket }),
    generation = useRef(0);
  useEffect(() => {
    context.current = { actor, tickets, onTicket };
  }, [actor, tickets, onTicket]);
  const invalidateReads = useCallback(() => {
    generation.current++;
  }, []);
  const storageKey = `pmi-kc:maintenance-edit:${actor ?? ""}`;
  const accept = useCallback((raw: unknown, ticketId: string) => {
    const parsed = CreatedTicketSchema.safeParse(raw);
    if (!parsed.success || parsed.data.id !== ticketId)
      throw Error(
        "The ticket response did not identify the original case. Keep its operation for reconciliation.",
      );
    context.current.onTicket(parsed.data as MaintenanceTicketRecord);
  }, []);
  const clear = useCallback(() => {
    setPending(null);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
    const url = new URL(location.href);
    url.searchParams.delete("maintenance_operation");
    history.replaceState(null, "", url);
  }, [storageKey]);
  const recover = useCallback(
    async (original: Pending) => {
      const g = ++generation.current,
        response = await fetch(
          `/api/maintenance/tickets/${encodeURIComponent(original.ticketId)}?${new URLSearchParams({ operation_id: original.command.operationId })}`,
          { cache: "no-store" },
        ),
        body = await response.json();
      if (
        !live.current ||
        context.current.actor !== original.actor ||
        g !== generation.current
      )
        return;
      if (!response.ok)
        throw Error(body.error ?? "The original operation could not be read.");
      if (body.operation_id !== original.command.operationId)
        throw Error(
          "The result identifies a different operation. Keep the original request for reconciliation.",
        );
      if (body.state === "cancelled") {
        clear();
        setStatus(
          "Original app edit stopped before commitment. Your entered words are kept for deliberate review as new work.",
        );
      } else if (body.state === "committed") {
        accept(body.ticket, original.ticketId);
        clear();
        setStatus(
          `Original app edit committed at ticket version ${body.committed_version}. The current ticket includes any subsequent work.`,
        );
      } else
        setStatus(
          body.detail ?? "The original app edit is unresolved. No new edit was sent.",
        );
    },
    [accept, clear],
  );
  useEffect(() => {
    let active = true;
    live.current = true;
    queueMicrotask(() => {
      if (!active) return;
      let original: Pending | null = null;
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const v = JSON.parse(raw);
          if (
            v.actor === actor &&
            typeof v.ticketId === "string" &&
            v.ticketId.length <= 160 &&
            typeof v.command?.operationId === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              v.command.operationId,
            ) &&
            Number.isSafeInteger(v.command.expectedVersion) &&
            v.command.expectedVersion >= 0
          )
            original = v;
        }
      } catch {}
      const url = new URL(location.href),
        id = url.searchParams.get("maintenance_operation"),
        ticketId = url.searchParams.get("ticket_id");
      if (id && ticketId && (!original || original.command.operationId !== id)) {
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            id,
          )
        )
          original = {
            actor: actor ?? "",
            ticketId,
            command: { operationId: id, expectedVersion: 0 },
          };
      }
      setReady(true);
      if (original) {
        setPending(original);
        setStatus("Checking the original app edit. No new operation is being sent.");
        void recover(original).catch((error) => {
          if (active)
            setStatus(
              waitFailureMessage(error, "The original app edit remains unresolved."),
            );
        });
      }
    });
    return () => {
      active = false;
      live.current = false;
      invalidateReads();
    };
  }, [actor, storageKey, recover, invalidateReads]);
  async function apply(
    ticketId: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    const selected = context.current.tickets.find((t) => t.id === ticketId);
    if (
      !ready ||
      !actor ||
      running.current ||
      pending ||
      conflictId !== null ||
      !selected
    )
      return false;
    running.current = true;
    setBusy(true);
    setConflictId(null);
    const original: Pending = {
      actor,
      ticketId,
      command: {
        ...body,
        operationId: crypto.randomUUID(),
        expectedVersion: selected.record_version ?? 0,
      },
    };
    setPending(original);
    const url = new URL(location.href);
    url.searchParams.set("maintenance_operation", original.command.operationId);
    url.searchParams.set("ticket_id", ticketId);
    history.replaceState(null, "", url);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(original));
    } catch {}
    setStatus("Saving this app edit and its activity…");
    try {
      const response = await fetch(
          `/api/maintenance/tickets/${encodeURIComponent(ticketId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(original.command),
          },
        ),
        result = await response.json();
      if (!live.current || context.current.actor !== actor) return false;
      if (response.ok) {
        if (result.operation_id !== original.command.operationId)
          throw Error("The save result did not identify this operation.");
        accept(result.ticket, ticketId);
        clear();
        setStatus(
          "App edit saved. Provider status, financial posting and payment remain separately evidenced.",
        );
        return true;
      }
      if (response.status >= 400 && response.status < 500) {
        clear();
        if (response.status === 409) setConflictId(ticketId);
        setStatus(
          `${result.error ?? "The edit was refused."} Your entered words are kept.`,
        );
      } else
        setStatus(
          `${result.error ?? "The save response is unresolved."} Check the original operation before applying another edit.`,
        );
      return false;
    } catch (error) {
      if (live.current)
        setStatus(
          waitFailureMessage(
            error,
            "The save response did not arrive. Check this original operation; do not repeat the edit.",
          ),
        );
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function check() {
    if (!pending || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await recover(pending);
    } catch (error) {
      setStatus(waitFailureMessage(error, "The original edit is still unresolved."));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (!conflictId || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const response = await fetch(
          `/api/maintenance/tickets/${encodeURIComponent(conflictId)}`,
          { cache: "no-store" },
        ),
        body = await response.json();
      if (!response.ok) throw Error(body.error ?? "Current ticket is unavailable.");
      accept(body.ticket, conflictId);
      setConflictId(null);
      setStatus(
        "Current ticket read. Review the changed facts and your retained words before applying deliberately new work.",
      );
    } catch (error) {
      setStatus(
        waitFailureMessage(error, "Current ticket is unavailable. Your words are kept."),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function readCurrent(ticketId: string) {
    const response = await fetch(
        `/api/maintenance/tickets/${encodeURIComponent(ticketId)}`,
        { cache: "no-store" },
      ),
      body = await response.json();
    if (!response.ok) throw Error(body.error ?? "The current case is unavailable.");
    if (live.current) accept(body.ticket, ticketId);
  }
  async function stopOriginal() {
    if (!pending || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const response = await fetch(
          `/api/maintenance/tickets/${encodeURIComponent(pending.ticketId)}/operations/cancel`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ operationId: pending.command.operationId }),
          },
        ),
        body = await response.json();
      if (!response.ok)
        throw Error(body.error ?? "The original app edit remains unresolved.");
      if (body.operation_id !== pending.command.operationId)
        throw Error("The result identifies a different operation.");
      if (body.state === "committed") {
        accept(body.ticket, pending.ticketId);
        clear();
        setStatus(
          "The original app edit committed before it could be stopped. Its actual result was recovered; no undo was attempted.",
        );
      } else if (body.state === "cancelled") {
        clear();
        setStatus(
          "Original app edit stopped before commitment. Your words are kept for review as new work.",
        );
      } else throw Error("The original app edit remains unresolved.");
    } catch (error) {
      setStatus(
        waitFailureMessage(
          error,
          "The original app edit remains unresolved; keep its identity.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return {
    apply,
    check,
    stopOriginal,
    refresh,
    readCurrent,
    ready,
    busy,
    pending,
    status,
    conflictId,
    blocked: !ready || busy || !!pending || conflictId !== null,
  };
}
