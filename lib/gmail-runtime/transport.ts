// HTTP transport seam for the Gmail runtime client. The live default uses fetch with a bounded timeout;
// unit tests inject a fake so no real Gmail call is ever made offline (mirrors the RentVine/Drive transport
// idiom). The Authorization header is passed through per request and never logged or returned.

export interface GmailHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  /** Server-owned bound for exact workflow MIME readback; ordinary reads keep the default. */
  maxResponseBytes?: number;
}

export interface GmailHttpResponse {
  status: number;
  json(): Promise<unknown>;
}

export interface GmailHttpTransport {
  send(request: GmailHttpRequest): Promise<GmailHttpResponse>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;

/** Live fetch transport (prod only). Never imported by unit tests. */
export function createGmailFetchTransport(
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
): GmailHttpTransport {
  return {
    async send(request) {
      const bound =
        request.maxResponseBytes === undefined
          ? maxResponseBytes
          : Math.min(12 * 1024 * 1024, Math.max(1, request.maxResponseBytes));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        });
        const declaredLength = Number(response.headers.get("content-length") ?? "0");
        if (declaredLength > bound) {
          throw new Error("Gmail response exceeded the configured size limit.");
        }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader)
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > bound) {
                await reader.cancel();
                throw new Error("Gmail response exceeded the configured size limit.");
              }
              chunks.push(part.value);
            }
          } finally {
            reader.releaseLock();
          }
        const text = Buffer.concat(chunks).toString("utf8");
        return {
          status: response.status,
          json: async () => (text ? JSON.parse(text) : {}),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
