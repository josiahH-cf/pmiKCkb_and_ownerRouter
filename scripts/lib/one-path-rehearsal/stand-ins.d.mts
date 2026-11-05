import type { November5Mix } from "./november-5-mix.mjs";

export interface StandInMailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  at: string;
  rfcMessageId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  text: string;
  html: string;
}

export interface StandInState {
  startedAt: string;
  comparison: {
    requests: { at: string; kind: "comparison" | "trend"; leaseId: number | null }[];
    /** How many comparisons each lease id was asked for. */
    comparisonsByLease: Record<string, number>;
  };
  model: {
    requests: { at: string; kind: string }[];
    rewording: string;
    rewordingNext: string | null;
  };
  mail: {
    nextSend: string;
    refusedRecipients: number;
    mailboxes: {
      mailbox: string;
      historyId: string;
      messages: StandInMailMessage[];
      drafts: { id: string; messageId: string; unsent: boolean }[];
    }[];
  };
}

export interface StandIns {
  /** Always http://127.0.0.1 with the port the process listens on. */
  origin: string;
  describe(): StandInState;
  close(): Promise<void>;
}

export const STAND_IN_NEXT_SEND_MODES: readonly string[];
export const STAND_IN_REWORDING_MODES: readonly string[];

export function startStandIns(options?: {
  mix?: November5Mix | null;
  logDir?: string | null;
  port?: number;
}): Promise<StandIns>;
