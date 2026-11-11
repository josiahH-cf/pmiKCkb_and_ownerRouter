// S271: shared helpers for the November 10 qualification journeys. Every call reaches the
// rehearsal's own loopback server, its Firestore emulator or its stand-ins; nothing else.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { renameSync, writeFileSync } from "node:fs";
import { standInState } from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { runDueMessageTick } from "../../scripts/lib/one-path-rehearsal/due-message-tick.mjs";

export const DESK = "/lease-renewal/live/desk";
export const WIDE = { width: 1280, height: 800 };
export const NARROW = { width: 390, height: 800 };
export const STEPS = [
  "check-numbers",
  "compare-market",
  "ask-owner",
  "offer-tenant",
  "documents",
  "finish-up",
  "complete",
];
export const uuid = () => randomUUID();
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
export const cents = (text) =>
  Math.round(Number(String(text).replace(/[^0-9.]/g, "")) * 100);

/** The journey kit bound to one rehearsal. */
export function createKit({ rehearsal, origin }) {
  const href = (lease, search = "") => DESK + "/lease/" + lease + search;
  async function open(page, path) {
    const navigation = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => undefined);
    return navigation;
  }
  const read = (page, path) =>
    page.evaluate(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error("read " + path + " returned " + response.status);
      return response.json();
    }, path);
  const readStatus = (page, path) =>
    page.evaluate(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = { text: text.slice(0, 300) };
      }
      return { status: response.status, body };
    }, path);
  const post = (page, path, body) =>
    page.evaluate(
      async ([url, input]) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const text = await response.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { text: text.slice(0, 300) };
        }
        return { status: response.status, body: parsed };
      },
      [path, body],
    );
  const signIn = async (page, role) => {
    const answer = await post(page, "/api/auth/demo", { role });
    assert.ok(
      answer.status >= 200 && answer.status < 300,
      "Synthetic " + role + " sign-in",
    );
  };

  // The disposable emulator, by document path, for readbacks and the few named fixtures that no
  // route creates (a legacy entry, a pre-S265 authorization). The owner token is a fixed word.
  function documentUrl(path, query = "") {
    assert.match(rehearsal.firestoreEmulatorHost, /^127\.0\.0\.1:\d+$/);
    assert.equal(rehearsal.projectId, "pmi-kc-kb-one-path-rehearsal-test");
    assert.match(path, /^[a-z_]+\/[A-Za-z0-9_-]+$/);
    return (
      "http://" +
      rehearsal.firestoreEmulatorHost +
      "/v1/projects/" +
      rehearsal.projectId +
      "/databases/(default)/documents/" +
      path +
      query
    );
  }
  async function readDocument(path) {
    const response = await fetch(documentUrl(path), {
      headers: { authorization: "Bearer owner" },
      redirect: "error",
    });
    if (response.status === 404) return null;
    assert.ok(response.ok, "Read " + path + " from the disposable emulator");
    return response.json();
  }
  async function listDocuments(collection) {
    assert.match(collection, /^[a-z_]+$/);
    const url =
      "http://" +
      rehearsal.firestoreEmulatorHost +
      "/v1/projects/" +
      rehearsal.projectId +
      "/databases/(default)/documents/" +
      collection +
      "?pageSize=300";
    const response = await fetch(url, {
      headers: { authorization: "Bearer owner" },
      redirect: "error",
    });
    assert.ok(response.ok, "List " + collection + " in the disposable emulator");
    return (await response.json()).documents ?? [];
  }
  /** PATCH named fields only (an update mask); an absent masked field is deleted. */
  async function patchDocument(path, fieldPaths, fields, { exists = true } = {}) {
    const query =
      "?" +
      fieldPaths
        .map((field) => "updateMask.fieldPaths=" + encodeURIComponent(field))
        .join("&") +
      (exists ? "&currentDocument.exists=true" : "");
    const response = await fetch(documentUrl(path, query), {
      method: "PATCH",
      headers: { authorization: "Bearer owner", "content-type": "application/json" },
      body: JSON.stringify({ fields }),
      redirect: "error",
    });
    assert.ok(
      response.ok,
      "Patch " + path + " in the disposable emulator: " + response.status,
    );
    return response.json();
  }

  const sentMail = async () => {
    const state = await standInState(rehearsal);
    return state.mail.mailboxes.flatMap((box) =>
      box.messages.filter(({ labelIds }) => labelIds.includes("SENT")),
    );
  };
  const draftMail = async () => {
    const state = await standInState(rehearsal);
    return state.mail.mailboxes.flatMap((box) =>
      box.messages.filter(({ labelIds }) => labelIds.includes("DRAFT")),
    );
  };
  const comparisons = async () =>
    (await standInState(rehearsal)).comparison.comparisonsByLease ?? {};

  // Scheduled dispatch through the app's own worker: the S260 compiled worker route and its
  // synthetic clock in the compiled synthetic-mail build, else the in-process development tick.
  const compiledMail = rehearsal.compiledMail != null;
  const mailAvailable =
    rehearsal.mailAdapter === true && (compiledMail || !rehearsal.compiled);
  function setClock(at) {
    const path = rehearsal.files.mailClock;
    assert.match(path, /\/s260-mail-clock\.json$/);
    writeFileSync(path + ".new", JSON.stringify(at) + "\n", { mode: 0o600 });
    renameSync(path + ".new", path);
  }
  async function dispatchDue(page, sequence) {
    if (compiledMail) {
      const token = process.env.S260_SYNTHETIC_WORKER_TOKEN;
      assert.match(token, /^[a-f0-9]{64}$/);
      setClock(sequence.nextDueAtMs + 60_000);
      try {
        const reply = await page.request.post(
          origin + "/api/rehearsal/s260-mail-worker",
          {
            maxRedirects: 0,
            headers: { authorization: "Bearer " + token },
          },
        );
        assert.equal(reply.status(), 200, "Run the real worker in the compiled fixture");
        return reply.json();
      } finally {
        setClock(null);
      }
    }
    assert.ok(
      !rehearsal.compiled,
      "A compiled build without synthetic mail cannot dispatch",
    );
    return runDueMessageTick(rehearsal, { sequenceId: sequence.id });
  }

  async function toggleDisclosure(page, details, expanded) {
    const summary = details.locator(":scope > summary");
    await summary.waitFor();
    if (((await details.getAttribute("open")) !== null) === expanded) return;
    await summary.scrollIntoViewIfNeeded();
    await summary.press("Enter");
    await details
      .and(page.locator(expanded ? "details[open]" : "details:not([open])"))
      .waitFor();
  }
  const now = (page) => page.getByRole("region", { name: "Now", exact: true });
  const full = (page) => page.getByRole("button", { name: "Full view", exact: true });

  return {
    href,
    open,
    read,
    readStatus,
    post,
    signIn,
    documentUrl,
    readDocument,
    listDocuments,
    patchDocument,
    sentMail,
    draftMail,
    comparisons,
    compiledMail,
    mailAvailable,
    setClock,
    dispatchDue,
    toggleDisclosure,
    now,
    full,
  };
}

/** Firestore REST values for the few emulator fixtures (strings, integers, maps, nulls). */
export function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, firestoreValue(entry)]),
      ),
    },
  };
}

/** The plain value of a Firestore REST field. */
export function plainValue(field) {
  if (!field || typeof field !== "object") return undefined;
  if ("nullValue" in field) return null;
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("arrayValue" in field) return (field.arrayValue.values ?? []).map(plainValue);
  if ("mapValue" in field)
    return Object.fromEntries(
      Object.entries(field.mapValue.fields ?? {}).map(([key, entry]) => [
        key,
        plainValue(entry),
      ]),
    );
  return undefined;
}

/** sequence-store's canonical hash: keys sorted with localeCompare, then SHA-256 of the JSON. */
export function sequencePayloadHash(value) {
  const canonical = (entry) =>
    Array.isArray(entry)
      ? entry.map(canonical)
      : entry && typeof entry === "object"
        ? Object.fromEntries(
            Object.entries(entry)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, inner]) => [key, canonical(inner)]),
          )
        : entry;
  return sha256(JSON.stringify(canonical(value)));
}

/**
 * The text a composition read (`/api/gmail-hub/composition`) prepares: its `initial` message is
 * paragraphs of runs, not a rendered body. Each linked run keeps its link target beside its text.
 */
export function compositionText(composition) {
  const paragraphs = composition?.initial?.paragraphs;
  if (!Array.isArray(paragraphs)) return "";
  return paragraphs
    .map((runs) =>
      runs.map((run) => run.text + (run.href ? " <" + run.href + ">" : "")).join(""),
    )
    .join("\n\n");
}

/** The Central calendar date `days` from now, written YYYY-MM-DD. */
export function centralDate(days = 0) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Chicago" }).format(
    Date.now() + days * 86_400_000,
  );
}

export const addDays = (iso, days) =>
  new Date(Date.parse(iso + "T12:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
export const addYears = (iso, years) => {
  const date = new Date(Date.parse(iso + "T12:00:00Z"));
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
};
