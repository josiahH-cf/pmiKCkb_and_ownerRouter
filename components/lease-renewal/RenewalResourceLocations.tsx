"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { useRenewalSaveFocus } from "./RenewalSaveFocus";

import { RenewalSectionHeading } from "@/components/lease-renewal/RenewalSectionHeading";
import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { useState } from "react";
import { Button, Field } from "@/components/ui";
import { can, type Role } from "@/lib/auth/roles";
import {
  RENEWAL_RESOURCE_FIELDS,
  RenewalResourceSettingsSchema,
  type RenewalResourceSettings,
} from "@/lib/lease-renewal/resource-locations";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import {
  TENANT_AUDIENCE_KINDS,
  TENANT_AUDIENCE_LABELS,
  TENANT_CHECK_METHODS,
  TENANT_CHECK_METHOD_LABELS,
  TENANT_CHECK_RESULTS,
  TENANT_CHECK_RESULT_LABELS,
  TENANT_RESOURCE_PURPOSE_LABELS,
  describeTenantResourceUse,
  isTenantResourceId,
  readTenantAccess,
  tenantResourceUse,
  type TenantAccessInput,
} from "@/lib/lease-renewal/tenant-resource-evidence";

// S265 (R-S265-1): the three tenant entries also carry the tenant audience check, edited here by an
// Admin through the same versioned save and readback. Every role sees each entry's state; other
// roles see the Admin handoff and never an edit. A replaced link clears the check fields, so an
// earlier check never carries over to a new destination.

/** The audience check as typed; every field is text until it is complete. */
interface AccessDraft {
  documentVersion: string;
  audience: "" | (typeof TENANT_AUDIENCE_KINDS)[number];
  recipients: string;
  method: "" | (typeof TENANT_CHECK_METHODS)[number];
  result: "" | (typeof TENANT_CHECK_RESULTS)[number];
  checkedBy: string;
  checkedOn: string;
  validUntil: string;
}
interface EntryDraft {
  url: string;
  verified: boolean;
  access: AccessDraft;
}
const EMPTY_ACCESS: AccessDraft = {
  documentVersion: "",
  audience: "",
  recipients: "",
  method: "",
  result: "",
  checkedBy: "",
  checkedOn: "",
  validUntil: "",
};
export const PARTIAL_AUDIENCE_CHECK =
  "Complete every tenant audience check field, or clear them to leave this link Source pending.";

function accessDraftOf(entry: Parameters<typeof readTenantAccess>[0]): AccessDraft {
  const access = readTenantAccess(entry);
  if (!access || access === "invalid") return EMPTY_ACCESS;
  return {
    documentVersion: access.documentVersion,
    audience: access.audience.kind,
    recipients:
      access.audience.kind === "restricted" ? access.audience.recipients.join("\n") : "",
    method: access.method,
    result: access.result,
    checkedBy: access.checkedBy,
    checkedOn: access.checkedOn,
    validUntil: access.validUntil,
  };
}

/** None when every field is blank, partial when some are, else the check to save. */
function accessPayload(
  draft: AccessDraft,
):
  | { kind: "none" }
  | { kind: "partial" }
  | { kind: "complete"; value: TenantAccessInput } {
  const recipients = draft.recipients
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const values = [
    draft.documentVersion.trim(),
    draft.audience,
    draft.method,
    draft.result,
    draft.checkedBy.trim(),
    draft.checkedOn,
    draft.validUntil,
  ];
  if (!values.some(Boolean) && recipients.length === 0) return { kind: "none" };
  if (
    values.some((value) => !value) ||
    (draft.audience === "restricted" && recipients.length === 0)
  )
    return { kind: "partial" };
  return {
    kind: "complete",
    value: {
      documentVersion: draft.documentVersion.trim(),
      audience:
        draft.audience === "restricted"
          ? { kind: "restricted", recipients }
          : { kind: "tenant_wide" },
      method: draft.method as TenantAccessInput["method"],
      result: draft.result as TenantAccessInput["result"],
      checkedBy: draft.checkedBy.trim(),
      checkedOn: draft.checkedOn,
      validUntil: draft.validUntil,
    },
  };
}

export function RenewalResourceLocations({
  role,
  initialSettings,
}: {
  role: Role;
  initialSettings: RenewalResourceSettings | null;
}) {
  const [settings, setSettings] = useState(initialSettings),
    [edits, setEdits] = useState<Record<string, EntryDraft>>({});
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  // The business date the tenant states are read on; fixed for this view.
  const [todayIso] = useState(() => businessDateIso(Date.now()));
  const editable = can(role, "manageAdmin") && settings !== null;
  const focusAfterSave = useRenewalSaveFocus();
  const valueOf = (id: string): EntryDraft => {
    const saved = settings?.entries[id];
    return (
      edits[id] ?? {
        url: saved?.url ?? "",
        verified: saved?.verified ?? false,
        access: accessDraftOf(saved),
      }
    );
  };
  const edit = (id: string, next: EntryDraft) =>
    setEdits((current) => ({ ...current, [id]: next }));
  async function save(id: string) {
    const value = valueOf(id);
    setError("");
    setNotice("");
    let tenantAccess: TenantAccessInput | null | undefined;
    if (isTenantResourceId(id)) {
      const payload = accessPayload(value.access);
      if (payload.kind === "partial") {
        setError(PARTIAL_AUDIENCE_CHECK);
        return;
      }
      tenantAccess = payload.kind === "complete" ? payload.value : null;
    }
    setPending(true);
    try {
      const response = await fetch("/api/lease-renewal/resource-locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resource: {
            id,
            url: value.url,
            verified: value.verified,
            ...(tenantAccess !== undefined ? { tenantAccess } : {}),
          },
          expectedVersion: settings?.version,
          operationId: crypto.randomUUID(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The link could not be saved.");
      setSettings(RenewalResourceSettingsSchema.parse(body.settings));
      setEdits((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
      );
      setNotice(
        value.url ? "Link saved and read back." : "Blank pending-team input saved.",
      );
      focusAfterSave?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The link could not be saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      id="renewal-resource-locations"
      className="panel ui-stack task-anchor"
      aria-label="Renewal resource links"
      tabIndex={-1}
    >
      <RenewalSectionHeading id="resource-links" as="h3">
        Renewal resource links
      </RenewalSectionHeading>
      <p className="muted">
        Shared by every lease. Only staff-verified links reach a message or packet.
      </p>
      {settings === null ? (
        <p role="alert">
          Saved links could not be read. Reload before editing; their values are unknown.
        </p>
      ) : null}
      {!can(role, "manageAdmin") ? (
        <p className="muted">
          An Admin maintains these shared links.{" "}
          <RequestAccessLink surface="renewal_resources.manage" />
        </p>
      ) : null}
      {RENEWAL_RESOURCE_FIELDS.map((field) => {
        const value = valueOf(field.id);
        const tenant = isTenantResourceId(field.id);
        const access = value.access;
        const setAccess = (next: Partial<AccessDraft>) =>
          edit(field.id, { ...value, access: { ...access, ...next } });
        const accessId = (name: string) => `renewal-resource-${field.id}-${name}`;
        return (
          <form
            key={field.id}
            id={`renewal-resource-entry-${field.id}`}
            className="ui-stack-tight task-anchor"
            tabIndex={-1}
            onSubmit={(event) => {
              event.preventDefault();
              void save(field.id);
            }}
          >
            <Field label={field.label} htmlFor={`renewal-resource-${field.id}`}>
              <input
                id={`renewal-resource-${field.id}`}
                type="url"
                placeholder="Add link"
                value={value.url}
                disabled={!editable || pending}
                onChange={(event) =>
                  // A replaced link never keeps its earlier checks.
                  edit(field.id, {
                    url: event.target.value,
                    verified: false,
                    access: EMPTY_ACCESS,
                  })
                }
              />
            </Field>
            <span className="muted">
              {settings === null
                ? "Unknown saved state"
                : isTenantResourceId(field.id)
                  ? describeTenantResourceUse(
                      tenantResourceUse(field.id, settings.entries[field.id], todayIso),
                    )
                  : !value.url
                    ? "Pending team input"
                    : value.verified
                      ? "Destination checked by staff"
                      : "Destination needs review"}
            </span>
            {editable ? (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={value.verified}
                    disabled={!value.url || pending}
                    onChange={(event) =>
                      edit(field.id, { ...value, verified: event.target.checked })
                    }
                  />
                  I checked this destination and its intended use
                </label>
                {tenant ? (
                  <fieldset
                    className="ui-stack-tight"
                    aria-describedby={accessId("purpose")}
                  >
                    <legend>Tenant audience check: {field.label}</legend>
                    <p id={accessId("purpose")}>
                      Purpose: {TENANT_RESOURCE_PURPOSE_LABELS[field.id]}.
                    </p>
                    <Field
                      label="Document version"
                      htmlFor={accessId("document-version")}
                    >
                      <input
                        type="text"
                        value={access.documentVersion}
                        disabled={pending}
                        onChange={(event) =>
                          setAccess({ documentVersion: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Audience" htmlFor={accessId("audience")}>
                      <select
                        value={access.audience}
                        disabled={pending}
                        onChange={(event) =>
                          setAccess({
                            audience: event.target.value as AccessDraft["audience"],
                          })
                        }
                      >
                        <option value="">Choose who can open it</option>
                        {TENANT_AUDIENCE_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {TENANT_AUDIENCE_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {access.audience === "restricted" ? (
                      <Field
                        label="Covered recipients"
                        htmlFor={accessId("recipients")}
                        hint="One email address per line, exactly as the tenant message is addressed."
                      >
                        <textarea
                          rows={3}
                          value={access.recipients}
                          disabled={pending}
                          onChange={(event) =>
                            setAccess({ recipients: event.target.value })
                          }
                        />
                      </Field>
                    ) : null}
                    <Field label="How it was checked" htmlFor={accessId("method")}>
                      <select
                        value={access.method}
                        disabled={pending}
                        onChange={(event) =>
                          setAccess({
                            method: event.target.value as AccessDraft["method"],
                          })
                        }
                      >
                        <option value="">Choose how it was checked</option>
                        {TENANT_CHECK_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {TENANT_CHECK_METHOD_LABELS[method]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="What opened" htmlFor={accessId("result")}>
                      <select
                        value={access.result}
                        disabled={pending}
                        onChange={(event) =>
                          setAccess({
                            result: event.target.value as AccessDraft["result"],
                          })
                        }
                      >
                        <option value="">Choose what opened</option>
                        {TENANT_CHECK_RESULTS.map((result) => (
                          <option key={result} value={result}>
                            {TENANT_CHECK_RESULT_LABELS[result]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Checked by" htmlFor={accessId("checked-by")}>
                      <input
                        type="text"
                        value={access.checkedBy}
                        disabled={pending}
                        onChange={(event) => setAccess({ checkedBy: event.target.value })}
                      />
                    </Field>
                    <Field label="Checked on" htmlFor={accessId("checked-on")}>
                      <input
                        type="date"
                        value={access.checkedOn}
                        disabled={pending}
                        onChange={(event) => setAccess({ checkedOn: event.target.value })}
                      />
                    </Field>
                    <Field label="Check valid until" htmlFor={accessId("valid-until")}>
                      <input
                        type="date"
                        value={access.validUntil}
                        disabled={pending}
                        onChange={(event) =>
                          setAccess({ validUntil: event.target.value })
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="tertiary"
                      disabled={pending}
                      onClick={() => edit(field.id, { ...value, access: EMPTY_ACCESS })}
                    >
                      Clear audience check
                    </Button>
                  </fieldset>
                ) : null}
                <Button type="submit" disabled={pending} variant="secondary">
                  Save {field.label.toLowerCase()}
                </Button>
              </>
            ) : null}
          </form>
        );
      })}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
