import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, requireCapabilityInSpace } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { SpeechSetupError, createSpeechToTextProvider } from "@/lib/speech/stt-provider";

// ~8 MB base64 cap (~6 MB audio) bounds per-call Speech-to-Text cost (owner budget safety) and payload
// size. Capture clips are short; anything larger is rejected before a billable call.
const MAX_AUDIO_BASE64 = 8_000_000;

const TranscribeRequestSchema = z.object({
  audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64),
  mimeType: z.string().trim().min(1).default("audio/webm"),
});

// Maintenance voice capture: transcribe a short audio clip via the STT seam (Google Cloud STT in prod,
// free stub in dev). Edit-gated (capture is editor work). The stub path is zero-spend.
export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace("edit", "maintenance");
  } catch (error) {
    return authErrorResponse(error);
  }

  // Reject an oversized body via Content-Length BEFORE buffering it into memory (the Zod cap below only
  // applies after json() has read the whole body). 64KB headroom for the JSON wrapper.
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
        { error: error.message, error_type: error.name, error_code: error.code },
        { status: 503 },
      );
    }
    throw error;
  }
}
