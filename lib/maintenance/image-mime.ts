// LR-01 (photo-upload safety): image MIME allowlist + magic-byte sniff for the maintenance photo upload.
// The route accepts a caller-declared mimeType, filename, and base64 body that flow VERBATIM into the
// in-boundary Google Drive store (the Drive file name, its stored Content-Type, and its raw bytes). Without
// this, an authenticated editor could store arbitrary content (HTML, a PDF, a script) under an image label
// in that folder. Two checks close it: (1) the declared type must be one of a small image allowlist, and
// (2) the ACTUAL leading bytes must match that declared type — so the stored Content-Type provably
// describes the stored bytes and non-image payloads are refused.

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

// HEIC/HEIF is ISO-BMFF: bytes 4..8 are the "ftyp" box tag and bytes 8..12 are the major brand. Accept the
// common still-image HEIF brands (Apple captures + the MIF/MSF containers).
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
]);

// Decode only a small prefix (32 base64 chars -> 24 bytes) — ample for the longest signature we inspect
// (the HEIC brand ends at byte 12) — so we never materialize the full (up to ~7.5 MB) image twice. Decoded
// the SAME way the store writes it (Buffer.from(base64, "base64")), so these are the exact leading bytes
// that would be stored.
function leadingBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64.slice(0, 32), "base64"));
}

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  signature: readonly number[],
): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(bytes[offset + index]);
  }
  return out;
}

/**
 * The canonical image MIME implied by the leading magic bytes of a base64 payload, or null if the bytes are
 * not a recognized allowed image. Length-guarded so a truncated payload is treated as "not an image".
 */
export function sniffImageMime(base64: string): AllowedImageMimeType | null {
  const bytes = leadingBytes(base64);
  if (bytes.length < 12) return null;

  if (matchesAt(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // WEBP: "RIFF" .... "WEBP" (bytes 0..4 and 8..12).
  if (matchesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && asciiAt(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  // HEIC/HEIF: "ftyp" at byte 4 with a known still-image brand at byte 8.
  if (
    matchesAt(bytes, 4, [0x66, 0x74, 0x79, 0x70]) &&
    HEIF_BRANDS.has(asciiAt(bytes, 8, 4))
  ) {
    return "image/heic";
  }

  return null;
}
