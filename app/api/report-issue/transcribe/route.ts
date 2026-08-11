import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  MAX_AUDIO_BASE64_CHARACTERS,
  TRANSCRIBABLE_AUDIO_MIME_TYPES,
  isPlainBase64,
} from "@/lib/speech/audio-contract";
import {
  SpeechSetupError,
  createSpeechToTextProvider,
  type SpeechSetupErrorCode,
} from "@/lib/speech/stt-provider";

const REQUEST_HEADROOM_CHARACTERS = 65_536;

const TranscribeRequestSchema = z
  .object({
    audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64_CHARACTERS).refine(isPlainBase64),
    mimeType: z.enum(TRANSCRIBABLE_AUDIO_MIME_TYPES),
  })
  .strict();

const SPEECH_ERROR_MESSAGES: Readonly<Record<SpeechSetupErrorCode, string>> = {
  api_disabled: "Feedback dictation is not available right now. Type instead.",
  auth: "Feedback dictation could not authenticate. Type instead.",
  encoding:
    "That recording format could not be transcribed. Record again or type instead.",
  http: "The transcription service could not process the recording. Type instead.",
  config: "Feedback dictation is not configured. Type instead.",
  empty_audio: "No audio was received. Record again or type instead.",
};

/**
 * S67 caller-specific transcription seam. It accepts only the current clip and returns only words;
 * it has no report id, context, persistence, notification, or submission dependency.
 */
export async function POST(request: Request) {
  try {
    await requireCapability("read");
  } catch (error) {
    return authErrorResponse(error);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_AUDIO_BASE64_CHARACTERS + REQUEST_HEADROOM_CHARACTERS
  ) {
    return NextResponse.json(
      { error: "Audio payload too large.", code: "payload_too_large" },
      { status: 413 },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = TranscribeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const oversize =
      typeof payload === "object" &&
      payload !== null &&
      "audioBase64" in payload &&
      typeof payload.audioBase64 === "string" &&
      payload.audioBase64.length > MAX_AUDIO_BASE64_CHARACTERS;
    return NextResponse.json(
      oversize
        ? { error: "Audio payload too large.", code: "payload_too_large" }
        : { error: "Invalid transcription request.", code: "invalid_request" },
      { status: oversize ? 413 : 400 },
    );
  }

  try {
    const provider = createSpeechToTextProvider(readServerConfig());
    const { transcript } = await provider.transcribe(parsed.data);
    return NextResponse.json({ transcript });
  } catch (error) {
    if (error instanceof SpeechSetupError) {
      return NextResponse.json(
        { error: SPEECH_ERROR_MESSAGES[error.code], code: error.code },
        { status: 503 },
      );
    }
    const timeout = error instanceof DOMException && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timeout
          ? "The transcription request timed out. Record again or type instead."
          : "Feedback dictation is unavailable. Type instead.",
        code: timeout ? "provider_timeout" : "provider_unavailable",
      },
      { status: 503 },
    );
  }
}
