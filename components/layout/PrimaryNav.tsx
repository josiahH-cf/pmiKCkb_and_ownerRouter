"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { Icon } from "@/components/ui/Icon";
import {
  isPrimaryNavigationItemActive,
  type ResolvedPrimaryNavigationGroup,
  type ResolvedPrimaryNavigationItem,
} from "@/lib/navigation/primary-navigation-contract";
import {
  activateTransientLayer,
  dismissTransientLayerDescendants,
  registerTransientLayer,
} from "@/lib/ui/transient-layer";

const HOVER_OPEN_DELAY_MS = 350;
const HOVER_CLOSE_DELAY_MS = 250;
const NARROW_NAV_QUERY = "(max-width: 760px)";
const FINE_HOVER_QUERY = "(hover: hover) and (pointer: fine)";

type TimerRef = { current: ReturnType<typeof setTimeout> | null };
type CloseReason =
  | "breakpoint"
  | "coordinator"
  | "escape"
  | "focus-out"
  | "outside"
  | "route"
  | "selection"
  | "toggle";

export function PrimaryNav({
  groups,
}: Readonly<{ groups: readonly ResolvedPrimaryNavigationGroup[] }>) {
  const pathname = usePathname();
  const instanceId = useId();
  const layerId = `navigation:${instanceId}`;
  const navRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const desktopTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const desktopGroupRefs = useRef(new Map<string, HTMLLIElement>());
  const mobileTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const mobileGroupRefs = useRef(new Map<string, HTMLLIElement>());
  const pointerInsideGroups = useRef(new Set<string>());
  const hoverSuppressedGroups = useRef(new Set<string>());
  const hoverOpenTimer: TimerRef = useRef(null);
  const hoverCloseTimer: TimerRef = useRef(null);
  const [openDesktopGroup, setOpenDesktopGroupState] = useState<string | null>(null);
  const openDesktopGroupRef = useRef<string | null>(null);
  const [mobileOpen, setMobileOpenState] = useState(false);
  const mobileOpenRef = useRef(false);
  const [openMobileGroup, setOpenMobileGroupState] = useState<string | null>(null);
  const openMobileGroupRef = useRef<string | null>(null);
  const isNarrow = useSyncExternalStore(
    subscribeToNarrowNavigation,
    readNarrowNavigation,
    readWideNavigation,
  );

  const currentGroupId =
    groups.find((group) =>
      group.items.some((item) => isPrimaryNavigationItemActive(pathname, item)),
    )?.id ?? null;

  const setOpenDesktopGroup = useCallback((groupId: string | null) => {
    openDesktopGroupRef.current = groupId;
    setOpenDesktopGroupState(groupId);
  }, []);

  const setMobileOpen = useCallback((open: boolean) => {
    mobileOpenRef.current = open;
    setMobileOpenState(open);
  }, []);

  const setOpenMobileGroup = useCallback((groupId: string | null) => {
    openMobileGroupRef.current = groupId;
    setOpenMobileGroupState(groupId);
  }, []);

  const clearIntentTimers = useCallback(() => {
    clearTimer(hoverOpenTimer);
    clearTimer(hoverCloseTimer);
  }, []);

  const closeAll = useCallback(
    (reason: CloseReason) => {
      const openGroup = openDesktopGroupRef.current;
      if (
        openGroup &&
        reason !== "breakpoint" &&
        pointerInsideGroups.current.has(openGroup)
      ) {
        hoverSuppressedGroups.current.add(openGroup);
      }
      clearIntentTimers();
      dismissTransientLayerDescendants(layerId);
      setOpenDesktopGroup(null);
      setMobileOpen(false);
      setOpenMobileGroup(null);
    },
    [clearIntentTimers, layerId, setMobileOpen, setOpenDesktopGroup, setOpenMobileGroup],
  );

  useEffect(
    () =>
      registerTransientLayer({
        id: layerId,
        family: "navigation",
        close: () => closeAll("coordinator"),
      }),
    [closeAll, layerId],
  );

  useEffect(() => () => clearIntentTimers(), [clearIntentTimers]);

  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      closeAll("route");
    }
  }, [closeAll, pathname]);

  const previousNarrow = useRef(isNarrow);
  useEffect(() => {
    if (previousNarrow.current !== isNarrow) {
      previousNarrow.current = isNarrow;
      hoverSuppressedGroups.current.clear();
      pointerInsideGroups.current.clear();
      closeAll("breakpoint");
    }
  }, [closeAll, isNarrow]);

  const hasOpenLayer = openDesktopGroup !== null || mobileOpen;
  useEffect(() => {
    if (!hasOpenLayer) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !navRef.current?.contains(target)) closeAll("outside");
    };
    const onFocusIn = (event: globalThis.FocusEvent) => {
      const target = event.target as Node | null;
      if (target && !navRef.current?.contains(target)) closeAll("focus-out");
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [closeAll, hasOpenLayer]);

  function openDesktop(groupId: string, focusEdge?: "first" | "last") {
    const previous = openDesktopGroupRef.current;
    if (previous && previous !== groupId && pointerInsideGroups.current.has(previous)) {
      hoverSuppressedGroups.current.add(previous);
    }
    clearIntentTimers();
    activateTransientLayer({ id: layerId, family: "navigation" });
    setMobileOpen(false);
    setOpenMobileGroup(null);
    setOpenDesktopGroup(groupId);
    if (focusEdge) queueMicrotask(() => focusDesktopEdge(groupId, focusEdge));
  }

  function closeDesktop(groupId: string, reason: CloseReason, returnFocus = false) {
    if (openDesktopGroupRef.current !== groupId) return;
    if (pointerInsideGroups.current.has(groupId)) {
      hoverSuppressedGroups.current.add(groupId);
    }
    clearIntentTimers();
    dismissTransientLayerDescendants(layerId);
    setOpenDesktopGroup(null);
    if (returnFocus) desktopTriggerRefs.current.get(groupId)?.focus();
    void reason;
  }

  function onDesktopPointerEnter(event: PointerEvent<HTMLLIElement>, groupId: string) {
    pointerInsideGroups.current.add(groupId);
    clearTimer(hoverCloseTimer);
    if (
      openDesktopGroupRef.current === groupId ||
      hoverSuppressedGroups.current.has(groupId) ||
      event.pointerType === "touch" ||
      !supportsFineHover()
    ) {
      return;
    }
    clearTimer(hoverOpenTimer);
    hoverOpenTimer.current = setTimeout(() => {
      hoverOpenTimer.current = null;
      if (
        pointerInsideGroups.current.has(groupId) &&
        !hoverSuppressedGroups.current.has(groupId)
      ) {
        openDesktop(groupId);
      }
    }, HOVER_OPEN_DELAY_MS);
  }

  function onDesktopPointerLeave(groupId: string) {
    pointerInsideGroups.current.delete(groupId);
    hoverSuppressedGroups.current.delete(groupId);
    clearTimer(hoverOpenTimer);
    if (openDesktopGroupRef.current !== groupId) return;
    clearTimer(hoverCloseTimer);
    hoverCloseTimer.current = setTimeout(() => {
      hoverCloseTimer.current = null;
      const groupElement = desktopGroupRefs.current.get(groupId);
      if (groupElement?.contains(document.activeElement)) return;
      dismissTransientLayerDescendants(layerId);
      setOpenDesktopGroup(null);
    }, HOVER_CLOSE_DELAY_MS);
  }

  function onDesktopBlur(event: FocusEvent<HTMLLIElement>, groupId: string) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    closeDesktop(groupId, "focus-out");
  }

  function onDesktopKeyDown(
    event: KeyboardEvent<HTMLLIElement>,
    group: ResolvedPrimaryNavigationGroup,
  ) {
    if (event.key === "Escape" && openDesktopGroupRef.current === group.id) {
      event.preventDefault();
      closeDesktop(group.id, "escape", true);
      return;
    }
    if (event.target !== desktopTriggerRefs.current.get(group.id)) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openDesktop(group.id, "first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openDesktop(group.id, "last");
    }
  }

  function focusDesktopEdge(groupId: string, edge: "first" | "last") {
    const links = desktopGroupRefs.current
      .get(groupId)
      ?.querySelectorAll<HTMLAnchorElement>("a.primary-nav-item");
    if (!links?.length) return;
    links[edge === "first" ? 0 : links.length - 1]?.focus();
  }

  function toggleMobileMenu() {
    if (mobileOpenRef.current) {
      closeAll("toggle");
      return;
    }
    activateTransientLayer({ id: layerId, family: "navigation" });
    setOpenDesktopGroup(null);
    setMobileOpen(true);
    setOpenMobileGroup(currentGroupId ?? groups[0]?.id ?? null);
  }

  function onMobileRegionKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    const expandedGroupId = openMobileGroupRef.current;
    const expandedGroup = expandedGroupId
      ? mobileGroupRefs.current.get(expandedGroupId)
      : undefined;
    if (expandedGroupId && expandedGroup?.contains(event.target as Node)) {
      setOpenMobileGroup(null);
      mobileTriggerRefs.current.get(expandedGroupId)?.focus();
      return;
    }
    closeAll("escape");
    menuTriggerRef.current?.focus();
  }

  function selectDestination() {
    closeAll("selection");
  }

  return (
    <div className="primary-nav-root" ref={navRef}>
      {isNarrow ? (
        <div className="primary-nav-mobile">
          <button
            aria-controls={`${instanceId}-mobile-region`}
            aria-expanded={mobileOpen}
            className="primary-nav-menu-trigger"
            onClick={toggleMobileMenu}
            onKeyDown={(event) => {
              if (event.key === "Escape" && mobileOpenRef.current) {
                event.preventDefault();
                closeAll("escape");
                menuTriggerRef.current?.focus();
              }
            }}
            ref={menuTriggerRef}
            type="button"
          >
            <span>Menu</span>
            <Icon name="chevron-right" size={18} />
          </button>
          <div
            aria-label="Primary navigation"
            className="primary-nav-mobile-region"
            hidden={!mobileOpen}
            id={`${instanceId}-mobile-region`}
            onKeyDown={onMobileRegionKeyDown}
            role="region"
          >
            <ul className="primary-nav-mobile-groups">
              {groups.map((group) => {
                const expanded = openMobileGroup === group.id;
                const current = group.id === currentGroupId;
                const panelId = `${instanceId}-${group.id}-mobile-panel`;
                return (
                  <li
                    className="primary-nav-mobile-group"
                    data-current={current || undefined}
                    key={group.id}
                    ref={(node) => {
                      setMapRef(mobileGroupRefs.current, group.id, node);
                    }}
                  >
                    <button
                      aria-controls={panelId}
                      aria-expanded={expanded}
                      className="primary-nav-mobile-group-trigger"
                      onClick={() => setOpenMobileGroup(expanded ? null : group.id)}
                      ref={(node) => {
                        setMapRef(mobileTriggerRefs.current, group.id, node);
                      }}
                      type="button"
                    >
                      <span>{group.label}</span>
                      {current ? (
                        <span className="sr-only">Contains current page</span>
                      ) : null}
                      <Icon name="chevron-right" size={18} />
                    </button>
                    <div hidden={!expanded} id={panelId}>
                      <NavigationItemList
                        group={group}
                        idPrefix={`${instanceId}-${group.id}-mobile`}
                        onSelect={selectDestination}
                        pathname={pathname}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <ul className="primary-nav-desktop-groups">
          {groups.map((group) => {
            const expanded = openDesktopGroup === group.id;
            const current = group.id === currentGroupId;
            const panelId = `${instanceId}-${group.id}-desktop-panel`;
            return (
              <li
                className="primary-nav-desktop-group"
                data-current={current || undefined}
                data-group={group.id}
                key={group.id}
                onBlur={(event) => onDesktopBlur(event, group.id)}
                onKeyDown={(event) => onDesktopKeyDown(event, group)}
                onPointerEnter={(event) => onDesktopPointerEnter(event, group.id)}
                onPointerLeave={() => onDesktopPointerLeave(group.id)}
                ref={(node) => {
                  setMapRef(desktopGroupRefs.current, group.id, node);
                }}
              >
                <button
                  aria-controls={panelId}
                  aria-expanded={expanded}
                  className="primary-nav-group-trigger"
                  onClick={() => {
                    if (expanded) closeDesktop(group.id, "toggle", true);
                    else openDesktop(group.id);
                  }}
                  ref={(node) => {
                    setMapRef(desktopTriggerRefs.current, group.id, node);
                  }}
                  type="button"
                >
                  <span>{group.label}</span>
                  {current ? (
                    <span className="sr-only">Contains current page</span>
                  ) : null}
                  <Icon name="chevron-right" size={18} />
                </button>
                <div className="primary-nav-panel" hidden={!expanded} id={panelId}>
                  <NavigationItemList
                    group={group}
                    idPrefix={`${instanceId}-${group.id}-desktop`}
                    onSelect={selectDestination}
                    pathname={pathname}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NavigationItemList({
  group,
  idPrefix,
  onSelect,
  pathname,
}: Readonly<{
  group: ResolvedPrimaryNavigationGroup;
  idPrefix: string;
  onSelect: () => void;
  pathname: string | null;
}>) {
  return (
    <ul className="primary-nav-items">
      {group.items.map((item) => (
        <NavigationItem
          group={group}
          idPrefix={idPrefix}
          item={item}
          key={item.id}
          onSelect={onSelect}
          pathname={pathname}
        />
      ))}
    </ul>
  );
}

function NavigationItem({
  group,
  idPrefix,
  item,
  onSelect,
  pathname,
}: Readonly<{
  group: ResolvedPrimaryNavigationGroup;
  idPrefix: string;
  item: ResolvedPrimaryNavigationItem;
  onSelect: () => void;
  pathname: string | null;
}>) {
  const titleId = `${idPrefix}-${item.id}-title`;
  const descriptionId = `${idPrefix}-${item.id}-description`;
  const active = isPrimaryNavigationItemActive(pathname, item);
  return (
    <li>
      <Link
        aria-current={active ? "page" : undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="primary-nav-item"
        data-tone={group.tone}
        href={item.href}
        onClick={onSelect}
      >
        <span aria-hidden="true" className="primary-nav-item-icon">
          <Icon name={item.icon} size={22} />
        </span>
        <span className="primary-nav-item-copy">
          <span className="primary-nav-item-title" id={titleId}>
            <span>{item.label}</span>
            {item.badge ? (
              <span aria-hidden="true" className="primary-nav-item-badge">
                {item.badge.value}
              </span>
            ) : null}
          </span>
          <span className="primary-nav-item-description" id={descriptionId}>
            {item.description}
            {item.badge ? <span className="sr-only"> {item.badge.label}.</span> : null}
          </span>
        </span>
        <span aria-hidden="true" className="primary-nav-item-direction">
          <Icon name="chevron-right" size={18} />
        </span>
      </Link>
    </li>
  );
}

function setMapRef<T>(map: Map<string, T>, key: string, value: T | null) {
  if (value) map.set(key, value);
  else map.delete(key);
}

function clearTimer(ref: TimerRef) {
  if (ref.current !== null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

function supportsFineHover() {
  return (
    typeof window.matchMedia === "function" && window.matchMedia(FINE_HOVER_QUERY).matches
  );
}

function subscribeToNarrowNavigation(onStoreChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(NARROW_NAV_QUERY);
  const listener = () => onStoreChange();
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  media.addListener(listener);
  return () => media.removeListener(listener);
}

function readNarrowNavigation() {
  return (
    typeof window.matchMedia === "function" && window.matchMedia(NARROW_NAV_QUERY).matches
  );
}

function readWideNavigation() {
  return false;
}
