import { ALLOWED_HD_DEFAULT } from "@/lib/constants";

export class GmailSubjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailSubjectError";
  }
}

const GMAIL_DOT_ATOM_LOCAL_PART =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;

export function normalizeGmailSubject(
  subject: string,
  options: { allowedDomain?: string } = {},
): string {
  const normalized = subject.trim().toLowerCase();
  const allowedDomain = (options.allowedDomain ?? ALLOWED_HD_DEFAULT).toLowerCase();
  const at = normalized.lastIndexOf("@");
  const localPart = at > 0 ? normalized.slice(0, at) : "";

  if (
    !normalized ||
    at <= 0 ||
    at !== normalized.indexOf("@") ||
    localPart.length > 64 ||
    normalized.length > 254 ||
    !GMAIL_DOT_ATOM_LOCAL_PART.test(localPart) ||
    normalized.slice(at + 1) !== allowedDomain
  ) {
    throw new GmailSubjectError(
      `Gmail access requires a server-verified ${allowedDomain} user.`,
    );
  }

  return normalized;
}
