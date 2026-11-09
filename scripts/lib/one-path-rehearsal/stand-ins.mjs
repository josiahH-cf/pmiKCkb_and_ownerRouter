// S254 R-S254-4: the stand-ins of the isolated one-path rehearsal. One process on 127.0.0.1
// answers, with synthetic data only, the three things a verification session cannot be allowed
// to reach for real: a rent comparison (RentCast's two reads), a mailbox (the Gmail endpoints the
// app's mailbox client calls) and a model (an OpenAI-style chat completion). Nothing here opens
// an outbound connection, reads a credential or writes outside the run's private log directory.
//
// Comparison: synthetic comparables around the lease's own rent, a request log by lease (so "one
// comparison per lease" can be counted) and nothing billed.
// Mail: a send is accepted with a provider-shaped answer and kept readable exactly as sent, only
// for example.invalid recipients. Controls deliver an owner reply on a thread, make the next send
// unconfirmed, return a failed delivery, and list or send a draft that was left unsent.
// Model: an assistant question gets an empty plan, so the app's own deterministic interpreter
// answers it; an email rewording gets a revision the app accepts, or, on request, one that copies
// the instruction so the app refuses it.
//
// Controls are plain HTTP on the same loopback origin: GET /control/state and POST /control/<name>
// with a JSON body. scripts/one-path-rehearsal-control.mjs is the command-line form.
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

const MAILBOX_HEADER = "x-rehearsal-mailbox";
const SYNTHETIC_RECIPIENT = /^[^@\s<>]+@example\.invalid$/i;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const NEXT_SEND_MODES = ["normal", "unconfirmed", "unconfirmed-lost", "bounce"];
const REWORDING_MODES = ["accept", "echo"];

class StandInRefusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const refuse = (status, message) => {
  throw new StandInRefusal(status, message);
};

// ---- MIME, just enough to read back what the app sends --------------------------------------

function splitHeadersFromBody(wire) {
  const blank = /\r?\n\r?\n/.exec(wire);
  if (!blank) return [wire, ""];
  return [wire.slice(0, blank.index), wire.slice(blank.index + blank[0].length)];
}

function decodeEncodedWords(value) {
  return value
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset, kind, text) =>
      kind.toUpperCase() === "B"
        ? Buffer.from(text, "base64").toString("utf8")
        : Buffer.from(
            text
              .replace(/_/g, " ")
              .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
                String.fromCharCode(parseInt(hex, 16)),
              ),
            "latin1",
          ).toString("utf8"),
    );
}

function readHeaders(block) {
  return block
    .replace(/\r?\n[ \t]+/g, " ")
    .split(/\r?\n/)
    .flatMap((line) => {
      const colon = line.indexOf(":");
      return colon < 1
        ? []
        : [
            {
              name: line.slice(0, colon).trim(),
              value: decodeEncodedWords(line.slice(colon + 1).trim()),
            },
          ];
    });
}

const headerOf = (headers, name) =>
  headers.find((entry) => entry.name.toLowerCase() === name)?.value ?? "";

function decodeQuotedPrintable(text) {
  return Buffer.from(
    text
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16))),
    "latin1",
  );
}

/** One MIME entity as a Gmail API message part. */
function mimePart(wire, depth = 0) {
  const [head, body] = splitHeadersFromBody(wire);
  const headers = readHeaders(head);
  const type = headerOf(headers, "content-type") || "text/plain";
  const mimeType = type.split(";")[0].trim().toLowerCase();
  const boundary = /boundary\s*=\s*"?([^";]+)"?/i.exec(type)?.[1];
  if (mimeType.startsWith("multipart/") && boundary && depth < 8) {
    const marker = `--${boundary}`;
    const parts = [];
    let current = null;
    for (const line of body.split(/\r?\n/)) {
      if (line.trimEnd() === marker || line.trimEnd() === `${marker}--`) {
        if (current !== null) parts.push(mimePart(current.join("\r\n"), depth + 1));
        current = line.trimEnd() === marker ? [] : null;
        if (line.trimEnd() === `${marker}--`) break;
      } else if (current !== null) current.push(line);
    }
    return { mimeType, filename: "", headers, body: { size: 0 }, parts };
  }
  const encoding = headerOf(headers, "content-transfer-encoding").toLowerCase();
  const bytes =
    encoding === "base64"
      ? Buffer.from(body.replace(/\s+/g, ""), "base64")
      : encoding === "quoted-printable"
        ? decodeQuotedPrintable(body)
        : Buffer.from(body, "utf8");
  const filename =
    /filename\s*=\s*"?([^";]+)"?/i.exec(headerOf(headers, "content-disposition"))?.[1] ??
    "";
  return {
    mimeType,
    filename,
    headers,
    body: filename
      ? {
          size: bytes.length,
          attachmentId: createHash("sha256").update(bytes).digest("hex").slice(0, 32),
        }
      : { size: bytes.length, data: bytes.toString("base64url") },
  };
}

function firstText(part, mimeType) {
  if (part.mimeType === mimeType && part.body?.data && !part.filename)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const child of part.parts ?? []) {
    const found = firstText(child, mimeType);
    if (found !== null) return found;
  }
  return null;
}

const addressesOf = (value) =>
  (value.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []).map((entry) => entry.toLowerCase());

const base64Lines = (text) =>
  Buffer.from(text, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)
    .join("\r\n");

// ---- The stand-in process -------------------------------------------------------------------

/**
 * Start the stand-ins on a free 127.0.0.1 port. `mix` is the loaded November 5 mix (for the
 * comparison stand-in's rent and lease lookup); `logDir` receives stand-ins.jsonl.
 */
export async function startStandIns({
  mix = null,
  logDir = null,
  port = 0,
  mailNow = () => Date.now(),
} = {}) {
  if (logDir) mkdirSync(logDir, { recursive: true });
  const logFile = logDir ? join(logDir, "stand-ins.jsonl") : null;
  const record = (entry) => {
    if (logFile)
      appendFileSync(
        logFile,
        `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
      );
  };

  const state = {
    startedAt: new Date().toISOString(),
    comparison: { requests: [], hold: null },
    model: { requests: [], rewording: "accept", rewordingNext: null },
    mail: {
      mailboxes: new Map(),
      nextSend: "normal",
      counter: 0,
      refused: 0,
      unreadableThread: null,
    },
  };

  // ---- Comparison ---------------------------------------------------------------------------

  const leaseForAddress = (address) => {
    const zip = /\b(\d{5})\b(?!.*\b\d{5}\b)/.exec(address ?? "")?.[1];
    return (
      mix?.leases.find((row) => zip && row.unit?.postalCode === zip) ??
      mix?.leases.find((row) =>
        (address ?? "").startsWith(
          `${row.property?.streetNumber} ${row.property?.streetName}`,
        ),
      ) ??
      null
    );
  };
  const isoDaysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

  async function comparison(url) {
    if (url.pathname === "/rentcast/v1/avm/rent/long-term") {
      const address = url.searchParams.get("address") ?? "";
      const row = leaseForAddress(address);
      const leaseId = row ? row.lease.leaseID : null;
      state.comparison.requests.push({
        at: new Date().toISOString(),
        kind: "comparison",
        leaseId,
      });
      record({ standIn: "comparison", kind: "comparison", leaseId });
      const hold = state.comparison.hold;
      if (hold?.leaseId === leaseId) {
        hold.entered = true;
        let timeout;
        try {
          await Promise.race([
            hold.promise,
            new Promise((resolve) => {
              timeout = setTimeout(resolve, 8000);
            }),
          ]);
          if (state.comparison.hold === hold)
            refuse(503, "The comparison hold expired before the fixture released it.");
        } finally {
          clearTimeout(timeout);
        }
      }
      const base = row ? Number(row.unit.rent) : 1500;
      const beds = row?.unit?.beds ?? 2;
      const baths = (row?.unit?.fullBaths ?? 1) + (row?.unit?.halfBaths ?? 0) * 0.5;
      const size = row?.unit?.size ?? 1000;
      return {
        rent: base + 50,
        rentRangeLow: base - 50,
        rentRangeHigh: base + 150,
        subjectProperty: {
          propertyType: "Single Family",
          bedrooms: beds,
          bathrooms: baths,
          squareFootage: size,
        },
        comparables: [-25, 25, 50, 75, 100].map((delta, index) => ({
          id: `rehearsal-comparable-${index + 1}`,
          formattedAddress: `${200 + index} Sample Comparison St, Example City, MO 00199`,
          propertyType: "Single Family",
          bedrooms: beds,
          bathrooms: baths,
          squareFootage: size + (index - 2) * 50,
          price: base + delta,
          listedDate: isoDaysAgo(20 + index * 5),
          lastSeenDate: isoDaysAgo(2 + index),
          daysOld: 2 + index,
          daysOnMarket: 18 + index * 5,
          distance: Number((0.3 + index * 0.4).toFixed(1)),
          correlation: Number((0.98 - index * 0.02).toFixed(2)),
        })),
      };
    }
    if (url.pathname === "/rentcast/v1/markets") {
      const zip = url.searchParams.get("zipCode") ?? "";
      state.comparison.requests.push({
        at: new Date().toISOString(),
        kind: "trend",
        leaseId:
          mix?.leases.find((row) => row.unit?.postalCode === zip)?.lease.leaseID ?? null,
      });
      record({ standIn: "comparison", kind: "trend" });
      const history = {};
      const now = new Date();
      for (let back = 24; back >= 1; back -= 1) {
        const month = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1),
        );
        const key = month.toISOString().slice(0, 7);
        const averageRent = 1400 + (24 - back) * 5;
        history[key] = {
          date: `${key}-01T00:00:00.000Z`,
          averageRent,
          medianRent: averageRent - 20,
          minRent: averageRent - 400,
          maxRent: averageRent + 600,
          totalListings: 40,
          newListings: 10,
        };
      }
      return { id: zip, zipCode: zip, rentalData: { averageRent: 1520, history } };
    }
    return undefined;
  }

  // ---- Model --------------------------------------------------------------------------------

  function completion(body) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const system = String(messages.find((m) => m?.role === "system")?.content ?? "");
    const user = String(messages.find((m) => m?.role === "user")?.content ?? "");
    let content = "{}";
    let kind = "plan";
    if (/^You revise one email draft/.test(system)) {
      kind = "rewording";
      let payload = {};
      try {
        payload = JSON.parse(user);
      } catch {
        payload = {};
      }
      const draft = String(payload.current_draft ?? "");
      const instruction = String(payload.instruction ?? "");
      const mode = state.model.rewordingNext ?? state.model.rewording;
      state.model.rewordingNext = null;
      kind = `rewording:${mode}`;
      if (mode === "echo")
        content = JSON.stringify({ body: `${draft}\n\n${instruction}` });
      else {
        const paragraphs = draft
          .replace(/\r\n/g, "\n")
          .trimEnd()
          .split(/\n{2,}/);
        const addition = "Thank you for your time and for working with us.";
        if (paragraphs.length > 1) paragraphs.splice(paragraphs.length - 1, 0, addition);
        else paragraphs.push(addition);
        content = JSON.stringify({ body: paragraphs.join("\n\n") });
      }
    }
    state.model.requests.push({ at: new Date().toISOString(), kind });
    record({ standIn: "model", kind });
    return {
      id: `rehearsal-completion-${state.model.requests.length}`,
      object: "chat.completion",
      model: String(body?.model ?? "rehearsal-stand-in-model"),
      choices: [
        { index: 0, finish_reason: "stop", message: { role: "assistant", content } },
      ],
    };
  }

  // ---- Mail ---------------------------------------------------------------------------------

  const nextId = (prefix) => {
    state.mail.counter += 1;
    return `${prefix}${state.mail.counter.toString(16).padStart(15, "0")}`;
  };
  function mailboxOf(email) {
    const key = String(email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(key)) refuse(400, "The request names no mailbox.");
    if (!state.mail.mailboxes.has(key))
      state.mail.mailboxes.set(key, {
        email: key,
        historyId: 1000,
        messages: new Map(),
        drafts: new Map(),
        history: [],
      });
    return state.mail.mailboxes.get(key);
  }
  function keep(mailbox, { raw, threadId, labelIds }) {
    const wire = Buffer.from(raw, "base64url").toString("utf8");
    const payload = mimePart(wire);
    mailbox.historyId += 1;
    const message = {
      id: nextId("m"),
      threadId: threadId ?? nextId("t"),
      labelIds,
      internalDate: String(mailNow()),
      historyId: String(mailbox.historyId),
      raw,
      payload,
      rfcMessageId: headerOf(payload.headers, "message-id"),
    };
    mailbox.messages.set(message.id, message);
    mailbox.history.push({
      id: mailbox.historyId,
      messageId: message.id,
      threadId: message.threadId,
      inbox: labelIds.includes("INBOX"),
    });
    return message;
  }
  const threadMessages = (mailbox, threadId) =>
    [...mailbox.messages.values()].filter((message) => message.threadId === threadId);
  const snippetOf = (message) =>
    (firstText(message.payload, "text/plain") ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  const fullMessage = (message) => ({
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds,
    snippet: snippetOf(message),
    historyId: message.historyId,
    internalDate: message.internalDate,
    sizeEstimate: message.raw.length,
    payload: message.payload,
  });
  const byRfcMessageId = (mailbox, query) => {
    const wanted = /^rfc822msgid:(.+)$/.exec(String(query ?? "").trim())?.[1];
    return wanted
      ? [...mailbox.messages.values()].filter(
          (message) => message.rfcMessageId === wanted,
        )
      : [];
  };

  function requireSyntheticRecipients(headers) {
    const recipients = ["to", "cc", "bcc"].flatMap((name) =>
      addressesOf(headerOf(headers, name)),
    );
    if (!recipients.length) refuse(400, "The message names no recipient.");
    if (recipients.some((address) => !SYNTHETIC_RECIPIENT.test(address))) {
      state.mail.refused += 1;
      record({ standIn: "mail", refused: "recipient_not_synthetic" });
      refuse(400, "The rehearsal mail stand-in accepts example.invalid recipients only.");
    }
    return recipients;
  }

  function inboundRaw({ from, to, subject, text, inReplyTo, references, extra = [] }) {
    return Buffer.from(
      [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Message-ID: <${randomUUID()}@example.invalid>`,
        ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
        ...(references ? [`References: ${references}`] : []),
        `Date: ${new Date().toUTCString()}`,
        "MIME-Version: 1.0",
        ...extra,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        base64Lines(text),
        "",
      ].join("\r\n"),
      "utf8",
    ).toString("base64url");
  }

  function bounceRaw({ to, original, recipient }) {
    const boundary = `rehearsal-dsn-${randomUUID()}`;
    return Buffer.from(
      [
        "From: Mail Delivery Subsystem <mailer-daemon@example.invalid>",
        `To: ${to}`,
        "Subject: Delivery Status Notification (Failure)",
        `Message-ID: <${randomUUID()}@example.invalid>`,
        `In-Reply-To: ${original}`,
        `References: ${original}`,
        `Date: ${new Date().toUTCString()}`,
        "Return-Path: <>",
        "Auto-Submitted: auto-replied",
        "MIME-Version: 1.0",
        `Content-Type: multipart/report; report-type=delivery-status; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        base64Lines(
          `The rehearsal mail stand-in could not deliver the message ${original} to ${recipient}. The address was not found.`,
        ),
        `--${boundary}`,
        "Content-Type: message/delivery-status",
        "",
        `Final-Recipient: rfc822; ${recipient}`,
        "Action: failed",
        "Status: 5.1.1",
        `--${boundary}--`,
        "",
      ].join("\r\n"),
      "utf8",
    ).toString("base64url");
  }

  /**
   * The sent message a control acts on: the latest one sent, narrowed by mailbox, by thread or by
   * the address it was sent to.
   */
  function sentTarget({ mailbox: email, threadId, to }) {
    const mailboxes = email ? [mailboxOf(email)] : [...state.mail.mailboxes.values()];
    const recipient = to ? String(to).trim().toLowerCase() : null;
    const sent = mailboxes
      .flatMap((mailbox) =>
        [...mailbox.messages.values()]
          .filter(
            (message) =>
              message.labelIds.includes("SENT") &&
              (!threadId || message.threadId === threadId) &&
              (!recipient ||
                addressesOf(headerOf(message.payload.headers, "to")).includes(recipient)),
          )
          .map((message) => ({ mailbox, message })),
      )
      .sort((a, b) => Number(a.message.internalDate) - Number(b.message.internalDate));
    if (!sent.length)
      refuse(404, "No sent message matches; send one from the app first.");
    return sent.at(-1);
  }

  function addBounce(mailbox, message) {
    const recipient = addressesOf(headerOf(message.payload.headers, "to"))[0];
    return keep(mailbox, {
      raw: bounceRaw({ to: mailbox.email, original: message.rfcMessageId, recipient }),
      threadId: message.threadId,
      labelIds: ["INBOX", "UNREAD"],
    });
  }

  function mail(method, url, mailboxEmail, body) {
    const mailbox = mailboxOf(mailboxEmail);
    const path = url.pathname.replace(/^\/gmail\/v1\/users\/me/, "");
    const query = url.searchParams;
    record({
      standIn: "mail",
      method,
      path: path.replace(/\/[A-Za-z0-9_-]{10,}/g, "/:id"),
    });

    if (method === "GET" && path === "/profile")
      return {
        emailAddress: mailbox.email,
        messagesTotal: mailbox.messages.size,
        threadsTotal: new Set([...mailbox.messages.values()].map((m) => m.threadId)).size,
        historyId: String(mailbox.historyId),
      };

    if (method === "POST" && path === "/messages/send") {
      const raw = String(body?.raw ?? "");
      if (!/^[A-Za-z0-9_-]+={0,2}$/.test(raw))
        refuse(400, "The send carries no raw message.");
      const headers = mimePart(Buffer.from(raw, "base64url").toString("utf8")).headers;
      if (!addressesOf(headerOf(headers, "from")).includes(mailbox.email))
        refuse(403, "The sender is not this mailbox.");
      requireSyntheticRecipients(headers);
      const mode = state.mail.nextSend;
      state.mail.nextSend = "normal";
      if (mode === "unconfirmed-lost") {
        record({ standIn: "mail", send: "unconfirmed-lost" });
        refuse(503, "The rehearsal made this send unconfirmed; nothing was kept.");
      }
      const threadId = body?.threadId ? String(body.threadId) : undefined;
      if (threadId && !threadMessages(mailbox, threadId).length)
        refuse(404, "The thread does not exist.");
      const message = keep(mailbox, { raw, threadId, labelIds: ["SENT"] });
      record({ standIn: "mail", send: mode, messageId: message.id });
      if (mode === "unconfirmed")
        refuse(503, "The rehearsal made this send unconfirmed; the message was kept.");
      if (mode === "bounce") addBounce(mailbox, message);
      return { id: message.id, threadId: message.threadId, labelIds: message.labelIds };
    }

    if (method === "GET" && path === "/messages") {
      const found = byRfcMessageId(mailbox, query.get("q"));
      return {
        messages: found.map((message) => ({
          id: message.id,
          threadId: message.threadId,
        })),
        resultSizeEstimate: found.length,
      };
    }
    const messageId = /^\/messages\/([A-Za-z0-9_-]+)$/.exec(path)?.[1];
    if (method === "GET" && messageId) {
      const message = mailbox.messages.get(messageId);
      if (!message) refuse(404, "The message does not exist.");
      return query.get("format") === "raw"
        ? {
            id: message.id,
            threadId: message.threadId,
            labelIds: message.labelIds,
            historyId: message.historyId,
            internalDate: message.internalDate,
            raw: message.raw,
          }
        : fullMessage(message);
    }

    if (method === "GET" && path === "/threads") {
      const threads = new Map();
      for (const message of mailbox.messages.values())
        threads.set(message.threadId, {
          id: message.threadId,
          snippet: snippetOf(message),
          historyId: message.historyId,
        });
      return { threads: [...threads.values()], resultSizeEstimate: threads.size };
    }
    const threadId = /^\/threads\/([A-Za-z0-9_-]+)$/.exec(path)?.[1];
    if (method === "GET" && threadId) {
      if (state.mail.unreadableThread === threadId) {
        record({ standIn: "mail", thread: "unavailable", threadId });
        refuse(503, "The selected synthetic thread is temporarily unavailable.");
      }
      const messages = threadMessages(mailbox, threadId);
      if (!messages.length) refuse(404, "The thread does not exist.");
      return {
        id: threadId,
        historyId: messages.at(-1).historyId,
        messages:
          query.get("format") === "minimal"
            ? messages.map(({ id, labelIds }) => ({ id, threadId, labelIds }))
            : messages.map(fullMessage),
      };
    }
    const modified = /^\/threads\/([A-Za-z0-9_-]+)\/modify$/.exec(path)?.[1];
    if (method === "POST" && modified) {
      const messages = threadMessages(mailbox, modified);
      if (!messages.length) refuse(404, "The thread does not exist.");
      const add = Array.isArray(body?.addLabelIds) ? body.addLabelIds.map(String) : [];
      const remove = Array.isArray(body?.removeLabelIds)
        ? body.removeLabelIds.map(String)
        : [];
      for (const message of messages)
        message.labelIds = [
          ...new Set([
            ...message.labelIds.filter((label) => !remove.includes(label)),
            ...add,
          ]),
        ];
      return {
        id: modified,
        labelIds: [...new Set(messages.flatMap((message) => message.labelIds))],
      };
    }

    if (method === "GET" && path === "/history") {
      const start = Number(query.get("startHistoryId") ?? 0);
      const added = mailbox.history.filter((entry) => entry.id > start && entry.inbox);
      return {
        historyId: String(mailbox.historyId),
        history: added.map((entry) => ({
          id: String(entry.id),
          messagesAdded: [{ message: { id: entry.messageId, threadId: entry.threadId } }],
        })),
      };
    }
    if (method === "GET" && path === "/labels")
      return {
        labels: ["INBOX", "SENT", "DRAFT", "UNREAD"].map((id) => ({
          id,
          name: id,
          type: "system",
        })),
      };
    if (method === "POST" && path === "/watch")
      return {
        historyId: String(mailbox.historyId),
        expiration: String(Date.now() + 7 * 86_400_000),
      };

    if (method === "POST" && path === "/drafts") {
      const raw = String(body?.message?.raw ?? "");
      if (!/^[A-Za-z0-9_-]+={0,2}$/.test(raw))
        refuse(400, "The draft carries no raw message.");
      requireSyntheticRecipients(
        mimePart(Buffer.from(raw, "base64url").toString("utf8")).headers,
      );
      const message = keep(mailbox, {
        raw,
        threadId: body?.message?.threadId ? String(body.message.threadId) : undefined,
        labelIds: ["DRAFT"],
      });
      const draft = { id: nextId("r"), messageId: message.id };
      mailbox.drafts.set(draft.id, draft);
      record({ standIn: "mail", draft: "kept", draftId: draft.id });
      return {
        id: draft.id,
        message: {
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds,
        },
      };
    }
    if (method === "GET" && path === "/drafts") {
      const found = byRfcMessageId(mailbox, query.get("q")).map((message) => message.id);
      const drafts = [...mailbox.drafts.values()].filter(
        (draft) => !query.get("q") || found.includes(draft.messageId),
      );
      return {
        drafts: drafts.map((draft) => ({
          id: draft.id,
          message: {
            id: draft.messageId,
            threadId: mailbox.messages.get(draft.messageId).threadId,
          },
        })),
        resultSizeEstimate: drafts.length,
      };
    }
    const draftId = /^\/drafts\/([A-Za-z0-9_-]+)$/.exec(path)?.[1];
    if (method === "GET" && draftId) {
      const draft = mailbox.drafts.get(draftId);
      if (!draft) refuse(404, "The draft does not exist.");
      const message = mailbox.messages.get(draft.messageId);
      return {
        id: draft.id,
        message: {
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds,
          raw: message.raw,
        },
      };
    }
    record({ standIn: "mail", unsupported: `${method} ${path}` });
    refuse(404, "The rehearsal mail stand-in does not answer this request.");
  }

  // ---- Controls -----------------------------------------------------------------------------

  /** What a session reads back: every kept message with its headers and text, by mailbox. */
  function describeMail() {
    return [...state.mail.mailboxes.values()].map((mailbox) => ({
      mailbox: mailbox.email,
      historyId: String(mailbox.historyId),
      messages: [...mailbox.messages.values()].map((message) => ({
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds,
        at: new Date(Number(message.internalDate)).toISOString(),
        rfcMessageId: message.rfcMessageId,
        from: headerOf(message.payload.headers, "from"),
        to: headerOf(message.payload.headers, "to"),
        cc: headerOf(message.payload.headers, "cc"),
        subject: headerOf(message.payload.headers, "subject"),
        text: firstText(message.payload, "text/plain") ?? "",
        html: firstText(message.payload, "text/html") ?? "",
      })),
      drafts: [...mailbox.drafts.values()].map((draft) => ({
        id: draft.id,
        messageId: draft.messageId,
        unsent: mailbox.messages.get(draft.messageId).labelIds.includes("DRAFT"),
      })),
    }));
  }
  function describe() {
    const comparisonsByLease = {};
    for (const request of state.comparison.requests.filter(
      (r) => r.kind === "comparison",
    )) {
      const key = String(request.leaseId ?? "unknown");
      comparisonsByLease[key] = (comparisonsByLease[key] ?? 0) + 1;
    }
    return {
      startedAt: state.startedAt,
      comparison: {
        requests: state.comparison.requests,
        comparisonsByLease,
        heldLeaseId: state.comparison.hold?.entered
          ? state.comparison.hold.leaseId
          : null,
      },
      model: {
        requests: state.model.requests,
        rewording: state.model.rewording,
        rewordingNext: state.model.rewordingNext,
      },
      mail: {
        nextSend: state.mail.nextSend,
        refusedRecipients: state.mail.refused,
        mailboxes: describeMail(),
      },
    };
  }

  function control(name, body) {
    record({ standIn: "control", name });
    if (name === "next-send") {
      if (!NEXT_SEND_MODES.includes(body?.mode))
        refuse(400, `Choose one of: ${NEXT_SEND_MODES.join(", ")}.`);
      state.mail.nextSend = body.mode;
      return { nextSend: state.mail.nextSend };
    }
    if (name === "mail-thread-unreadable") {
      const id = body?.threadId;
      if (id !== null && (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)))
        refuse(400, "Choose an exact synthetic thread.");
      state.mail.unreadableThread = id;
      return { threadId: id };
    }
    if (name === "deliver-reply") {
      const { mailbox, message } = sentTarget(body ?? {});
      const from =
        body?.from ?? addressesOf(headerOf(message.payload.headers, "to"))[0] ?? "";
      if (!SYNTHETIC_RECIPIENT.test(from))
        refuse(400, "A reply comes from an example.invalid address.");
      const subject = headerOf(message.payload.headers, "subject");
      const reply = keep(mailbox, {
        raw: inboundRaw({
          from,
          to: mailbox.email,
          subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
          text: String(
            body?.text ?? "Example owner reply from the rehearsal mail stand-in.",
          ),
          inReplyTo: message.rfcMessageId,
          references: message.rfcMessageId,
          extra: body?.automatic === true ? ["Auto-Submitted: auto-replied"] : [],
        }),
        threadId: message.threadId,
        labelIds: ["INBOX", "UNREAD"],
      });
      return {
        mailbox: mailbox.email,
        threadId: reply.threadId,
        messageId: reply.id,
        from,
      };
    }
    if (name === "bounce") {
      const { mailbox, message } = sentTarget(body ?? {});
      const bounce = addBounce(mailbox, message);
      return { mailbox: mailbox.email, threadId: bounce.threadId, messageId: bounce.id };
    }
    if (name === "send-draft") {
      // Staff sent the draft from Gmail: it leaves Drafts and becomes a sent message.
      const mailboxes = body?.mailbox
        ? [mailboxOf(body.mailbox)]
        : [...state.mail.mailboxes.values()];
      const held = mailboxes.flatMap((mailbox) =>
        [...mailbox.drafts.values()]
          .filter((draft) => !body?.draftId || draft.id === body.draftId)
          .map((draft) => ({ mailbox, draft })),
      );
      if (!held.length) refuse(404, "No unsent draft matches.");
      const { mailbox, draft } = held.at(-1);
      const message = mailbox.messages.get(draft.messageId);
      message.labelIds = ["SENT"];
      message.internalDate = String(Date.now());
      mailbox.drafts.delete(draft.id);
      return {
        mailbox: mailbox.email,
        threadId: message.threadId,
        messageId: message.id,
      };
    }
    if (name === "rewording") {
      if (!REWORDING_MODES.includes(body?.mode))
        refuse(400, `Choose one of: ${REWORDING_MODES.join(", ")}.`);
      if (body.once) state.model.rewordingNext = body.mode;
      else {
        // A standing choice also clears a one-time choice that has not been used yet.
        state.model.rewording = body.mode;
        state.model.rewordingNext = null;
      }
      return {
        rewording: state.model.rewording,
        rewordingNext: state.model.rewordingNext,
      };
    }
    if (name === "hold-comparison") {
      const leaseId = body?.leaseId;
      if (
        !mix?.leases.some((row) => row.lease.leaseID === leaseId) ||
        state.comparison.hold
      )
        refuse(400, "Choose one exact synthetic comparison to hold.");
      state.comparison.hold = { leaseId, entered: false, ...Promise.withResolvers() };
      return { leaseId };
    }
    if (name === "release-comparison") {
      const hold = state.comparison.hold;
      if (!hold || hold.leaseId !== body?.leaseId)
        refuse(400, "Choose the exact held synthetic comparison.");
      state.comparison.hold = null;
      hold.resolve();
      return { leaseId: hold.leaseId, entered: hold.entered };
    }
    if (name === "reset-comparison-log") {
      state.comparison.requests = [];
      return { comparison: { requests: [] } };
    }
    if (name === "reset") {
      // S252: the journey driver starts a builder's phase from the rehearsal's starting state
      // (scripts/lib/one-path-rehearsal/reset.mjs). Every kept message, draft, request and mode
      // goes back to how the stand-ins start; the id counter keeps counting so no id repeats.
      state.comparison.requests = [];
      state.comparison.hold?.resolve();
      state.comparison.hold = null;
      state.model.requests = [];
      state.model.rewording = "accept";
      state.model.rewordingNext = null;
      state.mail.mailboxes = new Map();
      state.mail.nextSend = "normal";
      state.mail.refused = 0;
      state.mail.unreadableThread = null;
      record({ standIn: "control", control: "reset" });
      return describe();
    }
    refuse(404, "The rehearsal has no such control.");
  }

  // ---- HTTP ---------------------------------------------------------------------------------

  function readBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      request.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new StandInRefusal(413, "The request is too large."));
          request.destroy();
        } else chunks.push(chunk);
      });
      request.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (!text) return resolve(undefined);
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new StandInRefusal(400, "The request body is not JSON."));
        }
      });
      request.on("error", reject);
    });
  }

  const server = http.createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    try {
      // A request from anything but this machine is refused, whatever the listener is bound to.
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          request.socket.remoteAddress ?? "",
        )
      )
        refuse(403, "The rehearsal stand-ins answer this machine only.");
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const method = (request.method ?? "GET").toUpperCase();
      const body = method === "GET" ? undefined : await readBody(request);
      if (url.pathname === "/health") return send(200, { ok: true });
      if (url.pathname.startsWith("/rentcast/")) {
        if (method !== "GET") refuse(405, "The comparison stand-in answers reads only.");
        const answer = await comparison(url);
        return answer === undefined
          ? send(404, { error: "not found" })
          : send(200, answer);
      }
      if (url.pathname === "/v1/chat/completions" && method === "POST")
        return send(200, completion(body));
      if (url.pathname.startsWith("/gmail/v1/users/me/"))
        return send(200, mail(method, url, request.headers[MAILBOX_HEADER], body));
      if (url.pathname === "/control/state" && method === "GET")
        return send(200, describe());
      const named = /^\/control\/([a-z-]+)$/.exec(url.pathname)?.[1];
      if (named && method === "POST") return send(200, control(named, body));
      return send(404, { error: "not found" });
    } catch (error) {
      if (error instanceof StandInRefusal)
        return send(error.status, {
          error: { code: error.status, message: error.message },
        });
      record({
        standIn: "error",
        message: String(error?.message ?? error).slice(0, 300),
      });
      return send(500, {
        error: { code: 500, message: "The rehearsal stand-in failed." },
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  record({ standIn: "started", origin });
  return {
    origin,
    describe,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

export const STAND_IN_NEXT_SEND_MODES = NEXT_SEND_MODES;
export const STAND_IN_REWORDING_MODES = REWORDING_MODES;
