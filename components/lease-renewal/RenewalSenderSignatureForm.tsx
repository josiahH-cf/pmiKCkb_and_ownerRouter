"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Field } from "@/components/ui";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import type { BusinessProfile } from "@/lib/staff/business-profile";
import type { MessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { SenderSignatureChoice } from "@/lib/lease-renewal/sender-signature-choice";

const endpoint = "/api/lease-renewal/sender-signature";
const fields = [
  ["name", "Sender name"],
  ["role", "Business title or organization"],
  ["phone", "Business phone"],
  ["hours", "Business hours"],
  ["website", "Business website"],
] as const;
const empty = { name: "", role: "", phone: "", hours: "", website: "" };
type Values = typeof empty;
type Read = {
  choice: SenderSignatureChoice | null;
  retained: MessagePreparationInputs["signature"];
  profile: BusinessProfile | null;
};

function fieldsFor(record: Read): Values {
  if (record.choice && !record.choice.signature) return empty;
  const value = record.choice?.signature ?? record.retained;
  if (value)
    return {
      name: value.name,
      role: value.role ?? "",
      phone: value.phone ?? "",
      hours: value.hours ?? "",
      website: value.website?.url ?? "",
    };
  const p = record.profile;
  return p
    ? {
        name: p.name,
        role: p.businessTitle,
        phone: p.phone,
        hours: p.hours,
        website: p.website,
      }
    : empty;
}

export function RenewalSenderSignatureForm({
  onSaved,
  onCancel,
}: Readonly<{
  onSaved?: (choice: SenderSignatureChoice) => void | Promise<void>;
  onCancel?: () => void;
}>) {
  const base = useId();
  const [choice, setChoice] = useState<Read | null>(null);
  const [values, setValues] = useState<Values>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<{ key: string; id: string } | null>(null);

  async function read(signal?: AbortSignal) {
    setError("");
    try {
      const response = await fetchWithDeadline(endpoint, { cache: "no-store", signal });
      if (!response.ok)
        throw new Error("Your saved signature could not be read. Try again.");
      const next = (await response.json()) as Read;
      if (signal?.aborted) return;
      setChoice(next);
      setValues(fieldsFor(next));
    } catch (failure) {
      if (!signal?.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Your saved signature could not be read.",
        );
    }
  }

  useEffect(() => {
    const abort = new AbortController();
    void read(abort.signal);
    return () => abort.abort();
  }, []);

  async function save(blank: boolean) {
    if (!choice || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const source = "Saved sender signature";
    const signature = blank
      ? null
      : {
          name: values.name.trim(),
          role: values.role.trim() || null,
          phone: values.phone.trim() || null,
          hours: values.hours.trim() || null,
          website: values.website.trim() ? { url: values.website.trim(), source } : null,
          source,
        };
    const expectedRevision = choice.choice?.revision ?? 0;
    const key = JSON.stringify([expectedRevision, signature]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    const operationId = pending.current.id;
    try {
      const response = await fetchWithDeadline(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision, operationId, signature }),
      });
      const result = (await response.json()) as {
        choice?: SenderSignatureChoice;
        error?: string;
      };
      if (!response.ok || result.choice?.operationId !== operationId)
        throw new Error(
          result.error ?? "The save could not be confirmed. Retry this exact signature.",
        );
      setChoice({ ...choice, choice: result.choice });
      if (blank) setValues(empty);
      pending.current = null;
      setNotice(blank ? "Blank signature saved." : "Signature saved.");
      await onSaved?.(result.choice);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The save could not be confirmed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="Your signature"
      className="ui-stack-tight renewal-now-signature-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save(!Object.values(values).some((value) => value.trim()));
      }}
    >
      {!choice ? (
        <p role="status">
          {error ? "Signature settings unavailable." : "Reading your signature…"}
        </p>
      ) : null}
      {choice?.choice ? (
        <p className="muted">
          Saved choice v{choice.choice.revision} ·{" "}
          {choice.choice.signature ? "Filled" : "Blank"}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {choice ? (
        <>
          <p className="muted">
            Each field is optional. A saved blank adds no signature to your message.
          </p>
          {fields.map(([field, label]) => (
            <Field htmlFor={`${base}-${field}`} label={label} key={field}>
              <input
                id={`${base}-${field}`}
                value={values[field]}
                disabled={busy}
                type={field === "website" ? "url" : "text"}
                maxLength={field === "website" ? 2048 : 240}
                onChange={(event) =>
                  setValues({ ...values, [field]: event.target.value })
                }
              />
            </Field>
          ))}
          <div className="ui-row">
            <Button type="submit" size="compact" busy={busy}>
              Save my signature
            </Button>
            <Button
              type="button"
              size="compact"
              variant="secondary"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Save blank signature
            </Button>
          </div>
        </>
      ) : error ? (
        <Button type="button" variant="secondary" onClick={() => void read()}>
          Try again
        </Button>
      ) : null}
      {onCancel ? (
        <Button
          type="button"
          size="compact"
          variant="tertiary"
          disabled={busy}
          onClick={onCancel}
        >
          Close signature setup
        </Button>
      ) : null}
    </form>
  );
}
