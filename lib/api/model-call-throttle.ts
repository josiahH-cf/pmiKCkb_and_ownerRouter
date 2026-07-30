// LR-05: per-user cost throttles for the two cost-bearing MODEL routes — Ask (/api/ask) and process
// classification (/api/processes/classify). Both invoke a paid LLM, and neither had any per-user limit, so
// a single authenticated Editor/reader could drive unbounded paid model calls. These reuse the proven
// token-bucket limiter (lib/maintenance/intake-rate-limit) keyed on user.uid.
//
// Scope: this is the PER-USER repeatability control the global GCP budget kill-switch cannot provide (that
// backstop bounds total spend, not one user's call rate). Best-effort and per-instance (memory only, not
// coordinated across Cloud Run instances) — like the maintenance intake pre-gate — so it sheds an
// individual client's burst cheaply without being the authoritative global limit.

import { IntakeRateLimiter } from "@/lib/maintenance/intake-rate-limit";

// Ask is the interactive console Q&A: a generous burst for real typing, tight sustained rate against a
// scripted flood (~1 call / 2s sustained after the burst is spent).
export const ASK_MODEL_RATE_LIMIT_OPTIONS = Object.freeze({
  capacity: 15,
  refillPerSecond: 0.5,
  maxKeys: 10_000,
});
export const askModelRateLimiter = new IntakeRateLimiter(ASK_MODEL_RATE_LIMIT_OPTIONS);

// Classification is a model fallback the client reaches only when the free deterministic matcher misses,
// so it warrants a tighter budget (~1 call / 5s sustained).
export const CLASSIFY_MODEL_RATE_LIMIT_OPTIONS = Object.freeze({
  capacity: 10,
  refillPerSecond: 0.2,
  maxKeys: 10_000,
});
export const classifyModelRateLimiter = new IntakeRateLimiter(
  CLASSIFY_MODEL_RATE_LIMIT_OPTIONS,
);
