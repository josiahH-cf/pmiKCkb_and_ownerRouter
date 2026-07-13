import { ALLOWED_HD_DEFAULT } from "@/lib/constants";

export class GmailSubjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailSubjectError";
  }
}

export function normalizeGmailSubject(
  subject: string,
  options: { allowedDomain?: string } = {},
): string {
  const normalized = subject.trim().toLowerCase();
  const allowedDomain = (options.allowedDomain ?? ALLOWED_HD_DEFAULT).toLowerCase();
  const at = normalized.lastIndexOf("@");

  if (
    !normalized ||
    at <= 0 ||
    !/^[^@\s\r\n]+@[^@\s\r\n]+$/.test(normalized) ||
    normalized.slice(at + 1) !== allowedDomain
  ) {
    throw new GmailSubjectError(
      `Gmail access requires a server-verified ${allowedDomain} user.`,
    );
  }

  return normalized;
}
