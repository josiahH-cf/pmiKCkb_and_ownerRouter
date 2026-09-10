"use client";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { useState } from "react";
import { Button, Field } from "@/components/ui";
import { can, type Role } from "@/lib/auth/roles";
import {
  RENEWAL_RESOURCE_FIELDS,
  RenewalResourceSettingsSchema,
  type RenewalResourceSettings,
} from "@/lib/lease-renewal/resource-locations";
export function RenewalResourceLocations({
  role,
  initialSettings,
}: {
  role: Role;
  initialSettings: RenewalResourceSettings | null;
}) {
  const [settings, setSettings] = useState(initialSettings),
    [edits, setEdits] = useState<Record<string, { url: string; verified: boolean }>>({});
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const editable = can(role, "manageAdmin") && settings !== null;
  async function save(id: string) {
    const value = edits[id] ?? settings?.entries[id] ?? { url: "", verified: false };
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/lease-renewal/resource-locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resource: { id, url: value.url, verified: value.verified },
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "The link could not be saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      id="renewal-resource-locations"
      className="panel ui-stack"
      aria-label="Renewal resource links"
    >
      <h3>Renewal resource links</h3>
      <p className="muted">
        Blank links are pending team input. A legal-form location identifies where to find
        content; the approved artifact and packet mapping remain separate.
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
        const value = edits[field.id] ??
          settings?.entries[field.id] ?? { url: "", verified: false };
        return (
          <form
            key={field.id}
            className="ui-stack-tight"
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
                  setEdits((current) => ({
                    ...current,
                    [field.id]: { url: event.target.value, verified: false },
                  }))
                }
              />
            </Field>
            <span className="muted">
              {settings === null
                ? "Unknown saved state"
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
                      setEdits((current) => ({
                        ...current,
                        [field.id]: { ...value, verified: event.target.checked },
                      }))
                    }
                  />
                  I checked this destination and its intended use
                </label>
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
