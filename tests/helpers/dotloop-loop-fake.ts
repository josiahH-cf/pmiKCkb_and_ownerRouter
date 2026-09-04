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
  archive(loopId: string): void;
}

function jsonResponse(status: number, body: unknown): DotloopHttpResponse {
  return { status, headers: {}, json: async () => body };
}

export function createDotloopLoopFake(): DotloopLoopFake {
  const loops = new Map<string, FakeLoop>();
  let createCount = 0;
  let nextLoop = 0;
  let nextFolder = 0;
  let nextDocument = 0;

  const fake: DotloopLoopFake = {
    loops,
    get createCount() {
      return createCount;
    },
    archive(loopId: string) {
      const loop = loops.get(loopId);
      if (loop) loop.status = "ARCHIVED";
    },
    async fetch(input) {
      const url = new URL(input.url);
      const path = url.pathname;
      const body = input.body ? safeJson(input.body) : null;

      const loopMatch = /\/profile\/[^/]+\/loop\/([^/]+)/.exec(path);
      const loop = loopMatch ? loops.get(loopMatch[1]) : undefined;

      if (input.method === "POST" && /\/profile\/[^/]+\/loop$/.test(path)) {
        createCount += 1;
        nextLoop += 1;
        const id = `loop-${nextLoop}`;
        loops.set(id, {
          id,
          name: String(body?.name ?? ""),
          templateId: String(body?.templateId ?? ""),
          transactionType: String(body?.transactionType ?? ""),
          status: String(body?.status ?? ""),
          participants: [],
          detail: {},
          folders: new Map(),
        });
        return jsonResponse(200, {
          data: { id, name: body?.name, loopUrl: `https://www.dotloop.com/m/loop/${id}` },
        });
      }

      if (input.method === "GET" && /\/profile\/[^/]+\/loop$/.test(path)) {
        return jsonResponse(200, {
          data: [...loops.values()].map((entry) => ({
            id: entry.id,
            name: entry.name,
            status: entry.status,
            loopUrl: `https://www.dotloop.com/m/loop/${entry.id}`,
            participants: entry.participants,
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
          return jsonResponse(200, {
            data: {
              id: loop.id,
              name: loop.name,
              status: loop.status,
              loopUrl: `https://www.dotloop.com/m/loop/${loop.id}`,
              participants: loop.participants,
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
