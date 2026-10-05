"use client";

// S166: remembers the signed-in account's worklist view. The worklist stays a server-rendered
// table of GET links and GET forms; this wrapper only notices that one of those controls was used
// and, once the chosen view is the one on screen, saves that view for the account.
//
// A view opened any other way (a shared link, an assistant link, a return link, a bookmark) is
// shown and never saved, so following a link cannot replace what the account remembers. Saving is
// offered only where the account's view can be kept: a verification account or a read-only
// rehearsal never attempts the request.

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  AUTOSAVE_EDITED,
  AUTOSAVE_IDLE,
  AutosaveStatus,
  type AutosaveState,
} from "@/components/lease-renewal/AutosaveStatus";
import { Button } from "@/components/ui";
import { usePersonalView } from "@/components/layout/PersonalViewProvider";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import type {
  DeskPreferenceMode,
  RenewalDeskEntrySource,
} from "@/lib/lease-renewal/desk-preferences";
import {
  EXPLICIT_DEFAULT_DESK_VIEW,
  RENEWAL_DESK_ROUTE,
} from "@/lib/lease-renewal/desk-view-continuation";

const PREFERENCE_ROUTE = "/api/lease-renewal/desk-preferences";
const CHOSEN_VIEW_STORAGE_KEY = "pmi-kc:renewal-desk:chosen-view";
/** A chosen view that has not opened within this long is forgotten rather than saved late. */
const CHOSEN_VIEW_MAX_AGE_MS = 5 * 60_000;
const SAVE_FAILED_MESSAGE = "The view could not be saved just now.";

interface ChosenView {
  readonly accountId: string;
  /** The exact query string the control navigates to. */
  readonly search: string;
  readonly at: number;
}

// Kept in memory as well, so a client-side navigation works when session storage is unavailable.
let chosenInMemory: ChosenView | null = null;

function noteChosenView(search: string, accountId: string) {
  const chosen: ChosenView = { search, accountId, at: Date.now() };
  chosenInMemory = chosen;
  try {
    window.sessionStorage.setItem(CHOSEN_VIEW_STORAGE_KEY, JSON.stringify(chosen));
  } catch {
    // Storage can be unavailable; the in-memory note still covers a client-side navigation.
  }
}

/** Read and clear the note left by the last worklist control, when it is still current. */
function takeChosenView(accountId: string): ChosenView | null {
  let chosen = chosenInMemory;
  chosenInMemory = null;
  try {
    const raw = window.sessionStorage.getItem(CHOSEN_VIEW_STORAGE_KEY);
    window.sessionStorage.removeItem(CHOSEN_VIEW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ChosenView> | null;
      if (parsed && typeof parsed.search === "string" && typeof parsed.at === "number")
        chosen = {
          search: parsed.search,
          at: parsed.at,
          accountId: parsed.accountId ?? "",
        };
    }
  } catch {
    // Unreadable storage is treated as no note.
  }
  if (
    !chosen ||
    chosen.accountId !== accountId ||
    Date.now() - chosen.at > CHOSEN_VIEW_MAX_AGE_MS
  )
    return null;
  return chosen;
}

/** Test seam: forget any note left by an earlier render. */
export function resetRenewalDeskViewMemoryForTests() {
  chosenInMemory = null;
}

interface ViewMemoryValue {
  readonly memory: DeskPreferenceMode;
  readonly currentView: string;
  readonly viewSource: RenewalDeskEntrySource;
  /** The account's remembered view as this page knows it; "" is the default view. */
  readonly rememberedView: string;
  readonly status: AutosaveState;
  /** True once this view is known to have come from a link rather than a worklist control. */
  readonly openedFromLink: boolean;
  readonly remember: () => void;
  readonly retry: () => void;
  readonly reset: () => void;
  readonly hasLayout: boolean;
}

const ViewMemoryContext = createContext<ViewMemoryValue | null>(null);

export interface RenewalDeskViewMemoryProps {
  readonly accountId?: string;
  readonly savedRevision?: number;
  readonly children: ReactNode;
  /** Canonical query for the view on screen; "" is the default view. */
  readonly currentView: string;
  /** What chose this view: the URL, the account's remembered view, or the default. */
  readonly viewSource: RenewalDeskEntrySource;
  /** The account's remembered non-default view, or null. */
  readonly savedView: string | null;
  /** Whether this account's view can be remembered here. */
  readonly memory: DeskPreferenceMode;
}

export function RenewalDeskViewMemory({
  children,
  currentView,
  viewSource,
  savedView,
  memory,
  accountId = "",
  savedRevision = 0,
}: RenewalDeskViewMemoryProps) {
  const personal = usePersonalView("renewals");
  const personalRef = useRef(personal);
  useEffect(() => {
    personalRef.current = personal;
  }, [personal]);
  const account = personal.accountId || accountId;
  const revision = useRef(savedRevision);
  const [status, setStatus] = useState<AutosaveState>(AUTOSAVE_IDLE);
  // What this page itself saved most recently; it is newer than the value the server rendered.
  const [savedHere, setSavedHere] = useState<string | null>(null);
  const [arrival, setArrival] = useState<{ view: string; chosen: boolean } | null>(null);
  const sequence = useRef(0);
  const rememberedView =
    savedHere ??
    (personal.accountId && personal.loaded ? personal.value.query : savedView) ??
    "";
  const effectiveStatus: AutosaveState = personal.accountId
    ? personal.phase === "saving"
      ? { phase: "saving" }
      : personal.phase === "saved"
        ? { phase: "saved" }
        : personal.phase === "failed"
          ? { phase: "failed", message: personal.message }
          : personal.phase === "edited"
            ? AUTOSAVE_EDITED
            : AUTOSAVE_IDLE
    : status;
  useEffect(
    () => () => {
      ++sequence.current;
    },
    [account],
  );
  const rememberedRef = useRef(rememberedView);
  useEffect(() => {
    rememberedRef.current = rememberedView;
  }, [rememberedView]);

  const save = useCallback(async (view: string) => {
    if (personalRef.current.accountId) {
      personalRef.current.change({ ...personalRef.current.value, query: view });
      return;
    }
    const attempt = ++sequence.current;
    setStatus({ phase: "saving" });
    let saved = false;
    let message = SAVE_FAILED_MESSAGE;
    try {
      const response = await fetchWithDeadline(PREFERENCE_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: view === "" ? EXPLICIT_DEFAULT_DESK_VIEW : view,
          expectedRevision: revision.current,
        }),
      });
      saved = response.ok;
      if (saved) {
        const data = await response.json();
        revision.current = data.preference?.revision ?? revision.current + 1;
      }
      if (!saved) {
        const payload = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        if (typeof payload?.error === "string" && payload.error.trim())
          message = payload.error.trim();
      }
    } catch {
      saved = false;
    }
    // An older response never replaces the result of a newer choice.
    if (attempt !== sequence.current) return;
    if (saved) {
      setSavedHere(view);
      setStatus({ phase: "saved" });
    } else setStatus({ phase: "failed", message });
  }, []);

  // One arrival check per view on screen. The note is read once (it is cleared as it is read), so
  // a repeated effect run for the same view reuses the first result instead of losing the choice.
  const arrivalChecked = useRef<{ view: string; chosen: boolean } | null>(null);
  useEffect(() => {
    if (memory !== "saved") return;
    if (arrivalChecked.current?.view === currentView) return;
    const chosen = takeChosenView(account);
    const opened = window.location.search.replace(/^\?/, "");
    const result = {
      view: currentView,
      chosen: chosen !== null && chosen.search === opened,
    };
    arrivalChecked.current = result;
    const saveNow = result.chosen && currentView !== rememberedRef.current;
    queueMicrotask(() => {
      setArrival(result);
      if (saveNow) void save(currentView);
      else setStatus(AUTOSAVE_IDLE);
    });
  }, [account, currentView, memory, save]);

  const remember = useCallback(() => void save(currentView), [currentView, save]);
  const reset = useCallback(() => {
    if (personalRef.current.accountId)
      personalRef.current.change({ query: "", layout: { columns: {} } });
  }, []);
  const retry = useCallback(() => {
    if (personalRef.current.accountId)
      personalRef.current.retry({ ...personalRef.current.value, query: currentView });
    else
      void (async () => {
        setStatus({ phase: "saving" });
        try {
          const response = await fetchWithDeadline(PREFERENCE_ROUTE, {
            cache: "no-store",
          });
          if (!response.ok) throw new Error(SAVE_FAILED_MESSAGE);
          const data = await response.json();
          if (
            !Number.isInteger(data.preference?.revision) ||
            data.preference.revision < 0
          )
            throw new Error(SAVE_FAILED_MESSAGE);
          revision.current = data.preference.revision;
          await save(currentView);
        } catch {
          setStatus({ phase: "failed", message: SAVE_FAILED_MESSAGE });
        }
      })();
  }, [currentView, save]);

  const noteClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.("a[href]");
    if (!anchor) return;
    if (anchor.hasAttribute("data-reset-personal-view") && personalRef.current.accountId)
      return;
    const href = (anchor.getAttribute("href") ?? "").split("#")[0];
    const mark = href.indexOf("?");
    // Only a worklist link that names a view is a choice; the bare desk and lease links are not.
    if (mark === -1 || href.slice(0, mark) !== RENEWAL_DESK_ROUTE) return;
    const search = href.slice(mark + 1);
    if (search !== "") noteChosenView(search, account);
  };

  const noteSubmit = (event: FormEvent<HTMLElement>) => {
    const form = event.target as HTMLFormElement | null;
    if (!form || form.tagName !== "FORM") return;
    if (form.getAttribute("action") !== RENEWAL_DESK_ROUTE) return;
    if ((form.getAttribute("method") ?? "get").toLowerCase() !== "get") return;
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") params.append(key, value);
    });
    noteChosenView(params.toString(), account);
  };

  const value = useMemo<ViewMemoryValue>(
    () => ({
      memory,
      currentView,
      viewSource,
      rememberedView,
      status: effectiveStatus,
      openedFromLink:
        arrival !== null &&
        arrival.view === currentView &&
        !arrival.chosen &&
        viewSource === "explicit",
      remember,
      retry,
      reset,
      hasLayout:
        Object.keys(personal.value.layout.columns).length > 0 ||
        personal.value.layout.panelWidth !== undefined,
    }),
    [
      arrival,
      currentView,
      memory,
      remember,
      rememberedView,
      retry,
      reset,
      personal.value.layout,
      effectiveStatus,
      viewSource,
    ],
  );

  const active = memory === "saved";
  return (
    <ViewMemoryContext.Provider value={value}>
      <section
        aria-label="Renewal worklist"
        className="ui-stack"
        data-desk-view-source={viewSource}
        onClickCapture={active ? noteClick : undefined}
        onSubmitCapture={active ? noteSubmit : undefined}
      >
        {children}
      </section>
    </ViewMemoryContext.Provider>
  );
}

/**
 * The remembered-view line inside the worklist toolbar: where the view came from, the save state
 * of a deliberate change, and the explicit reset. Renders nothing where no view can be remembered.
 */
export function RenewalDeskViewMemoryStatus() {
  const context = useContext(ViewMemoryContext);
  if (!context) return null;
  if (context.memory !== "saved")
    return context.currentView !== "" || context.hasLayout ? (
      <span className="renewal-view-memory">
        <span>View kept for this visit.</span>
        <Link
          className="text-link"
          href={`${RENEWAL_DESK_ROUTE}?${EXPLICIT_DEFAULT_DESK_VIEW}`}
          prefetch={false}
          onClick={context.reset}
        >
          Reset view
        </Link>
      </span>
    ) : null;
  const { currentView, rememberedView, status, viewSource } = context;
  const differs = currentView !== rememberedView;
  const linked = context.openedFromLink && differs && status.phase === "idle";
  return (
    <span className="renewal-view-memory" data-renewal-view-memory={viewSource}>
      {viewSource === "saved" && !differs ? <span>Showing your saved view.</span> : null}
      {linked && rememberedView !== "" ? (
        <span>This link opened its own view. Your saved view is unchanged.</span>
      ) : null}
      {linked ? (
        <Button onClick={context.remember} size="compact" variant="tertiary">
          Remember this view
        </Button>
      ) : null}
      {linked && rememberedView !== "" ? (
        <Link className="text-link" href={RENEWAL_DESK_ROUTE} prefetch={false}>
          Open your saved view
        </Link>
      ) : null}
      <AutosaveStatus
        onRetry={context.retry}
        state={status}
        subject="your worklist view"
      />
      {rememberedView !== "" || context.hasLayout ? (
        <Link
          className="text-link"
          data-reset-personal-view="true"
          href={`${RENEWAL_DESK_ROUTE}?${EXPLICIT_DEFAULT_DESK_VIEW}`}
          prefetch={false}
          onClick={context.reset}
        >
          Reset view
        </Link>
      ) : null}
    </span>
  );
}
