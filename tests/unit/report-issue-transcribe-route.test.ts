import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createProviderMock, transcribeMock } = vi.hoisted(() => ({
  createProviderMock: vi.fn(),
  transcribeMock: vi.fn(),
}));

vi.mock("@/lib/speech/stt-provider", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/speech/stt-provider")>();
  return { ...actual, createSpeechToTextProvider: createProviderMock };
});

import { POST } from "@/app/api/report-issue/transcribe/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { MAX_AUDIO_BASE64_CHARACTERS } from "@/lib/speech/audio-contract";
import { SpeechSetupError } from "@/lib/speech/stt-provider";

const editor = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
  uid: "editor-uid",
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/report-issue/transcribe", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  transcribeMock.mockReset();
  transcribeMock.mockResolvedValue({ transcript: "spoken feedback" });
  createProviderMock.mockReset();
  createProviderMock.mockReturnValue({ transcribe: transcribeMock });
  setAuthResolverForTest(() => editor);
});

afterEach(() => {
  setAuthResolverForTest(() => null);
});

describe("report-issue transcription route (S67)", () => {
  it("requires read capability before provider construction", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST(request({ audioBase64: "QUJD", mimeType: "audio/webm" }));

    expect(response.status).toBe(401);
    expect(createProviderMock).not.toHaveBeenCalled();
  });

  it("passes only validated audio to the established provider and returns only transcript", async () => {
    const response = await POST(
      request({ audioBase64: "QUJD", mimeType: "audio/webm;codecs=opus" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ transcript: "spoken feedback" });
    expect(createProviderMock).toHaveBeenCalledTimes(1);
    expect(transcribeMock).toHaveBeenCalledWith({
      audioBase64: "QUJD",
      mimeType: "audio/webm;codecs=opus",
    });
  });

  it.each([
    {
      body: { audioBase64: "not base64!", mimeType: "audio/webm" },
      label: "invalid base64",
    },
    {
      body: { audioBase64: "QUJD", mimeType: "audio/mp4" },
      label: "unsupported MIME",
    },
    {
      body: {
        audioBase64: "QUJD",
        mimeType: "audio/webm",
        context: { route: "/" },
      },
      label: "extra context",
    },
    { body: { mimeType: "audio/webm" }, label: "missing audio" },
  ])("rejects $label before provider construction", async ({ body }) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid transcription request.",
      code: "invalid_request",
    });
    expect(createProviderMock).not.toHaveBeenCalled();
  });

  it("rejects a declared oversize body before reading or constructing the provider", async () => {
    const body = { audioBase64: "QUJD", mimeType: "audio/webm" };
    const response = await POST(
      request(body, {
        "content-length": String(MAX_AUDIO_BASE64_CHARACTERS + 65_537),
      }),
    );

    expect(response.status).toBe(413);
    expect(createProviderMock).not.toHaveBeenCalled();
  });

  it("rejects actual oversize audio before provider construction", async () => {
    const oversized = "A".repeat(MAX_AUDIO_BASE64_CHARACTERS + 4);
    const response = await POST(
      request({ audioBase64: oversized, mimeType: "audio/webm" }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "payload_too_large" });
    expect(createProviderMock).not.toHaveBeenCalled();
  });

  it("maps provider setup detail to bounded copy without echoing raw detail", async () => {
    transcribeMock.mockRejectedValue(
      new SpeechSetupError(
        "Upstream detail included spoken words",
        "auth",
        "spoken words must not escape",
      ),
    );

    const response = await POST(request({ audioBase64: "QUJD", mimeType: "audio/webm" }));
    const raw = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(raw)).toEqual({
      error: "Feedback dictation could not authenticate. Type instead.",
      code: "auth",
    });
    expect(raw).not.toContain("spoken words");
  });

  it("returns bounded timeout and unknown-provider errors", async () => {
    transcribeMock.mockRejectedValueOnce(new DOMException("secret", "AbortError"));
    const timeout = await POST(request({ audioBase64: "QUJD", mimeType: "audio/ogg" }));
    expect(timeout.status).toBe(503);
    await expect(timeout.json()).resolves.toMatchObject({ code: "provider_timeout" });

    transcribeMock.mockRejectedValueOnce(new Error("provider raw secret"));
    const unavailable = await POST(
      request({ audioBase64: "QUJD", mimeType: "audio/ogg" }),
    );
    const raw = await unavailable.text();
    expect(unavailable.status).toBe(503);
    expect(JSON.parse(raw)).toMatchObject({ code: "provider_unavailable" });
    expect(raw).not.toContain("provider raw secret");
  });
});
