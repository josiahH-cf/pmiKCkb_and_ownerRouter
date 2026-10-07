// S106 (ARCH-S106-3): one shared request scheduler for the company Dotloop connection.
//
// Dotloop documents a limit of 100 requests per minute for a user and reports it through
// `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (milliseconds until the window
// resets). Every caller in this process shares the one company connection, so every caller shares
// this accounting: a 429 or an exhausted window observed by one request makes the next request from
// any caller wait for the same real time. Waits are bounded; a wait longer than the bound is refused
// as rate limited without sending anything, so no request thread blocks indefinitely.
//
// The scheduler only orders and delays requests. It never retries by itself: the client decides
// which rejected requests may be retried (documented rejections only) and which outcomes are
// uncertain and must not be sent again.

export interface DotloopClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realDotloopClock: DotloopClock = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, ms));
    }),
};

/** The documented provider window. */
export const DOTLOOP_RATE_WINDOW_MS = 60_000;
/** The documented per-user limit is 100; local accounting keeps a margin for other clients. */
export const DOTLOOP_LOCAL_REQUEST_BUDGET = 90;
/** The longest a request may wait for capacity before it is refused as rate limited. */
export const DOTLOOP_MAX_RATE_WAIT_MS = 30_000;
/** A 429 without usable timing headers waits this long before its bounded retry. */
export const DOTLOOP_DEFAULT_RETRY_MS = 2_000;

export class DotloopRateWaitExceeded extends Error {
  constructor(readonly waitMs: number) {
    super("Dotloop is rate limiting this account; retry later.");
    this.name = "DotloopRateWaitExceeded";
  }
}

function header(headers: Readonly<Record<string, string>>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}

function finiteNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export class DotloopRequestScheduler {
  readonly #clock: DotloopClock;
  readonly #budget: number;
  readonly #maxWaitMs: number;
  #sent: number[] = [];
  #blockedUntil = 0;
  #tail: Promise<void> = Promise.resolve();

  constructor(
    options: {
      clock?: DotloopClock;
      budgetPerWindow?: number;
      maxWaitMs?: number;
    } = {},
  ) {
    this.#clock = options.clock ?? realDotloopClock;
    this.#budget = Math.max(
      1,
      Math.trunc(options.budgetPerWindow ?? DOTLOOP_LOCAL_REQUEST_BUDGET),
    );
    this.#maxWaitMs = Math.max(0, options.maxWaitMs ?? DOTLOOP_MAX_RATE_WAIT_MS);
  }

  get maxWaitMs(): number {
    return this.#maxWaitMs;
  }

  /** The earliest time (epoch ms) the next request may be sent. Exposed for readiness labels. */
  get blockedUntil(): number {
    return this.#blockedUntil;
  }

  /**
   * Reserve one request slot, waiting real time when the shared window or a provider back-off
   * requires it. Acquisitions are serialized so concurrent callers cannot both take the last slot.
   */
  acquire(): Promise<void> {
    const next = this.#tail.then(() => this.#reserve());
    // Keep the chain alive after a refused wait so later callers are still ordered.
    this.#tail = next.catch(() => undefined);
    return next;
  }

  async #reserve(): Promise<void> {
    const now = this.#clock.now();
    this.#sent = this.#sent.filter((at) => at > now - DOTLOOP_RATE_WINDOW_MS);
    const windowFreeAt =
      this.#sent.length >= this.#budget
        ? this.#sent[this.#sent.length - this.#budget] + DOTLOOP_RATE_WINDOW_MS
        : 0;
    const readyAt = Math.max(this.#blockedUntil, windowFreeAt);
    const waitMs = readyAt - now;
    if (waitMs > this.#maxWaitMs) throw new DotloopRateWaitExceeded(waitMs);
    if (waitMs > 0) await this.#clock.sleep(waitMs);
    this.#sent.push(Math.max(this.#clock.now(), readyAt));
  }

  /** Record what one response says about the shared window. */
  observe(response: { status: number; headers: Readonly<Record<string, string>> }): void {
    const now = this.#clock.now();
    const remaining = finiteNumber(header(response.headers, "x-ratelimit-remaining"));
    const resetMs = finiteNumber(header(response.headers, "x-ratelimit-reset"));
    if (remaining === 0 && resetMs !== null) {
      this.#blockedUntil = Math.max(
        this.#blockedUntil,
        now + Math.min(resetMs, DOTLOOP_RATE_WINDOW_MS),
      );
    }
    if (response.status === 429) {
      this.#blockedUntil = Math.max(
        this.#blockedUntil,
        now + this.retryDelayMs(response),
      );
    }
  }

  /** The documented wait for one rejected request: Retry-After seconds, else the window reset. */
  retryDelayMs(response: { headers: Readonly<Record<string, string>> }): number {
    const retryAfterSeconds = finiteNumber(header(response.headers, "retry-after"));
    if (retryAfterSeconds !== null) return Math.round(retryAfterSeconds * 1_000);
    const resetMs = finiteNumber(header(response.headers, "x-ratelimit-reset"));
    if (resetMs !== null) return Math.min(resetMs, DOTLOOP_RATE_WINDOW_MS);
    return DOTLOOP_DEFAULT_RETRY_MS;
  }
}

let shared: DotloopRequestScheduler | null = null;

/** The process-wide scheduler for the one company connection. */
export function sharedDotloopRequestScheduler(): DotloopRequestScheduler {
  shared ??= new DotloopRequestScheduler();
  return shared;
}

/** Tests only: start from an empty window. */
export function resetSharedDotloopRequestSchedulerForTests(): void {
  shared = null;
}
