"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Icon } from "@/components/ui";

// S114: two separate, independent slide-out surfaces over the same projections the workspace
// renders. The lease-information panel holds the consolidated header facts; the process-guide panel
// holds the table of contents. Panel state is page-local: opening, closing or navigating never
// persists, records progress, calls a provider or discards the other panel's state or an edit.

type CloseReason = "button" | "escape" | "navigate";

function SlideOutPanel({
  children,
  closeLabel,
  id,
  mounted,
  onClose,
  onNavigate,
  open,
  side,
  title,
}: Readonly<{
  children: ReactNode;
  closeLabel: string;
  id: string;
  mounted: boolean;
  onClose: (reason: CloseReason) => void;
  onNavigate?: () => void;
  open: boolean;
  side: "start" | "end";
  title: string;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) headingRef.current?.focus({ preventScroll: true });
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    // An open in-panel help layer owns its own Escape; the panel closes on the next press.
    if (event.currentTarget.querySelector(".info-tip-panel")) return;
    event.preventDefault();
    onClose("escape");
  }

  function onClick(event: MouseEvent<HTMLElement>) {
    if (!onNavigate) return;
    const anchor =
      event.target instanceof Element
        ? event.target.closest('a[href^="#renewal-"]')
        : null;
    if (anchor) onNavigate();
  }

  return (
    <aside
      aria-label={title}
      className="renewal-slide-panel"
      data-open={open ? "true" : "false"}
      data-side={side}
      hidden={!open}
      id={id}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="renewal-slide-panel-header">
        <h2 className="renewal-slide-panel-title" ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        <button
          aria-label={closeLabel}
          className="renewal-slide-panel-close"
          onClick={() => onClose("button")}
          type="button"
        >
          <Icon name="close" size={18} />
          <span>Close</span>
        </button>
      </div>
      <div className="renewal-slide-panel-body">{mounted ? children : null}</div>
    </aside>
  );
}

export function RenewalWorkspaceSidebars({
  children,
  identity,
  leaseInformation,
  processGuide = null,
  sectionNavigation = null,
}: Readonly<{
  children: ReactNode;
  /** Compact lease identity that stays visible while the operator is lower on the page. */
  identity: ReactNode;
  /** The relocated consolidated header facts, rendered by the server from owning projections. */
  leaseInformation: ReactNode;
  /** The process table of contents; absent on an inspection-only lease. */
  processGuide?: ReactNode;
  /** The existing five-section navigation; absent on an inspection-only lease. */
  sectionNavigation?: ReactNode;
}>) {
  const instanceId = useId();
  const informationId = `${instanceId}-lease-information`;
  const guideId = `${instanceId}-process-guide`;
  const [informationOpen, setInformationOpen] = useState(false);
  const [informationMounted, setInformationMounted] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideMounted, setGuideMounted] = useState(false);
  const informationToggleRef = useRef<HTMLButtonElement>(null);
  const guideToggleRef = useRef<HTMLButtonElement>(null);

  function toggleInformation() {
    setInformationMounted(true);
    setInformationOpen((open) => !open);
  }
  function closeInformation(reason: CloseReason) {
    setInformationOpen(false);
    if (reason !== "navigate") informationToggleRef.current?.focus();
  }
  function toggleGuide() {
    setGuideMounted(true);
    setGuideOpen((open) => !open);
  }
  function closeGuide(reason: CloseReason) {
    setGuideOpen(false);
    if (reason !== "navigate") guideToggleRef.current?.focus();
  }

  return (
    <div className="renewal-workspace-shell">
      <div className="renewal-workspace-toolbar">
        <div className="renewal-workspace-toolbar-row">
          <p className="renewal-workspace-identity">{identity}</p>
          <div
            aria-label="Lease workspace panels"
            className="renewal-workspace-toggles"
            role="group"
          >
            <button
              aria-controls={informationId}
              aria-expanded={informationOpen}
              className="secondary-button renewal-workspace-toggle"
              onClick={toggleInformation}
              ref={informationToggleRef}
              type="button"
            >
              Lease information
            </button>
            {processGuide ? (
              <button
                aria-controls={guideId}
                aria-expanded={guideOpen}
                className="secondary-button renewal-workspace-toggle"
                onClick={toggleGuide}
                ref={guideToggleRef}
                type="button"
              >
                Process guide
              </button>
            ) : null}
          </div>
        </div>
        {sectionNavigation}
      </div>
      <SlideOutPanel
        closeLabel="Close lease information"
        id={informationId}
        mounted={informationMounted}
        onClose={closeInformation}
        open={informationOpen}
        side="end"
        title="Lease information"
      >
        {leaseInformation}
      </SlideOutPanel>
      {processGuide ? (
        <SlideOutPanel
          closeLabel="Close process guide"
          id={guideId}
          mounted={guideMounted}
          onClose={closeGuide}
          onNavigate={() => closeGuide("navigate")}
          open={guideOpen}
          side="start"
          title="Process guide"
        >
          {processGuide}
        </SlideOutPanel>
      ) : null}
      <div className="renewal-workspace-body ui-stack">{children}</div>
    </div>
  );
}
