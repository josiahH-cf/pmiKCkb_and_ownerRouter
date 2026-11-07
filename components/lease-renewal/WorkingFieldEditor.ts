"use client";

import { useId, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import type { WorkingValueOrigin } from "@/lib/lease-renewal/working-record";

export interface WorkingLocalCommand {
  readonly value: number | string | null;
  readonly options?: {
    readonly origin?: WorkingValueOrigin;
    readonly sourceLabel?: string;
    readonly context?: string;
  };
}
export interface WorkingLocalDraft {
  readonly text: string;
  readonly version: number;
  readonly command?: WorkingLocalCommand;
}

/** Local editor coordination only. Persistence and its operation identity stay in the provider. */
export interface WorkingFieldEditor {
  readonly control: () => HTMLElement | null;
  readonly dirty: () => boolean;
  readonly order: () => number;
  readonly flush: () => Promise<boolean>;
}

interface Registry {
  readonly registerFieldEditor?: (
    field: string,
    id: string,
    editor: WorkingFieldEditor,
  ) => () => void;
  readonly localDraft?: (field: string) => WorkingLocalDraft | null;
  readonly editLocalDraft?: (
    field: string,
    text: string,
    command?: WorkingLocalCommand,
  ) => number;
  readonly confirmLocalDraft?: (field: string, version: number) => boolean;
}

let editOrder = 0;

/** Coalesce one real save and acknowledge only the exact local entry it carried. */
export function useWorkingFieldEditor(
  registry: Registry | null,
  field: string,
  control: RefObject<HTMLElement | null>,
) {
  const id = useId();
  const state = useRef({
    dirty: false,
    order: 0,
    text: "",
    command: undefined as WorkingLocalCommand | undefined,
    commit: async (): Promise<boolean> => true,
  });
  const pending = useRef<Promise<boolean> | null>(null);
  const readDraft = registry?.localDraft;
  const retainDraft = registry?.editLocalDraft;
  const confirmDraft = registry?.confirmLocalDraft;
  const editor = useMemo(() => {
    const flush = (): Promise<boolean> => {
      if (pending.current)
        return pending.current.then((ok) =>
          ok && (readDraft ? readDraft(field) !== null : state.current.dirty)
            ? flush()
            : ok,
        );
      const operation: Promise<boolean> = state.current
        .commit()
        .catch(() => false)
        .finally(() => {
          if (pending.current === operation) pending.current = null;
        });
      pending.current = operation;
      return operation;
    };
    return {
      flush,
      shared: Boolean(readDraft),
      draft: (): WorkingLocalDraft | null =>
        readDraft
          ? readDraft(field)
          : state.current.dirty
            ? {
                text: state.current.text,
                version: state.current.order,
                command: state.current.command,
              }
            : null,
      edited: (text: string, command?: WorkingLocalCommand) => {
        state.current.dirty = true;
        state.current.text = text;
        state.current.command = command;
        state.current.order = retainDraft?.(field, text, command) ?? ++editOrder;
        return state.current.order;
      },
      version: () => readDraft?.(field)?.version ?? state.current.order,
      dirty: () => (readDraft ? readDraft(field) !== null : state.current.dirty),
      confirmed: (version: number) => {
        if (confirmDraft) {
          const confirmed = confirmDraft(field, version);
          if (confirmed) state.current.dirty = false;
          return confirmed;
        }
        if (state.current.order !== version) return false;
        state.current.dirty = false;
        return true;
      },
      commit: (callback: () => Promise<boolean>) => {
        state.current.commit = callback;
      },
    };
  }, [field, readDraft, retainDraft, confirmDraft]);
  const register = registry?.registerFieldEditor;
  useLayoutEffect(
    () =>
      register?.(field, id, {
        control: () => control.current,
        dirty: editor.dirty,
        order: editor.version,
        flush: editor.flush,
      }),
    [register, field, id, control, editor],
  );
  return editor;
}
