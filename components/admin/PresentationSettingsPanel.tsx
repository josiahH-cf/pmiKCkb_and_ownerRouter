"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import {
  PresentationCommandSchema,
  emptyBusinessProfile,
  profileSignature,
  profileFromRetainedSignature,
  applicationDisplayName,
  type BusinessProfile,
  type PresentationCommand,
  type StaffBusinessProfile,
  type ApplicationPresentation,
} from "@/lib/staff/business-profile";
type SettingsResult = StaffBusinessProfile | ApplicationPresentation;
async function request(url: string, body?: unknown, method = "POST") {
  const response = await fetch(
      url,
      body === undefined
        ? undefined
        : {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    ),
    payload = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(payload.error ?? "This setting is unavailable. Your fields are kept."),
      { status: response.status },
    );
  return payload;
}
export function PresentationSettingsPanel({
  kind,
  uid,
}: {
  kind: "profile" | "display";
  uid?: string;
}) {
  const endpoint =
      kind === "profile"
        ? "/api/staff/business-profile"
        : "/api/admin/application-presentation",
    key = `presentation-save:${kind}:${uid ?? "display"}`;
  const [profile, setProfile] = useState<BusinessProfile>(emptyBusinessProfile),
    [displayName, setDisplayName] = useState(""),
    [reason, setReason] = useState(""),
    [version, setVersion] = useState<number | null>(null),
    [note, setNote] = useState("Loading current fields…"),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [canResume, setCanResume] = useState(false);
  const [retained, setRetained] = useState<ReturnType<typeof profileSignature> | null>(
    null,
  );
  const intent = useRef<PresentationCommand | null>(null),
    generation = useRef(0),
    live = useRef(true);
  const applyResult = useCallback((result: SettingsResult | null) => {
    setVersion(result?.version ?? 0);
    if (result && "profile" in result) setProfile(result.profile);
    else if (result && "displayName" in result) setDisplayName(result.displayName);
  }, []);
  const remember = useCallback(
    (command: PresentationCommand | null, id?: string) => {
      intent.current = command;
      setCanResume(!!command);
      setPending(command?.operationId ?? id ?? null);
      try {
        if (command) sessionStorage.setItem(key, JSON.stringify(command));
        else sessionStorage.removeItem(key);
      } catch {
        /* URL keeps the original operation recoverable without guessing missing content. */
      }
      const url = new URL(location.href);
      if (command || id)
        url.searchParams.set(`save_${kind}`, command?.operationId ?? id!);
      else url.searchParams.delete(`save_${kind}`);
      history.replaceState(null, "", url);
    },
    [key, kind],
  );
  const recover = useCallback(
    async (id: string) => {
      const current = ++generation.current;
      setBusy(true);
      try {
        const original = await request(
          `${endpoint}?operation_id=${encodeURIComponent(id)}`,
        );
        if (!live.current || current !== generation.current) return;
        if (original.state === "committed") {
          if (
            (kind === "profile" && original.result.uid !== uid) ||
            (kind === "display" && original.op !== "save_display_name")
          )
            throw Error(
              "The original save belongs to another selected setting. Open its correct target before continuing.",
            );
          applyResult(original.result);
          remember(null);
          setReason("");
          setNote(
            "The original save is recorded. Current queued messages and operational identities keep their prior values.",
          );
        } else if (original.state === "cancelled") {
          remember(null);
          setNote(
            "The exact original save was stopped before admission. Reload current fields before another save.",
          );
          setVersion(null);
        } else
          setNote(
            intent.current
              ? "No original receipt is recorded. Check again, resume the exact save, or stop it before starting another."
              : "The original result is not recorded and local fields are unavailable. Check again or stop the exact original before starting another save.",
          );
      } catch (e) {
        if (live.current && current === generation.current)
          setNote(e instanceof Error ? e.message : "Check the original save again.");
      } finally {
        if (live.current && current === generation.current) setBusy(false);
      }
    },
    [applyResult, endpoint, kind, remember, uid],
  );
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true);
    try {
      const q = kind === "profile" ? `?uid=${encodeURIComponent(uid!)}` : "",
        data = await request(endpoint + q);
      if (!live.current || current !== generation.current) return;
      applyResult(data.profile ?? data.presentation ?? null);
      setNote("Current fields loaded. Save changes once when ready.");
      if (kind === "profile") {
        const own = await request(endpoint);
        if (live.current && current === generation.current && own.actorUid === uid)
          setRetained(own.retainedSignature);
      }
    } catch (e) {
      if (live.current && current === generation.current)
        setNote(e instanceof Error ? e.message : "Current fields are unavailable.");
    } finally {
      if (live.current && current === generation.current) setBusy(false);
    }
  }, [applyResult, endpoint, kind, uid]);
  useEffect(() => {
    live.current = true;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let old: PresentationCommand | null = null;
      try {
        const raw = sessionStorage.getItem(key);
        const parsed = raw ? PresentationCommandSchema.safeParse(JSON.parse(raw)) : null;
        if (parsed?.success) old = parsed.data;
      } catch {
        /* Keep the URL identity even if local recovery words are unavailable. */
      }
      const id =
        old?.operationId ?? new URL(location.href).searchParams.get(`save_${kind}`);
      if (
        old &&
        ((kind === "profile" && old.op === "save_profile" && old.uid === uid) ||
          (kind === "display" && old.op === "save_display_name"))
      ) {
        intent.current = old;
        setCanResume(true);
        if (old.op === "save_profile") setProfile(old.profile);
        else setDisplayName(old.displayName);
        setVersion(old.expectedVersion);
        setReason(old.reason);
      }
      if (id) {
        setPending(id);
        void recover(id);
      } else void reload();
    });
    return () => {
      active = false;
      live.current = false;
      generation.current++;
    };
  }, [key, kind, recover, reload, uid]);
  async function save(command?: PresentationCommand) {
    if (busy || (pending && !command)) return;
    let next: PresentationCommand;
    try {
      next = PresentationCommandSchema.parse(
        command ?? {
          op: kind === "profile" ? "save_profile" : "save_display_name",
          operationId: crypto.randomUUID(),
          expectedVersion: version,
          reason,
          ...(kind === "profile" ? { uid, profile } : { displayName }),
        },
      );
    } catch {
      setNote(
        "Complete the name, reviewed source/reason, and valid contact fields before saving.",
      );
      return;
    }
    remember(next);
    setBusy(true);
    try {
      const data = await request(endpoint, next);
      if (!live.current) return;
      applyResult(data.result);
      remember(null);
      setReason("");
      setNote(
        "Saved. Reload to read the current version. Future composition can deliberately use these fields.",
      );
    } catch (e) {
      if (live.current)
        setNote(
          e instanceof Error
            ? `${e.message} Check the original save before another operation.`
            : "The save result is unknown. Check the original save before another operation.",
        );
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function stop() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await request(
        endpoint,
        { op: "stop_before_admission", operationId: pending },
        "PATCH",
      );
      await recover(pending);
    } catch (e) {
      setNote(
        e instanceof Error
          ? e.message
          : "The original cutoff is unknown; keep its operation identity.",
      );
    } finally {
      if (live.current) setBusy(false);
    }
  }
  const disabled = busy || pending !== null || version === null;
  return (
    <section
      className="panel ui-stack"
      aria-label={
        kind === "profile" ? "Staff business profile" : "Application display name"
      }
    >
      <h2>
        {kind === "profile" ? "Business title and signature" : "Application display name"}
      </h2>
      <p role="status">{note}</p>
      {kind === "profile" ? (
        <>
          <p className="muted">
            Business titles describe work. Existing access roles and managed mailbox
            identities are separate.
          </p>
          {(
            ["name", "businessTitle", "phone", "hours", "website", "source"] as const
          ).map((field) => (
            <label className="field" key={field}>
              {
                {
                  name: "Business signature name",
                  businessTitle: "Business title",
                  phone: "Approved business phone (optional)",
                  hours: "Approved working hours (optional)",
                  website: "Approved website (optional)",
                  source: "Reviewed contact source",
                }[field]
              }
              <input
                aria-label={field}
                value={profile[field]}
                disabled={disabled}
                onChange={(e) => {
                  const value = e.target.value;
                  setProfile((current) => ({ ...current, [field]: value }));
                }}
              />
            </label>
          ))}
          {retained ? (
            <>
              <p>
                Prior retained signature: {retained.name}
                {retained.role ? ` · ${retained.role}` : ""}
                {retained.phone ? ` · ${retained.phone}` : ""}
              </p>
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() => setProfile(profileFromRetainedSignature(retained))}
              >
                Fill from my prior retained signature
              </Button>
            </>
          ) : null}
          <pre className="presentation-signature-preview" aria-label="Signature preview">
            {[
              profile.name,
              profile.businessTitle,
              profile.phone,
              profile.hours,
              profile.website,
            ]
              .filter(Boolean)
              .join("\n")}
          </pre>
        </>
      ) : (
        <>
          <p>Blank restores the existing default name.</p>
          <label className="field">
            Display name
            <input
              aria-label="Display name"
              maxLength={100}
              disabled={disabled}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <p className="presentation-name-preview" aria-label="Display name preview">
            {applicationDisplayName(displayName)}
          </p>
        </>
      )}
      <label className="field">
        Change reason
        <input
          aria-label="Change reason"
          value={reason}
          disabled={disabled}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="button-row">
        {pending ? (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void recover(pending)}
            >
              Check original save
            </Button>
            {canResume ? (
              <Button disabled={busy} onClick={() => void save(intent.current!)}>
                Resume exact original save
              </Button>
            ) : null}
            <Button variant="secondary" disabled={busy} onClick={() => void stop()}>
              Stop original before admission
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busy || version === null} onClick={() => void save()}>
              Save {kind === "profile" ? "business profile" : "display name"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void reload()}>
              Reload current fields
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
