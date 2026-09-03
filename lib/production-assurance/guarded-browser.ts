import { isCanaryRequestAllowed } from "./browser-policy";

export const GUARDED_BROWSER_BACKGROUND_ARGS = Object.freeze([
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--no-default-browser-check",
  "--no-first-run",
] as const);

export interface GuardedBrowserRequest {
  method(): string;
}

export interface GuardedBrowserRoute {
  request(): GuardedBrowserRequest;
  abort(errorCode: "blockedbyclient"): Promise<unknown>;
  continue(): Promise<unknown>;
}

export interface GuardedBrowserPage {
  close(): Promise<unknown>;
}

export interface GuardedBrowserProcess {
  close(options?: { readonly reason?: string }): Promise<unknown>;
}

export interface GuardedManagedBrowserContext {
  route(
    pattern: "**/*",
    handler: (route: GuardedBrowserRoute) => Promise<void>,
  ): Promise<unknown>;
  pages(): readonly GuardedBrowserPage[];
  serviceWorkers(): readonly unknown[];
  browser(): GuardedBrowserProcess | null;
  setOffline(offline: boolean): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface GuardedManagedBrowserLaunchOptions {
  readonly executablePath: string;
  readonly headless: boolean;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly timeout: number;
  readonly offline: true;
  readonly serviceWorkers: "block";
  readonly args: string[];
}

export type GuardedManagedBrowserLauncher<
  Context extends GuardedManagedBrowserContext = GuardedManagedBrowserContext,
> = (profile: string, options: GuardedManagedBrowserLaunchOptions) => Promise<Context>;

export interface LaunchGuardedManagedBrowserInput<
  Context extends GuardedManagedBrowserContext = GuardedManagedBrowserContext,
> {
  readonly profile: string;
  readonly executablePath: string;
  readonly headless: boolean;
  readonly viewport: Readonly<{ width: number; height: number }>;
  /** Finite Playwright launch budget, already capped to the shared run deadline. */
  readonly launchTimeoutMs: number;
  readonly launchPersistentContext: GuardedManagedBrowserLauncher<Context>;
  readonly onMutationAttempt: () => void;
  /** Shared run deadline. A context that resolves after cancellation is closed before use. */
  readonly abortSignal?: AbortSignal;
}

interface GuardedBrowserCloseState {
  readonly signal?: AbortSignal;
  readonly onAbort: () => void;
  closePromise: Promise<void> | null;
  forceClosePromise: Promise<void> | null;
}

function beginGuardedBrowserForceClose(
  context: GuardedManagedBrowserContext,
  state: GuardedBrowserCloseState,
): Promise<void> {
  state.signal?.removeEventListener("abort", state.onAbort);
  if (!state.forceClosePromise) {
    const browser = context.browser();
    state.forceClosePromise = browser
      ? Promise.resolve(
          browser.close({ reason: "production assurance deadline exceeded" }),
        ).then(() => undefined)
      : Promise.reject(new Error("managed_browser_force_close_unavailable"));
  }
  return state.forceClosePromise;
}

const closeStates = new WeakMap<GuardedManagedBrowserContext, GuardedBrowserCloseState>();

function beginGuardedBrowserClose(
  context: GuardedManagedBrowserContext,
  state: GuardedBrowserCloseState,
): Promise<void> {
  state.signal?.removeEventListener("abort", state.onAbort);
  if (!state.closePromise) {
    state.closePromise = Promise.resolve(context.close()).then(() => undefined);
  }
  return state.closePromise;
}

/** Close once, detach the shared abort listener, and let callers await the same cleanup promise. */
export async function closeGuardedManagedBrowser(
  context: GuardedManagedBrowserContext,
): Promise<void> {
  const state = closeStates.get(context);
  if (!state) {
    await context.close();
    return;
  }
  try {
    await beginGuardedBrowserClose(context, state);
  } finally {
    closeStates.delete(context);
  }
}

/** Force-quit the owning browser process without waiting on a stalled graceful context close. */
export async function forceCloseGuardedManagedBrowser(
  context: GuardedManagedBrowserContext,
): Promise<void> {
  const state = closeStates.get(context);
  if (!state) {
    const browser = context.browser();
    if (!browser) throw new Error("managed_browser_force_close_unavailable");
    await browser.close({ reason: "production assurance deadline exceeded" });
    return;
  }
  try {
    await beginGuardedBrowserForceClose(context, state);
  } finally {
    closeStates.delete(context);
  }
}

/**
 * Bring an existing managed browser profile online only after its read-only request firewall is
 * installed. Starting offline closes the otherwise unavoidable launch-to-route gap. Blocking and
 * then checking Service Workers closes Playwright's documented route-bypass path.
 */
export async function launchGuardedManagedBrowser<
  Context extends GuardedManagedBrowserContext,
>(input: LaunchGuardedManagedBrowserInput<Context>): Promise<Context> {
  if (!Number.isFinite(input.launchTimeoutMs) || input.launchTimeoutMs <= 0) {
    throw new Error("assurance_deadline_exceeded");
  }

  let context: Context | null = null;
  let closeState: GuardedBrowserCloseState | null = null;
  let aborted = input.abortSignal?.aborted ?? false;
  const onAbort = (): void => {
    aborted = true;
    if (context && closeState) {
      void beginGuardedBrowserForceClose(context, closeState).catch(() => undefined);
    }
  };

  // Arm cancellation before invoking Playwright. If launch settles after an abort, this coroutine
  // still awaits that settlement and closes the late-created context before it rejects.
  if (!aborted) input.abortSignal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (aborted) throw new Error("assurance_deadline_exceeded");
    context = await input.launchPersistentContext(input.profile, {
      executablePath: input.executablePath,
      headless: input.headless,
      viewport: input.viewport,
      timeout: input.launchTimeoutMs,
      offline: true,
      serviceWorkers: "block",
      args: [...GUARDED_BROWSER_BACKGROUND_ARGS],
    });
    closeState = {
      signal: input.abortSignal,
      onAbort,
      closePromise: null,
      forceClosePromise: null,
    };
    closeStates.set(context, closeState);
    if (aborted) throw new Error("assurance_deadline_exceeded");

    await context.route("**/*", async (route) => {
      if (isCanaryRequestAllowed(route.request().method())) {
        await route.continue();
        return;
      }
      try {
        input.onMutationAttempt();
      } finally {
        await route.abort("blockedbyclient");
      }
    });

    // A restored page can execute cached code as soon as networking resumes. Close every bootstrap
    // page while the whole context is still offline; callers create only their controlled page.
    for (const page of context.pages()) await page.close();

    // `serviceWorkers: "block"` is the primary boundary. This explicit readback also refuses a
    // persistent profile whose already-registered worker survived startup.
    if (context.serviceWorkers().length !== 0) {
      throw new Error("managed_browser_service_worker_present");
    }

    await context.setOffline(false);
    if (aborted) throw new Error("assurance_deadline_exceeded");
    return context;
  } catch (error) {
    if (context) {
      const close = aborted
        ? forceCloseGuardedManagedBrowser(context)
        : closeGuardedManagedBrowser(context);
      await close.catch(() => undefined);
    } else input.abortSignal?.removeEventListener("abort", onAbort);
    if (aborted) throw new Error("assurance_deadline_exceeded");
    throw error;
  }
}
