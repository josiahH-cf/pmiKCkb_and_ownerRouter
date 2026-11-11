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

import type { FinishUpPreparation } from "@/lib/lease-renewal/finish-up-preparation";
import type { OfferChargesPriority } from "@/lib/lease-renewal/offer-charges-priority";
import type { NowCardSlot, RenewalPathStepId } from "@/lib/lease-renewal/renewal-path";
import type { RenewalPreparation } from "@/lib/lease-renewal/renewal-preparation";

export interface NowCardPrimary {
  readonly label: string;
  readonly run: (trigger: HTMLButtonElement) => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  /** Why the action is not available yet, shown beside it. */
  readonly reason?: string | null;
}

/**
 * S265 into S269: the first required tenant resource the exact offer content still needs, with
 * its exact Connections entry. The message editor gives it from the one inclusion projection.
 */
export interface NowCardResourceLead {
  /** The exact resource, as its readiness fix names it ("Shared resource link: ..."). */
  readonly label: string;
  /** Its one Connections entry (`/connections#renewal-resource-entry-<id>`). */
  readonly href: string;
  /** The problem, with the Admin handoff for a role that does not maintain the links. */
  readonly reason: string;
  /** False while an applicable transition decision is still open (the review stays held). */
  readonly transitionsReady: boolean;
}

interface NowCardContextValue {
  /** The slot elements the shown Now card rendered, keyed by step and slot. */
  readonly slots: Readonly<Record<string, HTMLElement | null>>;
  /** The one ref callback every slot element takes; the element names its key (nowSlotKey). */
  readonly slotRef: (element: HTMLElement | null) => void | (() => void);
  readonly primaries: Readonly<Partial<Record<RenewalPathStepId, NowCardPrimary>>>;
  readonly setPrimary: (step: RenewalPathStepId, primary: NowCardPrimary | null) => void;
  readonly resourceLeads: Readonly<
    Partial<Record<RenewalPathStepId, NowCardResourceLead>>
  >;
  readonly setResourceLead: (
    step: RenewalPathStepId,
    lead: NowCardResourceLead | null,
  ) => void;
  /** The one preparation projection the lease page was given (ARCH-S249-1). */
  readonly preparation: RenewalPreparation | null;
  /** R-S249-14: Finish up's assembled source update previews; null where not assembled. */
  readonly finishUp: FinishUpPreparation | null;
  /**
   * S264 with S269: the tenant offer's first unresolved charge row or transition choice, given by
   * the one Review offer charges editor for the Guided priority; null when nothing is open.
   */
  readonly offerCharges: OfferChargesPriority | null;
  readonly setOfferCharges: (value: OfferChargesPriority | null) => void;
}

const Context = createContext<NowCardContextValue | null>(null);

export function useRenewalNowCard() {
  return useContext(Context);
}

export const nowSlotKey = (step: RenewalPathStepId, slot: NowCardSlot) =>
  `${step}:${slot}`;

export function RenewalNowCardProvider({
  preparation,
  finishUp = null,
  children,
}: Readonly<{
  preparation: RenewalPreparation | null;
  finishUp?: FinishUpPreparation | null;
  children: ReactNode;
}>) {
  const [slots, setSlots] = useState<Record<string, HTMLElement | null>>({});
  const [primaries, setPrimaries] = useState<
    Partial<Record<RenewalPathStepId, NowCardPrimary>>
  >({});
  const [offerCharges, setOfferChargesState] = useState<OfferChargesPriority | null>(
    null,
  );
  const setOfferCharges = useCallback(
    (value: OfferChargesPriority | null) =>
      setOfferChargesState((previous) =>
        previous?.target === value?.target &&
        previous?.transitionsReady === value?.transitionsReady
          ? previous
          : value,
      ),
    [],
  );
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
  const [resourceLeads, setResourceLeads] = useState<
    Partial<Record<RenewalPathStepId, NowCardResourceLead>>
  >({});
  const setResourceLead = useCallback(
    (step: RenewalPathStepId, lead: NowCardResourceLead | null) =>
      setResourceLeads((previous) => {
        const prior = previous[step];
        if (!lead) {
          if (!prior) return previous;
          const next = { ...previous };
          delete next[step];
          return next;
        }
        if (
          prior &&
          prior.label === lead.label &&
          prior.href === lead.href &&
          prior.reason === lead.reason &&
          prior.transitionsReady === lead.transitionsReady
        )
          return previous;
        return { ...previous, [step]: lead };
      }),
    [],
  );
  const value = useMemo(
    () => ({
      slots,
      slotRef,
      primaries,
      setPrimary,
      resourceLeads,
      setResourceLead,
      preparation,
      finishUp,
      offerCharges,
      setOfferCharges,
    }),
    [
      slots,
      slotRef,
      primaries,
      setPrimary,
      resourceLeads,
      setResourceLead,
      preparation,
      finishUp,
      offerCharges,
      setOfferCharges,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
