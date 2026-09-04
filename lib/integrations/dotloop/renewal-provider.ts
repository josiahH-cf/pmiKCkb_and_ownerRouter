// S34: the concrete `DotloopProvider` over the S106 client.
//
// One approved current renewal packet becomes exactly one loop. The loop NAME is the app-chosen,
// provider-observable identity: it embeds the packet snapshot id (or, absent one, the exact
// idempotency key), so a lost create response reconciles by listing the profile's loops and matching
// that name rather than creating a second loop.
//
// Everything the provider sends comes from the confirmed packet binding and the owner's S106
// selection: the profile, template, transaction type, and initial status are selected values from
// the documented enumerations, participants carry documented roles, and no legal copy, signature
// placement, or signature status is produced here. The official Public API v2 documents no
// e-signature operation, so signature work remains a handoff into Dotloop.

import {
  DOTLOOP_LOOP_NAME_MAX_LENGTH,
  DOTLOOP_PARTICIPANT_ROLES,
  type DotloopClient,
  type DotloopParticipantRole,
  type DotloopTransactionType,
} from "@/lib/integrations/dotloop/client";
import type { DotloopProvider } from "@/lib/lease-renewal/execution/providers";

export const DOTLOOP_LOOP_NAME_PREFIX = "PMI renewal packet";
export const DOTLOOP_PACKET_FOLDER_NAME = "Renewal packet";

/** The owner's S106 selection, plus the documented transaction type and initial status. */
export interface DotloopRenewalSelection {
  readonly profileId: string;
  readonly templateId: string;
  readonly transactionType: DotloopTransactionType;
  readonly initialStatus: string;
}

/** One participant to add, already resolved from the confirmed packet binding. */
export interface DotloopRenewalParticipant {
  readonly fullName: string;
  readonly email: string;
  readonly role: DotloopParticipantRole;
}

/** The exact property address section values, or null when the packet carries none. */
export interface DotloopPropertyAddress {
  readonly streetName: string;
  readonly city: string;
  readonly state: string;
  readonly zip: string;
}

/**
 * The exact loop name for one packet. It is bounded to the documented 200-character limit and is
 * stable for a given identity, so reconciliation and repeat-detection both key on it.
 */
export function dotloopLoopNameFor(identity: string): string {
  const exact = identity.trim();
  if (exact === "")
    throw new Error("A Dotloop loop name needs an exact packet identity.");
  return `${DOTLOOP_LOOP_NAME_PREFIX} ${exact}`.slice(0, DOTLOOP_LOOP_NAME_MAX_LENGTH);
}

export interface LiveDotloopProviderDeps {
  readonly client: DotloopClient;
  readonly selection: DotloopRenewalSelection;
  /** Resolved from the confirmed packet binding; an empty list blocks before any provider call. */
  readonly participants: readonly DotloopRenewalParticipant[];
  readonly propertyAddress?: DotloopPropertyAddress | null;
  /** The packet snapshot id when the caller has it; otherwise the idempotency key names the loop. */
  readonly packetSnapshotId?: string;
  /**
   * Reads one approved S66 artifact's exact bytes. Absent, `uploadDocument` refuses with that exact
   * reason rather than pretending: this provider transports approved content, it never invents it.
   */
  readonly artifactContent?: (documentRef: string) => Promise<{
    fileName: string;
    contentType: string;
    content: Uint8Array;
  }>;
}

export class LiveDotloopProvider implements DotloopProvider {
  readonly #deps: LiveDotloopProviderDeps;
  readonly #documentFolders = new Map<string, string>();

  constructor(deps: LiveDotloopProviderDeps) {
    this.#deps = deps;
  }

  /** The provider-observable identity this provider names its loop with. */
  loopName(idempotencyKey: string): string {
    return dotloopLoopNameFor(this.#deps.packetSnapshotId ?? idempotencyKey);
  }

  async createLoop(input: {
    templateRef: string;
    participantRefs: readonly string[];
    idempotencyKey: string;
  }): Promise<{ loopRef: string }> {
    const { client, selection, participants } = this.#deps;
    if (input.templateRef !== selection.templateId) {
      throw new Error(
        "The confirmed template does not match the selected Dotloop renewal template.",
      );
    }
    if (participants.length === 0) {
      throw new Error("A Dotloop loop needs at least one resolved participant.");
    }
    for (const participant of participants) {
      if (!participant.email.includes("@")) {
        throw new Error("Every Dotloop participant needs a verified email address.");
      }
      if (!DOTLOOP_PARTICIPANT_ROLES.includes(participant.role)) {
        throw new Error("Every Dotloop participant needs a documented role.");
      }
    }

    const name = this.loopName(input.idempotencyKey);
    // A lost response is reconciled by name, so check before creating a second loop.
    const existing = await this.#findByName(name);
    if (existing) return { loopRef: existing };

    const loop = await client.createLoop({
      profileId: selection.profileId,
      name,
      templateId: selection.templateId,
      transactionType: selection.transactionType,
      status: selection.initialStatus,
    });

    if (this.#deps.propertyAddress) {
      await client.patchLoopDetail({
        profileId: selection.profileId,
        loopId: loop.id,
        sections: {
          "Property Address": {
            "Street Name": this.#deps.propertyAddress.streetName,
            City: this.#deps.propertyAddress.city,
            "State/Prov": this.#deps.propertyAddress.state,
            "Zip/Postal Code": this.#deps.propertyAddress.zip,
          },
        },
      });
    }
    for (const participant of participants) {
      await client.addParticipant({
        profileId: selection.profileId,
        loopId: loop.id,
        fullName: participant.fullName,
        email: participant.email,
        role: participant.role,
      });
    }
    return { loopRef: loop.id };
  }

  async uploadDocument(input: {
    loopRef: string;
    documentRef: string;
    documentType: string;
    contentHash: string;
    idempotencyKey: string;
  }): Promise<{ documentRef: string }> {
    const { client, selection, artifactContent } = this.#deps;
    if (!artifactContent) {
      throw new Error(
        "The approved artifact content source is not wired, so no document can be uploaded to Dotloop.",
      );
    }
    const folderId = await this.#packetFolder(input.loopRef);
    const artifact = await artifactContent(input.documentRef);
    const uploaded = await client.uploadDocument({
      profileId: selection.profileId,
      loopId: input.loopRef,
      folderId,
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      content: artifact.content,
    });
    return { documentRef: `${input.loopRef}:${folderId}:${uploaded.id}` };
  }

  async #packetFolder(loopRef: string): Promise<string> {
    const cached = this.#documentFolders.get(loopRef);
    if (cached) return cached;
    const folderId = await this.#deps.client.createFolder({
      profileId: this.#deps.selection.profileId,
      loopId: loopRef,
      name: DOTLOOP_PACKET_FOLDER_NAME,
    });
    this.#documentFolders.set(loopRef, folderId);
    return folderId;
  }

  async readLoop(loopRef: string): Promise<{
    loopRef: string;
    templateRef: string;
    participantRefs: readonly string[];
    active: boolean;
  } | null> {
    const { client, selection, participants } = this.#deps;
    const loop = await client.getLoop(selection.profileId, loopRef);
    if (!loop) return null;
    return {
      loopRef: loop.id,
      templateRef: selection.templateId,
      participantRefs: participants.map((participant) => participant.email),
      active: loop.status !== "ARCHIVED",
    };
  }

  /**
   * Read one uploaded document back by its exact composite reference. The provider exposes no
   * content hash of its own, so the caller's confirmed hash is echoed only after the document is
   * observed present in the exact loop folder.
   */
  async readDocument(
    documentRef: string,
    expected?: { documentType: string; contentHash: string },
  ): Promise<{
    documentRef: string;
    loopRef: string;
    documentType: string;
    contentHash: string;
    active: boolean;
  } | null> {
    const [loopRef, folderId, documentId] = documentRef.split(":");
    if (!loopRef || !folderId || !documentId) return null;
    const documents = await this.#deps.client.listFolderDocuments({
      profileId: this.#deps.selection.profileId,
      loopId: loopRef,
      folderId,
    });
    if (!documents.some((document) => document.id === documentId)) return null;
    return {
      documentRef,
      loopRef,
      documentType: expected?.documentType ?? "",
      contentHash: expected?.contentHash ?? "",
      active: true,
    };
  }

  async reconcile(input: {
    actionKey: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string } | null> {
    if (input.actionKey !== "dotloop.loop.create_from_template") return null;
    const found = await this.#findByName(this.loopName(input.idempotencyKey));
    return found ? { providerRef: found } : null;
  }

  async #findByName(name: string): Promise<string | null> {
    const loops = await this.#deps.client.listLoops(this.#deps.selection.profileId, {
      batchSize: 100,
    });
    const match = loops.find((loop) => loop.name === name);
    return match ? match.id : null;
  }
}
