/** Shared, caller-neutral limits for short synchronous Speech-to-Text clips. */
export const MAX_AUDIO_BASE64_CHARACTERS = 8_000_000;

/** Browser formats that the established Google STT adapter maps explicitly and accepts. */
export const TRANSCRIBABLE_AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

export type TranscribableAudioMimeType = (typeof TRANSCRIBABLE_AUDIO_MIME_TYPES)[number];

/** Validate plain base64 without decoding or retaining a second audio buffer. */
export function isPlainBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const contentLength = value.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    const code = value.charCodeAt(index);
    const allowed =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (!allowed) return false;
  }
  for (let index = contentLength; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) return false;
  }
  return true;
}
