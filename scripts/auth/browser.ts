// S112 — the browser driver behind the canary sign-in. It re-establishes the app session on an
// origin by driving the app's own "Sign in with Google" control inside an enrolled persistent
// profile. The only automated action on a Google page is selecting the expected account tile; any
// password, code, challenge, or consent prompt is reported as a human step. Nothing here types a
// credential, reads a cookie, or copies a profile.

import { existsSync, mkdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";

import { classifyLocation, decideGoogleStep } from "./google-step";
import {
  acquireManagedProfileLease,
  ManagedProfileError,
  type ManagedProfileLease,
} from "../../lib/production-assurance/profile-lease.mjs";
import { resolveAttendedDisplay } from "./display.mjs";

export type SessionMethod =
  | "existing_session"
  | "google_session_reuse"
  | "human_completed";

export type SessionResult =
  | {
      readonly result: "signed_in";
      readonly origin: string;
      readonly role: string | null;
      readonly method: SessionMethod;
    }
  | {
      readonly result: "human_required";
      readonly origin: string;
      readonly url: string;
      readonly reason: string;
    }
  | {
      readonly result: "error";
      readonly origin: string;
      readonly error: string;
      readonly code?: string;
    };

export interface SessionEvent {
  readonly stage: string;
  readonly detail?: string;
}

export interface SessionOptions {
  readonly profile: string;
  readonly origin: string;
  readonly email: string;
  readonly executablePath: string;
  readonly headless: boolean;
  /** 0 = unattended: the first human prompt ends the attempt. > 0 = wait this long for a person. */
  readonly humanWaitMs: number;
  readonly stepTimeoutMs?: number;
  readonly expectedRole?: string;
  readonly profileWaitMs?: number;
  readonly onEvent?: (event: SessionEvent) => void;
  readonly platform?: NodeJS.Platform;
}

const DEFAULT_STEP_TIMEOUT_MS = 90_000;
const POLL_MS = 750;

/** Shared resolver also owns smoke and promotion browser selection. */
export { resolveBrowserExecutable as resolveHarnessBrowser } from "../lib/browser-executable.mjs";

/** Refuse a Windows browser with a POSIX profile path or the reverse; the pairing is proven, not assumed. */
export function assertBrowserProfilePairing(
  executablePath: string,
  profile: string,
  platform: NodeJS.Platform = process.platform,
): void {
  const windowsExecutable = /\.exe$/i.test(executablePath);
  const windowsProfile = /^[A-Za-z]:[\\/]/.test(profile);
  if (platform === "win32") {
    if (!windowsExecutable || !windowsProfile)
      throw new Error("browser_profile_pairing_invalid");
    return;
  }
  if (windowsExecutable || windowsProfile || !profile.startsWith("/")) {
    throw new Error("browser_profile_pairing_invalid");
  }
}

/** An absolute profile directory outside the repository; created only when `create` is set. */
export function validateProfilePath(
  profile: string,
  {
    create = false,
    repositoryRoot = process.cwd(),
  }: { create?: boolean; repositoryRoot?: string } = {},
): string {
  if (!profile || !isAbsolute(profile)) throw new Error("managed_profile_required");
  const resolved = resolve(profile);
  const fromRoot = relative(resolve(repositoryRoot), resolved);
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) {
    throw new Error("managed_profile_must_be_outside_repository");
  }
  if (!existsSync(resolved)) {
    if (!create) throw new Error("managed_profile_missing");
    mkdirSync(resolved, { recursive: true });
  } else if (!statSync(resolved).isDirectory()) {
    throw new Error("managed_profile_invalid");
  }
  return resolved;
}

export async function establishAppSession(
  options: SessionOptions,
): Promise<SessionResult> {
  const { origin, email, humanWaitMs } = options;
  const stepTimeoutMs = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const emit = (stage: string, detail?: string) => options.onEvent?.({ stage, detail });
  assertBrowserProfilePairing(options.executablePath, options.profile, options.platform);

  let context: BrowserContext | undefined;
  let lease: ManagedProfileLease | undefined;
  try {
    let launchEnv: NodeJS.ProcessEnv | undefined;
    if (!options.headless) {
      const display = await resolveAttendedDisplay();
      if (!display.ready)
        return { result: "error", origin, code: display.code, error: display.detail };
      launchEnv = display.env;
      emit("display", display.source);
    }
    lease = await acquireManagedProfileLease(options.profile, {
      label: options.headless ? "auth-session" : "auth-enrollment",
      waitMs: options.profileWaitMs ?? 15_000,
      onWait: (owner) =>
        emit(
          "profile_wait",
          owner?.label
            ? `owned by ${owner.label} (PID ${owner.caller_pid ?? owner.pid ?? "unknown"})`
            : "another PMI browser owner is active",
        ),
    });
    emit("launch", options.headless ? "headless" : "visible_wslg");
    context = await chromium.launchPersistentContext(options.profile, {
      executablePath: options.executablePath,
      headless: options.headless,
      timeout: Math.min(stepTimeoutMs, 30_000),
      ...(launchEnv ? { env: launchEnv } : {}),
      viewport: { width: 1280, height: 900 },
      args: ["--no-first-run", "--no-default-browser-check"],
    });
    const mainPage = context.pages()[0] ?? (await context.newPage());
    emit("open", `${origin}/sign-in`);
    await mainPage.goto(`${origin}/sign-in`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // A persisted Firebase user completes the session on its own; a live cookie redirects to `/`.
    await mainPage.waitForTimeout(2_000);
    if (classifyLocation(mainPage.url(), origin) === "app") {
      return await verifySession(
        mainPage,
        origin,
        "existing_session",
        email,
        options.expectedRole,
      );
    }

    emit("click", "Sign in with Google");
    await mainPage
      .getByRole("button", { name: "Sign in with Google" })
      .click({ timeout: 30_000 })
      .catch(() => undefined);

    const startedAt = Date.now();
    let humanDeadline: number | null = null;
    let accountTileClicked = false;
    let lastReason = "";

    for (;;) {
      if (classifyLocation(mainPage.url(), origin) === "app") {
        return await verifySession(
          mainPage,
          origin,
          humanDeadline ? "human_completed" : "google_session_reuse",
          email,
          options.expectedRole,
        );
      }
      const authPage = pickAuthPage(context, mainPage, origin);
      const url = authPage.url();
      const onGoogle = classifyLocation(url, origin) === "google";
      const tile = onGoogle ? await exactAccountTile(authPage, email) : null;
      const decision = decideGoogleStep({
        url,
        appOrigin: origin,
        exactAccountTileVisible: tile !== null,
        accountTileClicked,
        passwordOrChallengeVisible: onGoogle
          ? await passwordOrChallengeVisible(authPage)
          : false,
      });

      if (decision.action === "app") {
        return await verifySession(
          authPage,
          origin,
          humanDeadline ? "human_completed" : "google_session_reuse",
          email,
          options.expectedRole,
        );
      }
      if (decision.action === "click-account" && tile) {
        emit("select-account", email);
        await tile.click({ timeout: 5_000 }).catch(() => undefined);
        accountTileClicked = true;
      } else if (decision.action === "human") {
        lastReason = decision.reason;
        if (humanWaitMs <= 0) {
          return {
            result: "human_required",
            origin,
            url: stripQuery(url),
            reason: decision.reason,
          };
        }
        if (humanDeadline === null) {
          humanDeadline = Date.now() + humanWaitMs;
          emit("human", `${decision.reason}; complete it in the open window as ${email}`);
        }
      }

      const limit = humanDeadline ?? startedAt + stepTimeoutMs;
      if (Date.now() > limit) {
        return {
          result: "error",
          origin,
          error: humanDeadline
            ? `human_did_not_complete: ${lastReason || "sign-in not finished"} (${stripQuery(url)})`
            : `timeout at ${stripQuery(url)}`,
        };
      }
      await mainPage.waitForTimeout(POLL_MS);
    }
  } catch (error) {
    return {
      result: "error",
      origin,
      ...classifyBrowserFailure(error),
    };
  } finally {
    try {
      if (context) await closeAuthBrowser(context);
    } finally {
      await lease?.release();
    }
  }
}

export function classifyBrowserFailure(error: unknown): { code: string; error: string } {
  if (error instanceof ManagedProfileError)
    return { code: error.code, error: error.message };
  const message = error instanceof Error ? error.message : "";
  if (/ProcessSingleton|SingletonLock/.test(message))
    return {
      code: "profile_in_use",
      error:
        "The managed browser profile is already in use; no credential enrollment was attempted.",
    };
  if (
    /Missing X server|\$DISPLAY|failed to connect.*[Ww]ayland|[Xx]11.*display|[Xx] server|ozone_platform_x11/.test(
      message,
    )
  )
    return {
      code: "display_unavailable",
      error:
        "Chromium could not use the observed WSLg display. Restore the local WSLg desktop before attended sign-in; this does not establish expired credentials.",
    };
  if (/Timeout .*exceeded|timed out/i.test(message))
    return {
      code: "browser_timeout",
      error:
        "The browser exceeded its bounded launch or session check. No credential expiry or successful login is inferred.",
    };
  if (
    /error while loading shared libraries|Host system is missing dependencies/.test(
      message,
    )
  )
    return {
      code: "browser_runtime_unavailable",
      error:
        "The installed browser runtime is missing a required library; credentials were not replaced.",
    };
  return {
    code: "browser_session_error",
    error:
      "The browser session could not be verified. Check its display/profile status; this does not establish expired credentials.",
  };
}

async function closeAuthBrowser(context: BrowserContext): Promise<void> {
  const bounded = async (work: Promise<unknown>): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("browser_close_timeout")), 15_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  try {
    await bounded(context.close());
  } catch {
    const browser = context.browser();
    if (!browser)
      throw new ManagedProfileError(
        "browser_cleanup_incomplete",
        "The owned browser did not finish closing; wait for it before retrying.",
      );
    await bounded(browser.close()).catch(() => {
      throw new ManagedProfileError(
        "browser_cleanup_incomplete",
        "The owned browser did not finish closing; no unrelated browser was terminated.",
      );
    });
  }
}

function pickAuthPage(context: BrowserContext, mainPage: Page, origin: string): Page {
  const pages = context.pages().filter((page) => page !== mainPage && !page.isClosed());
  for (const page of pages.reverse()) {
    const location = classifyLocation(page.url(), origin);
    if (location === "google" || location === "auth-handler") return page;
  }
  return mainPage;
}

async function exactAccountTile(page: Page, email: string): Promise<Locator | null> {
  const locators = [
    page.locator(`[data-identifier="${cssEscape(email)}"]`),
    page.locator(`[data-email="${cssEscape(email)}"]`),
    page.getByText(email, { exact: true }),
  ];
  for (const locator of locators) {
    try {
      if ((await locator.count()) > 0) return locator.first();
    } catch {
      // The page may be navigating; try the next shape.
    }
  }
  return null;
}

async function passwordOrChallengeVisible(page: Page): Promise<boolean> {
  if (/\/challenge\//.test(page.url())) return true;
  const signals = await Promise.all([
    page
      .locator('input[type="password"]:visible')
      .count()
      .catch(() => 0),
    page
      .getByText("Enter your password")
      .count()
      .catch(() => 0),
  ]);
  return signals.some((count) => count > 0);
}

async function verifySession(
  page: Page,
  origin: string,
  method: SessionMethod,
  expectedEmail: string,
  expectedRole?: string,
): Promise<SessionResult> {
  const response = await page.request.get(`${origin}/api/auth/session`, {
    timeout: 30_000,
    maxRedirects: 0,
  });
  if (response.status() !== 204)
    return {
      result: "error",
      origin,
      code: "app_session_rejected",
      error: "The app did not accept this browser session.",
    };
  await page.goto(`${origin}/profile`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (classifyLocation(page.url(), origin) !== "app") {
    return {
      result: "error",
      origin,
      error: `session_not_established at ${stripQuery(page.url())}`,
    };
  }
  const role = await page
    .locator(".user-role")
    .first()
    .textContent({ timeout: 10_000 })
    .catch(() => null);
  const email = await page
    .locator("main > p")
    .first()
    .textContent({ timeout: 10_000 })
    .catch(() => null);
  if (email?.trim().toLowerCase() !== expectedEmail.toLowerCase())
    return {
      result: "error",
      origin,
      code: "wrong_identity",
      error:
        "The app session belongs to a different account; no account or credential was changed.",
    };
  if (expectedRole && role?.trim() !== expectedRole)
    return {
      result: "error",
      origin,
      code: "wrong_role",
      error:
        "The app session does not have its expected existing role; no role or claim was changed.",
    };
  return { result: "signed_in", origin, role: role?.trim() || null, method };
}

function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
