import { ALLOWED_HD_DEFAULT } from "@/lib/constants";

export class GmailSubjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailSubjectError";
  }
}

export class GmailPilotSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailPilotSetupError";
  }
}

export function normalizeGmailSubject(
  subject: string,
  options: { allowedDomain?: string; pilotUsers?: readonly string[] } = {},
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

  if (
    options.pilotUsers &&
    options.pilotUsers.length > 0 &&
    !options.pilotUsers.map((value) => value.trim().toLowerCase()).includes(normalized)
  ) {
    throw new GmailSubjectError("This mailbox is not enabled for the Gmail pilot.");
  }

  return normalized;
}

export function readGmailPilotUsers(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.GMAIL_PILOT_USERS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function readRequiredGmailPilotUsers(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const pilotUsers = readGmailPilotUsers(env);
  if (pilotUsers.length === 0) {
    throw new GmailPilotSetupError(
      "Gmail access is unavailable until a pilot mailbox is configured.",
    );
  }
  try {
    return pilotUsers.map((subject) => normalizeGmailSubject(subject));
  } catch {
    throw new GmailPilotSetupError(
      "Every configured Gmail pilot must be a valid pmikcmetro.com mailbox.",
    );
  }
}
