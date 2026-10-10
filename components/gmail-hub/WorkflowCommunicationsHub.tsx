"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { CommunicationComposer } from "./CommunicationComposer";
import { WorkflowCommunicationPanel } from "./WorkflowCommunicationPanel";
import { describeSequenceState } from "@/lib/gmail-hub/communication-state";
import {
  WorkflowCommunicationContextSchema,
  type WorkflowCommunicationContext,
} from "@/lib/gmail-hub/workflow-context";
import { workflowComposerHref } from "@/lib/gmail-hub/composer-navigation";
import { LiveGmailWorkspace } from "./LiveGmailWorkspace";
import { workflowEntityHref } from "@/lib/gmail-hub/workflow-context";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
type Summary = Pick<
  CommunicationSequence,
  | "id"
  | "workflowLabel"
  | "context"
  | "state"
  | "version"
  | "responsibleUid"
  | "senderEmail"
  | "createdAtMs"
  | "updatedAtMs"
  | "nextDueAtMs"
  | "confirmedCount"
  | "lastSentAtMs"
  | "pause"
  | "observation"
  | "unresolvedOccurrenceId"
> & { scheduled: boolean };
type Entry = Parameters<typeof CommunicationComposer>[0]["entry"];
const TABS = ["Incoming", "Outgoing", "Drafts", "Scheduled"] as const;
export function WorkflowCommunicationsHub({
  authenticatedEmail,
}: {
  authenticatedEmail: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Incoming"),
    [entry, setEntry] = useState<Entry | null>(null);
  const [legacy, setLegacy] = useState<WorkflowCommunicationContext | null>(null);
  const [filters, setFilters] = useState({
    lane: "",
    purpose: "",
    sender: "",
    state: "",
  });
  const [items, setItems] = useState<Summary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState("");
  const load = useCallback(async (after: string | null = null) => {
    try {
      const r = await fetch(
        `/api/gmail-hub/sequences${after ? `?after=${encodeURIComponent(after)}` : ""}`,
      );
      const p = await r.json();
      if (!r.ok) throw new Error(p.error ?? "The shared worklist is unavailable.");
      setItems((old) =>
        after
          ? [...new Map([...old, ...p.sequences].map((s: Summary) => [s.id, s])).values()]
          : p.sequences,
      );
      setCursor(p.cursor);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The shared worklist is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);
  const changed = useCallback(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const syncRoute = () => {
      setLegacy(null);
      const q = new URLSearchParams(window.location.search),
        id = q.get("communication"),
        compose = q.get("compose");
      if (q.has("workflow")) {
        const entityType = q.get("workflow"),
          entityId = q.get("record"),
          purpose = q.get("purpose");
        const result = WorkflowCommunicationContextSchema.safeParse({
          lane: entityType === "maintenance_ticket" ? "maintenance" : "renewals",
          entityType,
          entityId,
          purpose,
          actionKey: "gmail.mailbox.read",
          sourceRefs: [],
        });
        if (result.success) {
          setEntry(null);
          setLegacy(result.data);
        } else setError("Choose a linked conversation from its authorized workflow.");
      } else if (
        id &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      )
        setEntry({ id });
      else if (
        compose === "reply" &&
        q.get("reply_from") &&
        q.get("reply_thread") &&
        q.get("reply_sender") &&
        q.get("reply_parent")
      )
        setEntry({
          reply_from: q.get("reply_from")!,
          reply_thread: q.get("reply_thread")!,
          reply_sender: q.get("reply_sender")!,
          reply_parent: q.get("reply_parent")!,
        });
      else if (
        (compose === "renewal_owner" || compose === "renewal_tenant") &&
        q.get("lease")
      )
        setEntry({ lease: q.get("lease")!, purpose: compose });
      else if (compose === "maintenance_owner" && q.get("ticket"))
        setEntry({ ticket: q.get("ticket")!, purpose: compose });
      else if (id || compose)
        setError("Choose a communication from its real lease or maintenance ticket.");
      else setEntry(null);
    };
    const timer = setTimeout(() => {
      syncRoute();
      void load();
    }, 0);
    window.addEventListener("popstate", syncRoute);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", syncRoute);
    };
  }, [load]);

  const visible = [...items]
    .filter((s) => {
      const matches =
        tab === "Incoming"
          ? !!s.pause && ["reply", "bounce"].includes(s.pause.cause)
          : tab === "Drafts"
            ? s.state === "draft" || (s.state === "paused" && s.pause?.cause === "edited")
            : tab === "Scheduled"
              ? !["completed", "cancelled"].includes(s.state) &&
                (!!s.nextDueAtMs || s.scheduled)
              : s.state !== "draft";
      return (
        matches &&
        (!filters.lane || s.context.lane === filters.lane) &&
        (!filters.purpose || s.context.purpose === filters.purpose) &&
        (!filters.sender || s.senderEmail === filters.sender) &&
        (!filters.state || s.state === filters.state) &&
        `${s.workflowLabel} ${s.context.entityId} ${s.context.purpose} ${s.senderEmail} ${s.state}`
          .toLowerCase()
          .includes(filter.toLowerCase())
      );
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  if (legacy)
    return (
      <section className="ui-stack" aria-label="Existing workflow conversation">
        <h2>Existing linked conversation</h2>
        <p>
          Original draft, contact and send evidence keeps its recorded meaning. Reading or
          linking a thread does not authorize a message.
        </p>
        <button
          onClick={() => {
            setLegacy(null);
            window.history.replaceState(null, "", "/gmail-hub");
          }}
        >
          Back to Communications
        </button>
        <a
          href={workflowEntityHref({
            entity_type: legacy.entityType,
            entity_id: legacy.entityId,
          })}
        >
          Open linked record
        </a>
        {legacy.entityType === "renewal_lease" ||
        legacy.entityType === "maintenance_ticket" ? (
          <a
            className="primary-button"
            href={
              legacy.entityType === "renewal_lease"
                ? workflowComposerHref({
                    leaseId: legacy.entityId,
                    purpose:
                      legacy.purpose === "renewal_owner"
                        ? "renewal_owner"
                        : "renewal_tenant",
                  })
                : workflowComposerHref({
                    ticketId: legacy.entityId,
                    purpose: "maintenance_owner",
                  })
            }
          >
            Compose in Communications
          </a>
        ) : null}
        <WorkflowCommunicationPanel
          lane={legacy.lane}
          entityType={legacy.entityType}
          entityId={legacy.entityId}
          purpose={legacy.purpose}
          canLink
          discoveryOnly
        />
      </section>
    );
  // Scheduled summaries intentionally use an explicit flag rather than exposing approved content.
  if (entry)
    return (
      <CommunicationComposer
        key={JSON.stringify(entry)}
        entry={entry}
        authenticatedEmail={authenticatedEmail}
        onChanged={changed}
        onClose={() => {
          setEntry(null);
          window.history.replaceState(null, "", "/gmail-hub");
          void load();
        }}
      />
    );
  return (
    <section className="ui-stack" aria-label="Shared workflow communications">
      <div className="ui-row" role="tablist" aria-label="Communications views">
        {TABS.map((name) => (
          <button
            type="button"
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p>
        Start a message from its lease or maintenance ticket. The team can continue the
        same linked work here.
      </p>
      <div className="ui-row">
        <label>
          Filter workflow, sender or status
          <input value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        {(
          [
            ["lane", "Workflow", [...new Set(items.map((s) => s.context.lane))]],
            ["purpose", "Audience", [...new Set(items.map((s) => s.context.purpose))]],
            [
              "sender",
              "Responsible sender",
              [...new Set(items.map((s) => s.senderEmail))],
            ],
            ["state", "Status", [...new Set(items.map((s) => s.state))]],
          ] as const
        ).map(([key, label, options]) => (
          <div key={key}>
            <label htmlFor={`communication-filter-${key}`}>{label}</label>
            <select
              id={`communication-filter-${key}`}
              value={filters[key]}
              onChange={(e) => setFilters((old) => ({ ...old, [key]: e.target.value }))}
            >
              <option value="">All</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          onClick={() => {
            setFilter("");
            setFilters({ lane: "", purpose: "", sender: "", state: "" });
          }}
        >
          Clear filters
        </button>
        <button
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          Refresh worklist
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">Loading worklist…</p> : null}
      <div role="tabpanel" aria-label={tab}>
        <div className="ui-stack">
          {visible.map((s) => (
            <article className="ui-card" key={s.id}>
              <h2>
                {s.workflowLabel} · {s.context.purpose.replaceAll("_", " ")} ·{" "}
                {s.context.entityType === "renewal_lease" ? "Lease" : "Ticket"}{" "}
                {s.context.entityId}
              </h2>
              <p>
                {describeSequenceState(s).label} · {describeSequenceState(s).confirmed} ·{" "}
                {s.senderEmail}
              </p>
              {s.nextDueAtMs ? (
                <p>Next: {new Date(s.nextDueAtMs).toLocaleString()}</p>
              ) : null}
              {s.pause ? <p>Pause: {s.pause.cause.replaceAll("_", " ")}</p> : null}
              {s.observation?.state === "unavailable" ? (
                <p>Incoming evidence needs verification</p>
              ) : null}
              <div className="ui-row">
                <button
                  onClick={() => {
                    setEntry({ id: s.id });
                    window.history.replaceState(
                      null,
                      "",
                      `/gmail-hub?communication=${s.id}`,
                    );
                  }}
                >
                  Open communication
                </button>
                <a
                  href={workflowEntityHref({
                    entity_type: s.context.entityType,
                    entity_id: s.context.entityId,
                  })}
                >
                  Open linked record
                </a>
              </div>
            </article>
          ))}
        </div>
        {!loading && !visible.length ? (
          <p>No matching {tab.toLowerCase()} communications in this page.</p>
        ) : null}
      </div>
      {cursor ? (
        <button
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void load(cursor);
          }}
        >
          Load more communications
        </button>
      ) : null}
      {tab === "Incoming" ? (
        <LiveGmailWorkspace authenticatedEmail={authenticatedEmail} />
      ) : null}
    </section>
  );
}
