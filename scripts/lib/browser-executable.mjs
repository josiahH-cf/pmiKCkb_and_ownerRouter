import { accessSync, constants, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** One resolver for enrollment, smokes and assurance; Linux never launches a Windows executable. */
export function resolveBrowserExecutable(
  env = process.env,
  platform = process.platform,
  {
    exists = existsSync,
    list = readdirSync,
    executable = (path) => {
      try {
        accessSync(path, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
    home = homedir(),
  } = {},
) {
  const explicit =
    env.PLAYWRIGHT_CHROME_PATH?.trim() || env.DESK_BROWSER_EXECUTABLE?.trim();
  if (
    env.PLAYWRIGHT_CHROME_PATH?.trim() &&
    env.DESK_BROWSER_EXECUTABLE?.trim() &&
    env.PLAYWRIGHT_CHROME_PATH.trim() !== env.DESK_BROWSER_EXECUTABLE.trim()
  ) {
    throw new Error("browser_override_conflict");
  }
  if (explicit) {
    if (platform === "linux" && /\.exe$/i.test(explicit))
      throw new Error("browser_platform_mismatch");
    if (!executable(explicit)) throw new Error("managed_browser_unavailable");
    return explicit;
  }
  const root =
    env.PLAYWRIGHT_BROWSERS_PATH?.trim() || join(home, ".cache", "ms-playwright");
  const installed = exists(root)
    ? list(root)
        .filter((name) => /^chromium-\d+$/.test(name))
        .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))
        .flatMap((name) => [
          join(root, name, "chrome-linux64", "chrome"),
          join(root, name, "chrome-linux", "chrome"),
        ])
    : [];
  const candidates =
    platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          ...installed,
        ];
  const result = candidates.find(executable);
  if (!result) throw new Error("managed_browser_unavailable");
  return result;
}
