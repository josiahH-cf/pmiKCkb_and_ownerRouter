export const THEME_STORAGE_KEY = "pmi.ui.theme.v1";

export const THEME_SETTINGS = ["system", "light", "dark"] as const;
export type ThemeSetting = (typeof THEME_SETTINGS)[number];
export type ResolvedTheme = Exclude<ThemeSetting, "system">;

export function parseThemeSetting(value: string | null | undefined): ThemeSetting {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(
  setting: ThemeSetting,
  devicePrefersDark: boolean,
): ResolvedTheme {
  return setting === "system" ? (devicePrefersDark ? "dark" : "light") : setting;
}

export function applyResolvedTheme(
  root: HTMLElement,
  setting: ThemeSetting,
  devicePrefersDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(setting, devicePrefersDark);
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-setting", setting);
  root.style.colorScheme = resolved;
  return resolved;
}

// Constant, server-data-free bootstrap. It deliberately performs no fetch, identity lookup, or
// cookie access so it can run synchronously in the root head before the first paint.
export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  const key = "${THEME_STORAGE_KEY}";
  let setting = "system";
  try {
    const saved = window.localStorage.getItem(key);
    if (saved === "system" || saved === "light" || saved === "dark") setting = saved;
  } catch {}
  const deviceDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = setting === "system" ? (deviceDark ? "dark" : "light") : setting;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-setting", setting);
  root.style.colorScheme = theme;
})();`;
