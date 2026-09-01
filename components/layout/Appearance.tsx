"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import { registerAppearanceClose } from "@/lib/ui/appearance-coordinator";
import {
  THEME_SETTINGS,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  parseThemeSetting,
  type ThemeSetting,
} from "@/lib/ui/theme";

const LABELS: Record<ThemeSetting, string> = {
  system: "Use device setting",
  light: "Light",
  dark: "Dark",
};

const THEME_SETTING_CHANGE_EVENT = "pmi:theme-setting-change";

export function Appearance() {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const radioRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const setting = useSyncExternalStore(
    subscribeToThemeSetting,
    readThemeSetting,
    readServerThemeSetting,
  );
  const controllerReady = useSyncExternalStore(
    subscribeToHydration,
    readHydrated,
    readNotHydrated,
  );

  useEffect(() => registerAppearanceClose(() => setIsOpen(false)), []);

  useEffect(() => {
    if (!controllerReady) return;
    const media = readDeviceTheme();
    applyResolvedTheme(document.documentElement, setting, media?.matches ?? false);
    if (setting !== "system" || !media) return;

    const onChange = (event: MediaQueryListEvent) => {
      applyResolvedTheme(document.documentElement, "system", event.matches);
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [controllerReady, setting]);

  useEffect(() => {
    if (!isOpen) return;
    radioRefs.current[THEME_SETTINGS.indexOf(setting)]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const onFocusIn = (event: globalThis.FocusEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [isOpen, setting]);

  function choose(next: ThemeSetting) {
    const media = readDeviceTheme();
    applyResolvedTheme(document.documentElement, next, media?.matches ?? false);
    window.dispatchEvent(new Event(THEME_SETTING_CHANGE_EVENT));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }

  function closeAndReturnFocus() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function onGroupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }

    const currentIndex = THEME_SETTINGS.indexOf(setting);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % THEME_SETTINGS.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + THEME_SETTINGS.length) % THEME_SETTINGS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = THEME_SETTINGS.length - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const next = THEME_SETTINGS[nextIndex];
    choose(next);
    radioRefs.current[nextIndex]?.focus();
  }

  function onPanelBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (
      next &&
      !panelRef.current?.contains(next) &&
      !triggerRef.current?.contains(next)
    ) {
      setIsOpen(false);
    }
  }

  return (
    <div className="appearance">
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className="appearance-trigger"
        data-ready={controllerReady ? "true" : "false"}
        disabled={!controllerReady}
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (!next) triggerRef.current?.focus();
        }}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className="appearance-icon">
          ◐
        </span>
        <span>Appearance: {LABELS[setting]}</span>
      </button>
      {isOpen ? (
        <div
          className="appearance-panel"
          id={panelId}
          onBlur={onPanelBlur}
          ref={panelRef}
        >
          <div
            aria-label="Appearance"
            className="appearance-options"
            onKeyDown={onGroupKeyDown}
            role="radiogroup"
          >
            {THEME_SETTINGS.map((option, index) => (
              <label className="appearance-option" key={option}>
                <input
                  checked={setting === option}
                  name={`${panelId}-setting`}
                  onChange={() => choose(option)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      choose(option);
                    }
                  }}
                  ref={(node) => {
                    radioRefs.current[index] = node;
                  }}
                  type="radio"
                  value={option}
                />
                <span>{LABELS[option]}</span>
              </label>
            ))}
          </div>
          {storageWarning ? (
            <p className="appearance-warning" role="status">
              This browser could not save Appearance. The current page still uses your
              choice; a future visit will use the device setting.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function readDeviceTheme() {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
}

function subscribeToThemeSetting(onStoreChange: () => void) {
  window.addEventListener(THEME_SETTING_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_SETTING_CHANGE_EVENT, onStoreChange);
}

function readThemeSetting() {
  return parseThemeSetting(document.documentElement.dataset.themeSetting);
}

function readServerThemeSetting(): ThemeSetting {
  return "system";
}

function subscribeToHydration() {
  return () => undefined;
}

function readHydrated() {
  return true;
}

function readNotHydrated() {
  return false;
}
