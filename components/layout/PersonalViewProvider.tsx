"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import {
  DEFAULT_PERSONAL_VIEW,
  PersonalViewValueSchema,
  canonicalPersonalView,
  type PersonalView,
  type PersonalViewSurface,
  type PersonalViewValue,
} from "@/lib/ui/personal-views";

type State = {
  value: PersonalViewValue;
  revision: number;
  loaded: boolean;
  phase: "idle" | "loading" | "edited" | "saving" | "saved" | "failed";
  message: string;
  /** The view an edit was made from while the stored view had not loaded yet. */
  base?: PersonalViewValue;
};
/**
 * An edit made before the stored view loaded was built on defaults. Only the parts it actually
 * changed replace the stored view, so an early search or sort never erases saved sizing.
 */
function mergeEarlyEdit(
  base: PersonalViewValue | undefined,
  edited: PersonalViewValue,
  stored: PersonalViewValue,
): PersonalViewValue {
  if (!base) return edited;
  const columns = { ...stored.layout.columns };
  for (const key of new Set([
    ...Object.keys(base.layout.columns),
    ...Object.keys(edited.layout.columns),
  ])) {
    const next = edited.layout.columns[key];
    if (next === base.layout.columns[key]) continue;
    if (next === undefined) delete columns[key];
    else columns[key] = next;
  }
  const panelWidth =
    edited.layout.panelWidth === base.layout.panelWidth
      ? stored.layout.panelWidth
      : edited.layout.panelWidth;
  return {
    query: edited.query === base.query ? stored.query : edited.query,
    layout: { columns, ...(panelWidth === undefined ? {} : { panelWidth }) },
  };
}
type Context = {
  accountId: string;
  canSave: boolean;
  states: Partial<Record<PersonalViewSurface, State>>;
  load: (surface: PersonalViewSurface) => Promise<void>;
  change: (surface: PersonalViewSurface, value: PersonalViewValue) => void;
  retry: (surface: PersonalViewSurface, value?: PersonalViewValue) => void;
};
const PersonalViews = createContext<Context | null>(null);
const initial = (): State => ({
  value: structuredClone(DEFAULT_PERSONAL_VIEW),
  revision: 0,
  loaded: false,
  phase: "idle",
  message: "",
});

export function PersonalViewProvider({
  accountId,
  canSave,
  children,
}: {
  accountId: string;
  canSave: boolean;
  children: ReactNode;
}) {
  return (
    <OwnedPersonalViewProvider
      key={`${accountId}:${canSave}`}
      accountId={accountId}
      canSave={canSave}
    >
      {children}
    </OwnedPersonalViewProvider>
  );
}
function OwnedPersonalViewProvider({
  accountId,
  canSave,
  children,
}: {
  accountId: string;
  canSave: boolean;
  children: ReactNode;
}) {
  const [states, setStates] = useState<Context["states"]>({});
  const current = useRef<Context["states"]>({});
  const reads = useRef(new Map<PersonalViewSurface, Promise<void>>());
  const writes = useRef(new Set<PersonalViewSurface>());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const publish = useCallback((surface: PersonalViewSurface, state: State) => {
    if (!live.current) return;
    current.current = { ...current.current, [surface]: state };
    setStates(current.current);
  }, []);
  const load = useCallback(
    (surface: PersonalViewSurface) => {
      const running = reads.current.get(surface);
      if (running) return running;
      const before = current.current[surface] ?? initial();
      publish(surface, {
        ...before,
        phase: before.phase === "edited" ? "edited" : "loading",
      });
      const pending = (async () => {
        try {
          const response = await fetchWithDeadline(
            `/api/personal-view?surface=${surface}`,
            { cache: "no-store" },
          );
          const data = (await response.json()) as {
            preference?: PersonalView;
            error?: string;
          };
          if (
            !response.ok ||
            !data.preference ||
            data.preference.surface !== surface ||
            !Number.isInteger(data.preference.revision) ||
            data.preference.revision < 0 ||
            !PersonalViewValueSchema.safeParse(data.preference.value).success ||
            !canonicalPersonalView(surface, data.preference.value)
          )
            throw new Error(data.error ?? "The saved view could not be loaded.");
          const latest = current.current[surface] ?? before;
          const edited = ["edited", "saving", "failed"].includes(latest.phase);
          publish(surface, {
            value: edited
              ? mergeEarlyEdit(latest.base, latest.value, data.preference.value)
              : data.preference.value,
            revision: data.preference.revision,
            loaded: true,
            phase: edited ? latest.phase : "idle",
            message: "",
          });
        } catch (error) {
          publish(surface, {
            ...(current.current[surface] ?? before),
            phase: "failed",
            message:
              error instanceof Error
                ? error.message
                : "The saved view could not be loaded.",
          });
        }
      })();
      reads.current.set(surface, pending);
      return pending;
    },
    [publish],
  );
  const save = useCallback(
    async (surface: PersonalViewSurface, recover = false) => {
      if (!canSave || writes.current.has(surface)) return;
      writes.current.add(surface);
      try {
        if (recover) reads.current.delete(surface);
        await load(surface);
        let state = current.current[surface];
        if (!live.current || !state?.loaded || state.phase === "failed") return;
        while (live.current) {
          state = current.current[surface]!;
          const sent = state.value;
          const canonicalSent = canonicalPersonalView(surface, sent);
          if (!canonicalSent)
            throw new Error(
              "This view cannot be saved. Restore a supported view and recover before saving again.",
            );
          publish(surface, { ...state, phase: "saving", message: "" });
          const response = await fetchWithDeadline("/api/personal-view", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              surface,
              expectedRevision: state.revision,
              value: sent,
            }),
          });
          const data = (await response.json()) as {
            preference?: PersonalView;
            error?: string;
          };
          if (
            !response.ok ||
            !data.preference ||
            data.preference.surface !== surface ||
            !Number.isInteger(data.preference.revision) ||
            data.preference.revision !== state.revision + 1 ||
            JSON.stringify(canonicalPersonalView(surface, data.preference.value)) !==
              JSON.stringify(canonicalSent)
          )
            throw new Error(
              data.error ??
                "The saved view is not confirmed. Recover before saving the current view again.",
            );
          const latest = current.current[surface]!;
          const changed = JSON.stringify(latest.value) !== JSON.stringify(sent);
          publish(surface, {
            ...latest,
            revision: data.preference.revision,
            loaded: true,
            phase: changed ? "edited" : "saved",
            message: "",
          });
          if (!changed) break;
        }
      } catch (error) {
        const state = current.current[surface];
        if (state)
          publish(surface, {
            ...state,
            phase: "failed",
            message:
              error instanceof Error ? error.message : "The saved view is not confirmed.",
          });
      } finally {
        writes.current.delete(surface);
      }
    },
    [canSave, load, publish],
  );
  const change = useCallback(
    (surface: PersonalViewSurface, value: PersonalViewValue) => {
      const state = current.current[surface] ?? initial();
      publish(surface, {
        ...state,
        value,
        base: state.loaded ? undefined : (state.base ?? state.value),
        phase: "edited",
        message: "",
      });
      void save(surface);
    },
    [publish, save],
  );
  const retry = useCallback(
    (surface: PersonalViewSurface, value?: PersonalViewValue) => {
      const state = current.current[surface];
      if (!state) return;
      publish(surface, {
        ...state,
        value: value ?? state.value,
        // A view that never loaded is recovered onto the stored one, not over it.
        base: state.loaded ? undefined : (state.base ?? state.value),
        loaded: false,
        phase: "edited",
      });
      void save(surface, true);
    },
    [publish, save],
  );
  return (
    <PersonalViews.Provider value={{ accountId, canSave, states, load, change, retry }}>
      {children}
    </PersonalViews.Provider>
  );
}

export function usePersonalView(surface: PersonalViewSurface) {
  const context = useContext(PersonalViews);
  const load = context?.load;
  useEffect(() => {
    if (load) void load(surface);
  }, [load, surface]);
  const state = context?.states[surface];
  const value = state?.value ?? DEFAULT_PERSONAL_VIEW;
  return {
    accountId: context?.accountId ?? "",
    canSave: context?.canSave ?? false,
    value,
    loaded: state?.loaded ?? !context,
    phase: state?.phase ?? "idle",
    message: state?.message ?? "",
    change: (next: PersonalViewValue) => context?.change(surface, next),
    retry: (next?: PersonalViewValue) => context?.retry(surface, next),
  };
}
export function PersonalViewStatus({ surface }: { surface: PersonalViewSurface }) {
  const view = usePersonalView(surface);
  if (view.phase === "idle" || view.phase === "loading") return null;
  if (!view.canSave)
    return (
      <span className="personal-view-status" role="status">
        View changed for this visit
      </span>
    );
  return (
    <span className="personal-view-status" role="status">
      {view.phase === "saving" ? (
        "Saving view…"
      ) : view.phase === "edited" ? (
        "View changed"
      ) : view.phase === "saved" ? (
        "View saved"
      ) : (
        <>
          {view.message}{" "}
          <button className="text-link" type="button" onClick={() => view.retry()}>
            Recover and save current view
          </button>
        </>
      )}
    </span>
  );
}

/** Persist declared local filter fields only. Entry links win without changing account memory. */
export function usePersonalFilters<T extends { [K in keyof T]: string }>(
  surface: PersonalViewSurface,
  defaults: T,
  enabled = true,
  onRestore?: (value: T) => void,
) {
  const personal = usePersonalView(surface);
  const latest = useRef(personal);
  useLayoutEffect(() => {
    latest.current = personal;
  }, [personal]);
  const [filters, update] = useState<T>(defaults);
  const filtersRef = useRef(filters);
  useLayoutEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  const initialized = useRef(false);
  const defaultsRef = useRef(defaults);
  const onRestoreRef = useRef(onRestore);
  useLayoutEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);
  useEffect(() => {
    if (!enabled || !personal.loaded || initialized.current) return;
    initialized.current = true;
    const keys = Object.keys(defaultsRef.current);
    const explicit = new URLSearchParams(window.location.search);
    const source = keys.some((key) => explicit.has(key))
      ? explicit
      : new URLSearchParams(personal.value.query);
    const next = { ...defaultsRef.current };
    keys.forEach((key) => {
      const value = source.get(key);
      if (value !== null && value.length <= 120)
        next[key as keyof T] = value as T[keyof T];
    });
    queueMicrotask(() => {
      filtersRef.current = next;
      update(next);
      onRestoreRef.current?.(next);
    });
  }, [enabled, personal.loaded, personal.value.query]);
  const setFilters = (value: T | ((current: T) => T)) => {
    initialized.current = true;
    const next = typeof value === "function" ? value(filtersRef.current) : value;
    filtersRef.current = next;
    update(next);
    const query = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      // A filter cleared to "all" is kept when its default is a narrower choice.
      if (value || defaultsRef.current[key as keyof T]) query.set(key, String(value));
    });
    latest.current.change({ ...latest.current.value, query: query.toString() });
  };
  const reset = () => {
    initialized.current = true;
    update(defaultsRef.current);
    filtersRef.current = defaultsRef.current;
    latest.current.change({ query: "", layout: { columns: {} } });
  };
  return [filters, setFilters, reset, update] as const;
}
