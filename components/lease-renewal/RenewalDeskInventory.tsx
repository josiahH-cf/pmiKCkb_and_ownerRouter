"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { useOperation } from "@/components/hooks/useOperation";
import {
  RenewalDeskTable,
  buildDeskPartyFilterOptions,
  type RenewalDeskViewMemoryInput,
} from "@/components/lease-renewal/RenewalDeskTable";
import { Button, BusyIndicator } from "@/components/ui";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import { LEASE_EXPORT_TTL_MS } from "@/lib/lease-renewal/live-lease-cache";
import {
  applyRenewalDeskQueryV2,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import { countRenewalDeskWorklistViews } from "@/lib/lease-renewal/desk-worklist-views";
import type { RenewalDeskView } from "@/lib/lease-renewal/desk-model";
import { RENEWAL_DESK_ROUTE } from "@/lib/lease-renewal/desk-view-continuation";
import type { Role } from "@/lib/auth/roles";
type Tokens = Record<
  "owner" | "tenant",
  readonly { normalized: string; token: string }[]
>;

/** Filter one admitted inventory. Revalidate the session, and retain source/refresh ownership. */
type InventoryProps = {
  view: RenewalDeskView;
  query: RenewalDeskQueryV2State;
  role: Role;
  tokens: Tokens;
  partyAvailable: boolean;
  scopeKey: string;
  dependentStateComplete: boolean;
  sheetWritebackPaused: boolean;
  viewMemory?: RenewalDeskViewMemoryInput;
};
export function RenewalDeskInventory(props: InventoryProps) {
  return (
    <OwnedRenewalDeskInventory
      key={`${props.scopeKey}:${props.view.dataCurrency.readAtIso}:${serializeRenewalDeskQueryV2(props.query)}`}
      {...props}
    />
  );
}
function OwnedRenewalDeskInventory({
  view,
  query,
  role,
  tokens,
  partyAvailable,
  scopeKey,
  dependentStateComplete,
  sheetWritebackPaused,
  viewMemory,
}: InventoryProps) {
  const [selection, setSelection] = useState({
    generation: view.dataCurrency.readAtIso,
    state: query,
    source: viewMemory?.source,
  });
  const [error, setError] = useState("");
  const [accessChanged, setAccessChanged] = useState(false);
  const [requested, setRequested] = useState<string | null>(null);
  const operation = useOperation(scopeKey);
  const currentScope = useRef(scopeKey);
  const generation = view.dataCurrency.readAtIso;
  const state = selection.generation === generation ? selection.state : query;
  const match = useMemo(
    () => (token: string, kind: "owner" | "tenant", labels: readonly string[]) =>
      tokens[kind].some(
        (entry) => entry.token === token && labels.includes(entry.normalized),
      ),
    [tokens],
  );
  const shortcuts = useMemo(
    () => ({
      available: partyAvailable,
      tokenFor: (kind: "owner" | "tenant", label: string) =>
        tokens[kind].find((entry) => entry.normalized === label)?.token ?? null,
    }),
    [tokens, partyAvailable],
  );
  const result = useMemo(
    () => applyRenewalDeskQueryV2(view.items, state, match),
    [view.items, state, match],
  );
  const partyOptions = useMemo(
    () => buildDeskPartyFilterOptions(view.items, shortcuts),
    [view.items, shortcuts],
  );
  const counts = useMemo(
    () => countRenewalDeskWorklistViews(view.items, state, match),
    [view.items, state, match],
  );
  async function choose(search: string, fromHistory = false) {
    const target = `${RENEWAL_DESK_ROUTE}?${search || "v=2"}`;
    const readAt = Date.parse(view.dataCurrency.readAtIso);
    if (
      !scopeKey ||
      !Number.isFinite(readAt) ||
      Date.now() - readAt > LEASE_EXPORT_TTL_MS
    ) {
      window.location.assign(target);
      return;
    }
    const beforeScope = scopeKey;
    setRequested(search || "v=2");
    setError("");
    const admitted = await operation.controller.run(
      "Applying requested view",
      async (signal) => {
        const response = await fetchWithDeadline("/api/lease-renewal/desk-admission", {
          signal,
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) return null;
        if (!response.ok) throw new Error("The admission read did not finish.");
        const value = (await response.json()) as {
          scopeKey: string;
          refreshAfter: number | null;
        };
        if (
          typeof value.scopeKey !== "string" ||
          !(
            value.refreshAfter === null ||
            (Number.isFinite(value.refreshAfter) && value.refreshAfter >= 0)
          )
        )
          throw new Error("The admission response could not be validated.");
        return value;
      },
    );
    if (admitted.outcome === "superseded" || currentScope.current !== beforeScope) return;
    try {
      if (admitted.outcome !== "succeeded") {
        setError(
          "The requested view was not admitted. Showing the previous view; retry the filter.",
        );
        return;
      }
      if (!admitted.value || admitted.value.scopeKey !== scopeKey) {
        setAccessChanged(true);
        return;
      }
      if (
        (admitted.value.refreshAfter ?? 0) > readAt ||
        Date.now() - readAt > LEASE_EXPORT_TTL_MS
      ) {
        window.location.assign(target);
        return;
      }
      if (!fromHistory) window.history.pushState({}, "", target);
      setSelection({
        generation,
        state: parseRenewalDeskQueryV2(new URLSearchParams(search)),
        source: "explicit",
      });
    } finally {
      setRequested(null);
      window.dispatchEvent(new Event("pmi:desk-view-settled"));
    }
  }
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });
  useEffect(() => {
    const pop = () => {
      if (window.location.pathname === RENEWAL_DESK_ROUTE)
        void chooseRef.current(window.location.search.slice(1), true);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function click(event: MouseEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (
      !anchor ||
      anchor.target ||
      anchor.pathname !== RENEWAL_DESK_ROUTE ||
      !anchor.search
    )
      return;
    // Stop router navigation; the nested memory wrapper still records deliberate view intent.
    event.preventDefault();
    void choose(anchor.search.slice(1));
  }
  function submit(event: FormEvent<HTMLDivElement>) {
    const form = event.target as HTMLFormElement;
    if (
      form.tagName !== "FORM" ||
      form.getAttribute("action") !== RENEWAL_DESK_ROUTE ||
      form.method.toLowerCase() !== "get"
    )
      return;
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") params.append(key, value);
    });
    void choose(params.toString());
  }
  if (accessChanged)
    return (
      <div role="alert">
        Your access changed.{" "}
        <Button onClick={() => window.location.reload()}>Reload Renewals</Button>
      </div>
    );
  return (
    <div
      className="ui-stack"
      data-admitted-view={serializeRenewalDeskQueryV2(state)}
      onClickCapture={click}
      onSubmit={submit}
    >
      {requested !== null ? (
        <div role="status" data-operation-pending="true">
          <BusyIndicator decorative label="" />
          Applying requested view. The table still shows the previous completed selection.
        </div>
      ) : null}
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <RenewalDeskTable
        rows={result.items}
        totalLoaded={result.totalLoaded}
        totalInScope={result.totalInScope}
        state={state}
        role={role}
        shortcuts={shortcuts}
        partyOptions={partyOptions}
        sourceReadOk={view.readComplete && !view.dataCurrency.lastError}
        sourceReadComplete={view.readComplete}
        dependentStateComplete={dependentStateComplete}
        viewCounts={counts}
        sheetWritebackPaused={sheetWritebackPaused}
        viewMemory={
          viewMemory
            ? {
                ...viewMemory,
                source:
                  selection.generation === generation
                    ? (selection.source ?? viewMemory.source)
                    : viewMemory.source,
              }
            : undefined
        }
      />
    </div>
  );
}
