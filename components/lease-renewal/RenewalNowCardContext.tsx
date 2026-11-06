"use client";

// S249: the Now card's named slots (S247 left them in renewal-path.ts) and the one primary action
// a slot filler may give its step. The Guided view's Now card registers each slot element it
// renders; the lease's one message editor (RenewalMessagePreparation) fills "message-preview" and
// "review-and-send" for the step that sends its audience, so the preview, Send, Schedule, the
// Gmail draft and Copy all read the one message record the editor holds. Nothing here saves,
// sends or reads a source.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { NowCardSlot, RenewalPathStepId } from "@/lib/lease-renewal/renewal-path";
import type { RenewalPreparation } from "@/lib/lease-renewal/renewal-preparation";

export interface NowCardPrimary {
  readonly label: string;
  readonly run: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  /** Why the action is not available yet, shown beside it. */
  readonly reason?: string | null;
}

interface NowCardContextValue {
  /** The slot elements the shown Now card rendered, keyed by step and slot. */
  readonly slots: Readonly<Record<string, HTMLElement | null>>;
  /** The one ref callback every slot element takes; the element names its key (nowSlotKey). */
  readonly slotRef: (element: HTMLElement | null) => void | (() => void);
  readonly primaries: Readonly<Partial<Record<RenewalPathStepId, NowCardPrimary>>>;
  readonly setPrimary: (step: RenewalPathStepId, primary: NowCardPrimary | null) => void;
  /** The one preparation projection the lease page was given (ARCH-S249-1). */
  readonly preparation: RenewalPreparation | null;
}

const Context = createContext<NowCardContextValue | null>(null);

export function useRenewalNowCard() {
  return useContext(Context);
}

export const nowSlotKey = (step: RenewalPathStepId, slot: NowCardSlot) =>
  `${step}:${slot}`;

export function RenewalNowCardProvider({
  preparation,
  children,
}: Readonly<{ preparation: RenewalPreparation | null; children: ReactNode }>) {
  const [slots, setSlots] = useState<Record<string, HTMLElement | null>>({});
  const [primaries, setPrimaries] = useState<
    Partial<Record<RenewalPathStepId, NowCardPrimary>>
  >({});
  // One stable ref callback for every slot element; the element names its own key, and the
  // cleanup React 19 runs on unmount clears it.
  const slotRef = useCallback((element: HTMLElement | null) => {
    const key = element?.dataset.renewalNowSlotKey;
    if (!element || !key) return;
    setSlots((previous) =>
      previous[key] === element ? previous : { ...previous, [key]: element },
    );
    return () =>
      setSlots((previous) => {
        if (previous[key] !== element) return previous;
        const next = { ...previous };
        delete next[key];
        return next;
      });
  }, []);
  const setPrimary = useCallback(
    (step: RenewalPathStepId, primary: NowCardPrimary | null) =>
      setPrimaries((previous) => {
        if (!primary) {
          if (!(step in previous)) return previous;
          const next = { ...previous };
          delete next[step];
          return next;
        }
        const prior = previous[step];
        if (
          prior &&
          prior.label === primary.label &&
          prior.disabled === primary.disabled &&
          prior.busy === primary.busy &&
          prior.reason === primary.reason &&
          prior.run === primary.run
        )
          return previous;
        return { ...previous, [step]: primary };
      }),
    [],
  );
  const value = useMemo(
    () => ({ slots, slotRef, primaries, setPrimary, preparation }),
    [slots, slotRef, primaries, setPrimary, preparation],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
