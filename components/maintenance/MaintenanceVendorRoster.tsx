"use client";
import { UserActionError, actionFailureMessage } from "@/lib/ui/action-feedback";
import { useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import {
  VendorRosterInputSchema,
  type VendorRosterInput,
  type VendorRosterRecord,
} from "@/lib/maintenance/vendor-work-model";
type Vendor = {
  id: string;
  displayName: string | null;
  email: string;
  status: string;
  identityState: unknown;
};
const empty = () => ({
  vendorId: "",
  active: true,
  availability: "unknown" as VendorRosterInput["availability"],
  categories: [""],
  preference: "alternative" as VendorRosterInput["preference"],
  contactEmail: "",
  contactPhone: "",
  preferredChannel: "email" as VendorRosterInput["preferredChannel"],
  contactVerified: false,
  sourceRef: "",
  rentvineVendorId: "",
  rentvineEvidenceRef: "",
  reason: "",
});
export function MaintenanceVendorRoster({
  actorUid,
  canManage,
}: {
  actorUid: string;
  canManage: boolean;
}) {
  const [view, setView] = useState<{
      roster: VendorRosterRecord[];
      vendors: Vendor[];
    } | null>(null),
    [draft, setDraft] = useState(empty),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<VendorRosterInput | null>(null),
    [pendingId, setPendingId] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [ready, setReady] = useState(false);
  const running = useRef(false),
    generation = useRef(0),
    live = useRef(true),
    key = `pmi-kc:vendor-roster:${actorUid}`;
  async function load() {
    const g = ++generation.current;
    const response = await fetch("/api/maintenance/vendors", { cache: "no-store" }),
      body = await response.json();
    if (!response.ok)
      throw new UserActionError(
        body.error ?? "The verified vendor roster is unavailable.",
      );
    if (live.current && g === generation.current) {
      setView(body);
      setConflict(false);
    }
  }
  useEffect(() => {
    live.current = true;
    void load().catch((e) => {
      if (live.current)
        setStatus(
          actionFailureMessage(
            e,
            "The complete roster is unavailable; no empty roster was inferred.",
          ),
        );
    });
    queueMicrotask(() => {
      if (!live.current) return;
      const savedId = new URL(window.location.href).searchParams.get(
        "vendor_roster_operation",
      );
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const parsed = VendorRosterInputSchema.safeParse(JSON.parse(raw));
          if (parsed.success && (!savedId || savedId === parsed.data.operationId)) {
            setPending(parsed.data);
            setDraft({
              ...parsed.data,
              contactVerified: true,
              rentvineVendorId: parsed.data.rentvineVendorId ?? "",
              rentvineEvidenceRef: parsed.data.rentvineEvidenceRef ?? "",
            });
            setStatus(
              "Check the original roster save before creating another operation.",
            );
          }
        }
      } catch {}
      const url = new URL(window.location.href),
        id = url.searchParams.get("vendor_roster_operation");
      if (id) {
        const parsed = VendorRosterInputSchema.shape.operationId.safeParse(id);
        if (parsed.success) setPendingId(parsed.data);
        else {
          setPendingId(id);
          setStatus(
            "The saved roster operation identity is invalid. Keep this page for review; no replacement save was attempted.",
          );
        }
      }
      setReady(true);
    });
    return () => {
      live.current = false;
      generation.current++;
    };
  }, [key]);
  function clear() {
    setPending(null);
    setPendingId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("vendor_roster_operation");
    window.history.replaceState({}, "", url);
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
  function choose(id: string) {
    const record = view?.roster.find((r) => r.vendorId === id),
      vendor = view?.vendors.find((v) => v.id === id);
    setDraft(
      record
        ? {
            ...record,
            contactVerified: false,
            rentvineVendorId: record.rentvineVendorId ?? "",
            rentvineEvidenceRef: record.rentvineEvidenceRef ?? "",
            reason: "",
          }
        : { ...empty(), vendorId: id, contactEmail: vendor?.email ?? "" },
    );
  }
  async function save(original?: VendorRosterInput) {
    if (
      running.current ||
      !ready ||
      !canManage ||
      (!original && (pending || pendingId || conflict))
    )
      return;
    running.current = true;
    setBusy(true);
    let sent = false;
    try {
      const command =
        original ??
        VendorRosterInputSchema.parse({
          ...draft,
          operationId: crypto.randomUUID(),
          expectedVersion:
            view?.roster.find((r) => r.vendorId === draft.vendorId)?.version ?? 0,
          categories: draft.categories.map((s) => s.trim()).filter(Boolean),
          rentvineVendorId: draft.rentvineVendorId.trim() || null,
          rentvineEvidenceRef: draft.rentvineEvidenceRef.trim() || null,
        });
      setPending(command);
      setPendingId(command.operationId);
      const url = new URL(window.location.href);
      url.searchParams.set("vendor_roster_operation", command.operationId);
      window.history.replaceState({}, "", url);
      try {
        sessionStorage.setItem(key, JSON.stringify(command));
      } catch {}
      sent = true;
      setStatus("Saving the exact reviewed vendor preferences…");
      const response = await fetch("/api/maintenance/vendors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        }),
        body = await response.json();
      if (!response.ok) {
        if (!original && response.status >= 400 && response.status < 500) {
          clear();
          if (response.status === 409) setConflict(true);
        }
        throw new UserActionError(
          body.error ?? "The original roster save remains unresolved.",
        );
      }
      clear();
      setStatus(
        `Vendor preferences saved at version ${body.record.version}. Account setup, assignment and dispatch are separate.`,
      );
      await load().catch(() =>
        setStatus(
          "Vendor preferences saved; the complete roster could not refresh. Read current preferences before another edit.",
        ),
      );
    } catch (e) {
      if (!sent && !original) clear();
      setStatus(
        actionFailureMessage(
          e,
          "Check this exact original operation before another save.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function check() {
    const operationId = pending?.operationId ?? pendingId;
    if (!operationId || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const response = await fetch(
          `/api/maintenance/vendors?${new URLSearchParams({ operation_id: operationId })}`,
          { cache: "no-store" },
        ),
        body = await response.json();
      if (!response.ok)
        throw new UserActionError(body.error ?? "Original roster result unavailable.");
      if (body.operationId !== operationId)
        throw new UserActionError("The result identifies a different operation.");
      if (body.state === "committed") {
        clear();
        setStatus(
          `Original roster save committed at version ${body.committedVersion}. Read current preferences before another change.`,
        );
        await load();
      } else if (body.state === "stopped") {
        clear();
        setStatus(body.detail);
        await load();
      } else setStatus(body.detail);
    } catch (e) {
      setStatus(
        actionFailureMessage(
          e,
          "Keep the original operation; its absence does not prove failure.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function stop() {
    const operationId = pending?.operationId ?? pendingId;
    if (!operationId || running.current || !canManage) return;
    running.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/maintenance/vendors", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operationId }),
        }),
        body = await response.json();
      if (
        !response.ok ||
        body.operationId !== operationId ||
        !["committed", "stopped"].includes(body.state)
      )
        throw new UserActionError(
          body.error ?? "The original roster save remains unresolved.",
        );
      clear();
      setStatus(
        body.state === "committed"
          ? `The original roster save already committed at version ${body.committedVersion}; its actual result was recovered.`
          : body.detail,
      );
      await load();
    } catch (error) {
      setStatus(
        actionFailureMessage(
          error,
          "Keep the original operation identity; no replacement save was sent.",
        ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Verified vendor roster</h2>
      <p>
        Preferences identify suitable primary, backup and alternative vendors. Selection,
        portal assignment and message delivery each have their own explicit action.
      </p>
      <p role="status">{status}</p>
      {view ? (
        <>
          <ul className="ui-rows">
            {view.roster.map((r) => (
              <li key={r.vendorId}>
                <strong>
                  {view.vendors.find((v) => v.id === r.vendorId)?.displayName ??
                    r.contactEmail}
                </strong>{" "}
                · {r.preference} · {r.categories.join(", ")} · {r.availability} ·{" "}
                {r.active ? "Active preference" : "Inactive preference"} · version{" "}
                {r.version}
                <p>
                  {r.preferredChannel}: {r.contactEmail}
                  {r.contactPhone ? ` · ${r.contactPhone}` : ""}. Contact source:{" "}
                  {r.sourceRef}.
                </p>
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy || !!pending || !!pendingId}
                    onClick={() => choose(r.vendorId)}
                  >
                    Edit verified preferences
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {!view.roster.length ? (
            <p>
              No verified primary or backup preferences are recorded. Record actual
              identities and contact evidence.
            </p>
          ) : null}
        </>
      ) : (
        <p>Read the complete roster to choose a verified identity.</p>
      )}
      {canManage ? (
        <fieldset
          disabled={!ready || busy || !!pending || !!pendingId || conflict || !view}
        >
          <legend>Record approved shared preferences</legend>
          <label className="field">
            Actual vendor account
            <select value={draft.vendorId} onChange={(e) => choose(e.target.value)}>
              <option value="">Select an actual existing vendor</option>
              {view?.vendors
                .filter((v) => v.status !== "disabled")
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.displayName ?? v.email} · {v.status}
                  </option>
                ))}
            </select>
          </label>
          {(
            [
              ["contactEmail", "Verified account email"],
              ["contactPhone", "Verified phone (when applicable)"],
              ["sourceRef", "Contact and preference evidence reference"],
              ["rentvineVendorId", "Verified RentVine vendor ID (optional)"],
              ["rentvineEvidenceRef", "RentVine mapping evidence (if supplied)"],
              ["reason", "Change reason"],
            ] as const
          ).map(([field, label]) => (
            <label className="field" key={field}>
              {label}
              <input
                value={draft[field]}
                onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
              />
            </label>
          ))}
          <label className="field">
            Service categories (one per line)
            <textarea
              value={draft.categories.join("\n")}
              onChange={(e) =>
                setDraft((d) => ({ ...d, categories: e.target.value.split("\n") }))
              }
            />
          </label>
          <label className="field">
            Preference
            <select
              value={draft.preference}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  preference: e.target.value as typeof d.preference,
                }))
              }
            >
              <option value="primary">Primary</option>
              <option value="backup">Backup</option>
              <option value="alternative">Alternative</option>
            </select>
          </label>
          <label className="field">
            Availability
            <select
              value={draft.availability}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  availability: e.target.value as typeof d.availability,
                }))
              }
            >
              {["unknown", "available", "limited", "unavailable"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Preferred verified channel
            <select
              value={draft.preferredChannel}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  preferredChannel: e.target.value as typeof d.preferredChannel,
                }))
              }
            >
              {["email", "phone", "portal"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
            />
            Approved active roster preference
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.contactVerified}
              onChange={(e) =>
                setDraft((d) => ({ ...d, contactVerified: e.target.checked }))
              }
            />
            I verified this actual contact and preference against the stated source.
          </label>
          <button type="button" onClick={() => void save()}>
            Save vendor preferences
          </button>
        </fieldset>
      ) : null}
      {pending || pendingId ? (
        <div>
          <p>Original roster operation: {pending?.operationId ?? pendingId}</p>
          {!pending ? (
            <p>
              The original local fields are unavailable. Check or stop this exact app
              save; no replacement intent will be created while its outcome is unresolved.
            </p>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void check()}>
            Check original roster save
          </button>
          {pending ? (
            <button
              type="button"
              disabled={busy || !canManage}
              onClick={() => void save(pending)}
            >
              Retry exact original roster save
            </button>
          ) : null}
          <button type="button" disabled={busy || !canManage} onClick={() => void stop()}>
            Stop original roster save if it has not committed
          </button>
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void load()
            .then(() =>
              setStatus(
                "Current preferences read. Review your retained words against changed facts before saving.",
              ),
            )
            .catch((e) =>
              setStatus(actionFailureMessage(e, "The current roster is unavailable.")),
            )
        }
      >
        Read current vendor preferences
      </button>
    </section>
  );
}
