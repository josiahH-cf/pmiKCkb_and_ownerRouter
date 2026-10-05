"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type CSSProperties,
} from "react";

import { Icon } from "@/components/ui";
import {
  WorkspaceResizer,
  useWorkspacePanelSize,
} from "@/components/ui/WorkspaceResizer";
import { PersonalViewStatus } from "@/components/layout/PersonalViewProvider";
import { useRenewalFocusView } from "./RenewalFocusViewContext";

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
    if (event.key !== "Escape" || event.defaultPrevented) return;
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
  viewSwitch = null,
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
  /** S143: the lease-level Full view / Focus view switch, shown in both views. */
  viewSwitch?: ReactNode;
}>) {
  const instanceId = useId();
  const panelSize = useWorkspacePanelSize("renewals");
  const informationId = `${instanceId}-lease-information`;
  const guideId = `${instanceId}-process-guide`;
  const [informationOpen, setInformationOpen] = useState(false);
  const taskScroll = useRef(0);
  const [informationMounted, setInformationMounted] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideMounted, setGuideMounted] = useState(false);
  const informationToggleRef = useRef<HTMLButtonElement>(null);
  const guideToggleRef = useRef<HTMLButtonElement>(null);
  // S143: Focus view shows one task, so the section navigation and the process guide step aside
  // until Full view returns, with their own state intact.
  const focusView = useRenewalFocusView()?.view === "focus";
  // S152: links and the section navigation land their target below this sticky toolbar. Its
  // height varies with wrapping, so the measured height feeds the scroll margin.
  const shellRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = shellRef.current;
    const toolbar = toolbarRef.current;
    if (!shell || !toolbar) return;
    const apply = () =>
      shell.style.setProperty(
        "--renewal-sticky-offset",
        `${Math.ceil(toolbar.getBoundingClientRect().height) + 12}px`,
      );
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  function toggleInformation() {
    if (informationOpen) {
      closeInformation("button");
      return;
    }
    if (!informationOpen) taskScroll.current = window.scrollY;
    setInformationMounted(true);
    setInformationOpen((open) => !open);
  }
  function closeInformation(reason: CloseReason) {
    setInformationOpen(false);
    if (reason !== "navigate") {
      informationToggleRef.current?.focus({ preventScroll: true });
      if (window.innerWidth < 1100)
        requestAnimationFrame(() =>
          window.scrollTo({ top: taskScroll.current, behavior: "instant" }),
        );
    }
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
    <div
      className="renewal-workspace-shell"
      data-information-open={informationOpen ? "true" : "false"}
      ref={shellRef}
      style={{ "--inspector-width": `${panelSize.width}px` } as CSSProperties}
    >
      <div className="renewal-workspace-toolbar" ref={toolbarRef}>
        <div className="renewal-workspace-toolbar-row">
          <p className="renewal-workspace-identity">{identity}</p>
          {viewSwitch}
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
            {processGuide && !focusView ? (
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
        {focusView ? null : sectionNavigation}
      </div>
      <div className="renewal-workspace-body ui-stack">{children}</div>
      {informationOpen ? (
        <WorkspaceResizer
          label="Resize lease information"
          value={panelSize.width}
          onChange={panelSize.change}
        />
      ) : null}
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
        <PersonalViewStatus surface="renewals" />
      </SlideOutPanel>
      {processGuide ? (
        <SlideOutPanel
          closeLabel="Close process guide"
          id={guideId}
          mounted={guideMounted}
          onClose={closeGuide}
          onNavigate={() => closeGuide("navigate")}
          open={guideOpen && !focusView}
          side="start"
          title="Process guide"
        >
          {processGuide}
        </SlideOutPanel>
      ) : null}
    </div>
  );
}
