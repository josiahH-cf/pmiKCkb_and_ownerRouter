// Speech-to-text seam for maintenance voice capture (S4). Mirrors the ModelProvider seam: a narrow
// `SpeechToTextProvider` so a free dev/test STUB can stand in for Google Cloud Speech-to-Text, selected
// by config and fenced from prod (lib/config/server.ts forces "google" when NODE_ENV=production). The
// Google adapter calls the v1 speech:recognize REST endpoint via google-auth-library (no new SDK dep),
// with an injectable transport + token getter for tests. STT is cost-bearing in prod, so callers gate it
// (auth + audio-size cap); the stub is zero-spend.

import { GoogleAuth } from "google-auth-library";

export interface TranscriptionRequest {
  /** Base64-encoded audio (no data: prefix). */
  audioBase64: string;
  /** Source mime type, e.g. "audio/webm" (MediaRecorder default). */
  mimeType: string;
  languageCode?: string;
}

export interface TranscriptionResult {
  transcript: string;
}

export interface SpeechToTextProvider {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}

export class SpeechSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechSetupError";
  }
}

/** Free dev/test stand-in — returns a canned transcript, no network, no spend. */
export class StubSpeechToTextProvider implements SpeechToTextProvider {
  constructor(private readonly canned = "[dev STT stub] transcript unavailable in this environment.") {}

  async transcribe(): Promise<TranscriptionResult> {
    return { transcript: this.canned };
  }
}

export interface SpeechHttpRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}
export interface SpeechHttpResponse {
  status: number;
  json(): Promise<unknown>;
}
export interface SpeechHttpTransport {
  send(request: SpeechHttpRequest): Promise<SpeechHttpResponse>;
}

function createSpeechFetchTransport(timeoutMs = 30_000): SpeechHttpTransport {
  return {
    async send(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        });
        const text = await response.text();
        return { status: response.status, json: async () => JSON.parse(text) as unknown };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function encodingForMime(mimeType: string): string | undefined {
  const m = mimeType.toLowerCase();
  if (m.includes("webm")) return "WEBM_OPUS";
  if (m.includes("ogg")) return "OGG_OPUS";
  if (m.includes("wav") || m.includes("x-wav")) return "LINEAR16";
  if (m.includes("flac")) return "FLAC";
  return undefined; // let the API infer
}

interface RecognizeResponse {
  results?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
}

export class GoogleSpeechToTextProvider implements SpeechToTextProvider {
  private readonly transport: SpeechHttpTransport;
  private readonly getAccessToken: () => Promise<string>;
  private readonly defaultLanguageCode: string;

  constructor(
    options: {
      languageCode?: string;
      transport?: SpeechHttpTransport;
      getAccessToken?: () => Promise<string>;
    } = {},
  ) {
    this.defaultLanguageCode = options.languageCode ?? "en-US";
    this.transport = options.transport ?? createSpeechFetchTransport();
    this.getAccessToken =
      options.getAccessToken ??
      (async () => {
        const auth = new GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
        const token = await auth.getAccessToken();
        if (!token) {
          throw new SpeechSetupError("Could not obtain a Google access token for Speech-to-Text.");
        }
        return token;
      });
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const token = await this.getAccessToken();
    const encoding = encodingForMime(request.mimeType);
    const response = await this.transport.send({
      method: "POST",
      url: "https://speech.googleapis.com/v1/speech:recognize",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        config: {
          languageCode: request.languageCode ?? this.defaultLanguageCode,
          ...(encoding ? { encoding } : {}),
          enableAutomaticPunctuation: true,
        },
        audio: { content: request.audioBase64 },
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new SpeechSetupError(`Speech-to-Text returned HTTP ${response.status}.`);
    }

    let payload: RecognizeResponse;
    try {
      payload = (await response.json()) as RecognizeResponse;
    } catch {
      throw new SpeechSetupError("Speech-to-Text returned a non-JSON response.");
    }
    const transcript = (payload.results ?? [])
      .map((result) => result.alternatives?.[0]?.transcript ?? "")
      .join(" ")
      .trim();
    return { transcript };
  }
}

/** Build the configured provider. Stub is selected only when config resolved it (prod is fenced to google). */
export function createSpeechToTextProvider(
  config: { speechProvider: "google" | "stub"; speechLanguageCode: string },
  options: { transport?: SpeechHttpTransport; getAccessToken?: () => Promise<string> } = {},
): SpeechToTextProvider {
  if (config.speechProvider === "stub") {
    return new StubSpeechToTextProvider();
  }
  return new GoogleSpeechToTextProvider({
    languageCode: config.speechLanguageCode,
    transport: options.transport,
    getAccessToken: options.getAccessToken,
  });
}
