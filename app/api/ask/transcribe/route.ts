import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { SpeechSetupError, createSpeechToTextProvider } from "@/lib/speech/stt-provider";

// ~8 MB base64 cap (~6 MB audio) bounds per-call Speech-to-Text cost (owner budget safety) and payload
// size. Console dictation clips are short; anything larger is rejected before a billable call. Mirrors
// the maintenance transcribe route (same STT seam: Google Cloud STT in prod, free stub in dev).
const MAX_AUDIO_BASE64 = 8_000_000;

const TranscribeRequestSchema = z.object({
  audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64),
  mimeType: z.string().trim().min(1).default("audio/webm"),
});

// Console voice input: transcribe a short dictation clip. Edit-gated (matches the maintenance seam);
// the stub path is zero-spend. No autonomous action — the transcript only fills the question box.
export async function POST(request: Request) {
  try {
    await requireCapability("edit");
  } catch (error) {
    return authErrorResponse(error);
  }

  // Reject an oversized body via Content-Length BEFORE buffering it into memory. 64KB headroom.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BASE64 + 65_536) {
    return NextResponse.json({ error: "Audio payload too large." }, { status: 413 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = TranscribeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transcribe request." }, { status: 400 });
  }

  try {
    const config = readServerConfig();
    const provider = createSpeechToTextProvider(config);
    const { transcript } = await provider.transcribe({
      audioBase64: parsed.data.audioBase64,
      mimeType: parsed.data.mimeType,
    });
    return NextResponse.json({ transcript });
  } catch (error) {
    if (error instanceof SpeechSetupError) {
      return NextResponse.json(
        { error: error.message, error_type: error.name },
        { status: 503 },
      );
    }
    throw error;
  }
}
