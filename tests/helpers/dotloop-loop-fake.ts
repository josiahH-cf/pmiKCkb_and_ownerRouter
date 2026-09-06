// S34 test helper: a Dotloop loop/folder/document fake over the documented Public API v2 write and
// read endpoints. Every value is synthetic. It records what the provider actually sent so the
// contract matrix can assert the loop name, template, transaction type, status, participants, and
// address section rather than trusting the provider's own claims.

import type {
  DotloopHttpResponse,
  DotloopHttpTransport,
} from "@/lib/integrations/dotloop/client";

export interface FakeLoop {
  id: string;
  name: string;
  templateId: string;
  transactionType: string;
  status: string;
  participants: { fullName: string; email: string; role: string }[];
  detail: Record<string, Record<string, string>>;
  folders: Map<
    string,
    { id: string; name: string; documents: { id: string; name: string }[] }
  >;
}

export interface DotloopLoopFake extends DotloopHttpTransport {
  readonly loops: Map<string, FakeLoop>;
  readonly createCount: number;
  /** The exact path of every create the provider sent (`/loop-it` versus `/profile/{id}/loop`). */
  readonly createPaths: readonly string[];
  /** Bearer tokens seen on document uploads, in order. */
  readonly uploadAuthorizations: readonly string[];
  /** Answer the next document upload with 401 once, like an expired access token. */
  rejectNextUploadWith401: boolean;
  archive(loopId: string): void;
  /** Seed one loop that some other process created, outside this provider's naming. */
  seedLoop(loop: Pick<FakeLoop, "name"> & Partial<FakeLoop>): FakeLoop;
}

function jsonResponse(status: number, body: unknown): DotloopHttpResponse {
  return { status, headers: {}, json: async () => body };
}

export function createDotloopLoopFake(): DotloopLoopFake {
  const loops = new Map<string, FakeLoop>();
  const createPaths: string[] = [];
  const uploadAuthorizations: string[] = [];
  let createCount = 0;
  let nextLoop = 0;
  let nextFolder = 0;
  let nextDocument = 0;

  function insertLoop(seed: Pick<FakeLoop, "name"> & Partial<FakeLoop>): FakeLoop {
    nextLoop += 1;
    const id = seed.id ?? `loop-${nextLoop}`;
    const loop: FakeLoop = {
      id,
      name: seed.name,
      templateId: seed.templateId ?? "",
      transactionType: seed.transactionType ?? "",
      status: seed.status ?? "",
      participants: seed.participants ?? [],
      detail: seed.detail ?? {},
      folders: seed.folders ?? new Map(),
    };
    loops.set(id, loop);
    return loop;
  }

  const fake: DotloopLoopFake = {
    loops,
    createPaths,
    uploadAuthorizations,
    rejectNextUploadWith401: false,
    get createCount() {
      return createCount;
    },
    archive(loopId: string) {
      const loop = loops.get(loopId);
      if (loop) loop.status = "ARCHIVED";
    },
    seedLoop(seed) {
      return insertLoop(seed);
    },
    async fetch(input) {
      const url = new URL(input.url);
      const path = url.pathname;
      const body = input.body ? safeJson(input.body) : null;

      const loopMatch = /\/profile\/[^/]+\/loop\/([^/]+)/.exec(path);
      const loop = loopMatch ? loops.get(loopMatch[1]) : undefined;

      // Documented `loop-it`: the only create that accepts a template, participants, and address.
      if (input.method === "POST" && /\/loop-it$/.test(path)) {
        if (!url.searchParams.get("profile_id")) {
          return jsonResponse(400, { error: "profile_id required" });
        }
        createCount += 1;
        createPaths.push(`${path}?profile_id=${url.searchParams.get("profile_id")}`);
        const rawParticipants = Array.isArray(body?.participants)
          ? body.participants
          : [];
        const created = insertLoop({
          name: String(body?.name ?? ""),
          templateId: String(body?.templateId ?? ""),
          transactionType: String(body?.transactionType ?? ""),
          status: String(body?.status ?? ""),
          participants: rawParticipants.map((entry) => {
            const record = (entry ?? {}) as Record<string, unknown>;
            return {
              fullName: String(record.fullName ?? ""),
              email: String(record.email ?? ""),
              role: String(record.role ?? ""),
            };
          }),
          detail:
            typeof body?.streetName === "string"
              ? {
                  "Property Address": {
                    "Street Name": String(body.streetName),
                    City: String(body.city ?? ""),
                    "State/Prov": String(body.state ?? ""),
                    "Zip/Postal Code": String(body.zipCode ?? ""),
                  },
                }
              : {},
        });
        return jsonResponse(200, {
          data: {
            id: created.id,
            name: created.name,
            loopUrl: `https://www.dotloop.com/m/loop/${created.id}`,
          },
        });
      }

      // Documented plain create: name, status, and transactionType only (no template).
      if (input.method === "POST" && /\/profile\/[^/]+\/loop$/.test(path)) {
        createCount += 1;
        createPaths.push(path);
        const created = insertLoop({
          name: String(body?.name ?? ""),
          transactionType: String(body?.transactionType ?? ""),
          status: String(body?.status ?? ""),
        });
        return jsonResponse(200, {
          data: {
            id: created.id,
            name: created.name,
            loopUrl: `https://www.dotloop.com/m/loop/${created.id}`,
          },
        });
      }

      // Documented batch pagination: `batch_size` (default 20, max 100) and `batch_number` (from 1).
      if (input.method === "GET" && /\/profile\/[^/]+\/loop$/.test(path)) {
        const batchSize = Math.min(
          100,
          Math.max(1, Number(url.searchParams.get("batch_size") ?? 20) || 20),
        );
        const batchNumber = Math.max(
          1,
          Number(url.searchParams.get("batch_number") ?? 1) || 1,
        );
        const all = [...loops.values()];
        const page = all.slice((batchNumber - 1) * batchSize, batchNumber * batchSize);
        return jsonResponse(200, {
          data: page.map((entry) => ({
            id: entry.id,
            name: entry.name,
            status: entry.status,
            loopUrl: `https://www.dotloop.com/m/loop/${entry.id}`,
          })),
        });
      }

      if (!loop) {
        if (loopMatch) return jsonResponse(404, { error: "not_found" });
      } else {
        if (input.method === "PATCH" && path.endsWith("/detail")) {
          for (const [section, values] of Object.entries(
            (body ?? {}) as Record<string, Record<string, string>>,
          )) {
            loop.detail[section] = values;
          }
          return jsonResponse(200, { data: {} });
        }
        if (input.method === "POST" && path.endsWith("/participant")) {
          loop.participants.push({
            fullName: String(body?.fullName ?? ""),
            email: String(body?.email ?? ""),
            role: String(body?.role ?? ""),
          });
          return jsonResponse(200, { data: { id: loop.participants.length } });
        }
        if (input.method === "GET" && path.endsWith("/participant")) {
          return jsonResponse(200, {
            data: loop.participants.map((participant, index) => ({
              id: index + 1,
              ...participant,
            })),
          });
        }
        if (input.method === "POST" && path.endsWith("/folder")) {
          nextFolder += 1;
          const id = `folder-${nextFolder}`;
          loop.folders.set(id, { id, name: String(body?.name ?? ""), documents: [] });
          return jsonResponse(200, { data: { id, name: body?.name } });
        }
        const documentMatch = /\/folder\/([^/]+)\/document$/.exec(path);
        if (documentMatch) {
          const folder = loop.folders.get(documentMatch[1]);
          if (!folder) return jsonResponse(404, { error: "not_found" });
          if (input.method === "POST") {
            uploadAuthorizations.push(String(input.headers?.authorization ?? ""));
            if (fake.rejectNextUploadWith401) {
              fake.rejectNextUploadWith401 = false;
              return jsonResponse(401, { error: "expired" });
            }
            nextDocument += 1;
            const id = `document-${nextDocument}`;
            folder.documents.push({ id, name: `document-${nextDocument}.pdf` });
            return jsonResponse(200, {
              data: { id, name: `document-${nextDocument}.pdf` },
            });
          }
          return jsonResponse(200, { data: folder.documents });
        }
        if (input.method === "GET") {
          // The documented loop resource carries no template id and no participant list.
          return jsonResponse(200, {
            data: {
              id: loop.id,
              name: loop.name,
              status: loop.status,
              loopUrl: `https://www.dotloop.com/m/loop/${loop.id}`,
            },
          });
        }
      }
      return jsonResponse(404, { error: "not_found" });
    },
  };
  return fake;
}

function safeJson(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
