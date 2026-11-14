"use client";

// S278 R-S278-2 (BEH-S278-3, AC-S278-2): from a Finish up source preview, its action opens the
// owning form with the previewed new value filled into "New end date" (RentVine) or "New value"
// (the operating Sheet), marked "From the working terms", with focus on that input. The form's own
// exact preview and confirmation follow unchanged, and staff can change the value first. Opening
// is presentation only: it saves nothing, prepares nothing and reads no source.

import { useEffect, useRef } from "react";

import type { SheetEditableField } from "@/lib/lease-renewal/sheet-writeback/field-intent";

export const SOURCE_FORM_PREFILL_EVENT = "renewal:source-form-prefill";

/** The mark beside a value filled from the preview, until staff change it. */
export const FROM_WORKING_TERMS = "From the working terms";

export type SourceFormPrefill =
  | { readonly form: "rentvine_end_date"; readonly value: string }
  | {
      readonly form: "sheet_field";
      readonly field: SheetEditableField;
      readonly value: string;
    };

/** A request a form that mounts a moment later still takes, once. */
const PENDING_WINDOW_MS = 5_000;
let pending: { readonly request: SourceFormPrefill; readonly atMs: number } | null = null;

/** Ask the owning form to open with the previewed value. */
export function requestSourceFormPrefill(request: SourceFormPrefill): void {
  pending = { request, atMs: Date.now() };
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent<SourceFormPrefill>(SOURCE_FORM_PREFILL_EVENT, { detail: request }),
  );
}

function takePending(form: SourceFormPrefill["form"]): SourceFormPrefill | null {
  if (!pending || pending.request.form !== form) return null;
  if (Date.now() - pending.atMs > PENDING_WINDOW_MS) {
    pending = null;
    return null;
  }
  const { request } = pending;
  pending = null;
  return request;
}

/**
 * The owning form's side: apply a prefill request for this form, whether it arrives while the form
 * is mounted or just before it mounts.
 */
export function useSourceFormPrefill(
  form: SourceFormPrefill["form"],
  apply: (request: SourceFormPrefill) => void,
): void {
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);
  useEffect(() => {
    const waiting = takePending(form);
    if (waiting) applyRef.current(waiting);
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<SourceFormPrefill>).detail;
      if (!request || request.form !== form) return;
      if (pending?.request === request) pending = null;
      applyRef.current(request);
    };
    document.addEventListener(SOURCE_FORM_PREFILL_EVENT, onRequest);
    return () => document.removeEventListener(SOURCE_FORM_PREFILL_EVENT, onRequest);
  }, [form]);
}

/** Open every enclosing details element and focus the input, after the value renders. */
export function focusPrefilledInput(input: HTMLElement | null): void {
  if (!input) return;
  let ancestor: HTMLElement | null = input;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  input.focus();
  input.scrollIntoView?.({ block: "center" });
}
