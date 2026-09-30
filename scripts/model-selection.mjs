/**
 * S136: the one production Gemini selection. Every active selector reads these values: the server
 * defaults (lib/config/server.ts), the live-cost preflight and the budget guard that imports it
 * (scripts/check-live-cost.mjs), and the Cloud Run deploy wrapper. Pure constants, no I/O.
 *
 * gemini-3.1-flash-lite is the least-cost supported (GA, not retiring) Gemini model that passed this
 * project's real structured-output request on 2026-09-30. Google Cloud serves it to this project on
 * the global endpoint only; the us-central1 endpoint returned 404 for it. The Cloud Run region
 * (VERTEX_AI_LOCATION) is unrelated to this model endpoint.
 */
export const SUPPORTED_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const SUPPORTED_GEMINI_MODEL_LOCATION = "global";
export const SUPPORTED_GEMINI_MODEL_LABEL = "Gemini 3.1 Flash-Lite";
