import { describe, expect, it } from "vitest";

import {
  GoogleSpeechToTextProvider,
  SpeechSetupError,
  StubSpeechToTextProvider,
  createSpeechToTextProvider,
  type SpeechHttpRequest,
  type SpeechHttpResponse,
  type SpeechHttpTransport,
  type SpeechToTextProvider,
} from "@/lib/speech/stt-provider";

// STT seam (S4 maintenance voice capture): the free stub stands in for Google Cloud STT, selected by
// config + fenced from prod. The Google adapter is tested with an injected transport (offline/free).

function transport(
  status: number,
  body: unknown,
): SpeechHttpTransport & { last?: SpeechHttpRequest } {
  const t: SpeechHttpTransport & { last?: SpeechHttpRequest } = {
    async send(request: SpeechHttpRequest): Promise<SpeechHttpResponse> {
      t.last = request;
      return { status, json: async () => body };
    },
  };
  return t;
}

describe("StubSpeechToTextProvider", () => {
  it("returns a canned transcript with no network", async () => {
    const provider: SpeechToTextProvider = new StubSpeechToTextProvider("hello");
    const result = await provider.transcribe({
      audioBase64: "x",
      mimeType: "audio/webm",
    });
    expect(result.transcript).toBe("hello");
  });
});

describe("createSpeechToTextProvider", () => {
  it("returns the stub when configured", () => {
    const provider = createSpeechToTextProvider({
      speechProvider: "stub",
      speechLanguageCode: "en-US",
    });
    expect(provider).toBeInstanceOf(StubSpeechToTextProvider);
  });

  it("returns the Google adapter when configured", () => {
    const provider = createSpeechToTextProvider(
      { speechProvider: "google", speechLanguageCode: "en-US" },
      { transport: transport(200, {}), getAccessToken: async () => "t" },
    );
    expect(provider).toBeInstanceOf(GoogleSpeechToTextProvider);
  });
});

describe("GoogleSpeechToTextProvider", () => {
  it("joins recognize alternatives into a transcript and sets WEBM_OPUS encoding", async () => {
    const t = transport(200, {
      results: [
        { alternatives: [{ transcript: "the sink" }] },
        { alternatives: [{ transcript: "is leaking" }] },
      ],
    });
    const provider = new GoogleSpeechToTextProvider({
      transport: t,
      getAccessToken: async () => "tok",
    });

    const result = await provider.transcribe({
      audioBase64: "AAAA",
      mimeType: "audio/webm",
    });

    expect(result.transcript).toBe("the sink is leaking");
    expect(t.last?.headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(t.last?.body ?? "{}").config.encoding).toBe("WEBM_OPUS");
  });

  it("throws SpeechSetupError on a non-2xx response", async () => {
    const provider = new GoogleSpeechToTextProvider({
      transport: transport(403, {}),
      getAccessToken: async () => "tok",
    });
    await expect(
      provider.transcribe({ audioBase64: "AAAA", mimeType: "audio/webm" }),
    ).rejects.toBeInstanceOf(SpeechSetupError);
  });

  it("throws SpeechSetupError on a 2xx with a non-JSON body", async () => {
    const provider = new GoogleSpeechToTextProvider({
      transport: {
        async send() {
          return {
            status: 200,
            json: async () => {
              throw new SyntaxError("not json");
            },
          };
        },
      },
      getAccessToken: async () => "tok",
    });
    await expect(
      provider.transcribe({ audioBase64: "AAAA", mimeType: "audio/webm" }),
    ).rejects.toBeInstanceOf(SpeechSetupError);
  });

  it("returns an empty transcript when there are no results", async () => {
    const provider = new GoogleSpeechToTextProvider({
      transport: transport(200, {}),
      getAccessToken: async () => "tok",
    });
    const result = await provider.transcribe({
      audioBase64: "AAAA",
      mimeType: "audio/mp4",
    });
    expect(result.transcript).toBe("");
  });
});
