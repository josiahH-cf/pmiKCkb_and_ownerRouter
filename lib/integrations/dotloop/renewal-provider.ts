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
  DOTLOOP_MAX_BATCH_SIZE,
  DOTLOOP_PARTICIPANT_ROLES,
  type DotloopClient,
  type DotloopParticipantRole,
  type DotloopTransactionType,
} from "@/lib/integrations/dotloop/client";
import type { DotloopProvider } from "@/lib/lease-renewal/execution/providers";

export const DOTLOOP_LOOP_NAME_PREFIX = "PMI renewal packet";
export const DOTLOOP_PACKET_FOLDER_NAME = "Renewal packet";
/**
 * The documented loop list has no name filter, so reconciliation by exact name pages through the
 * profile's loops in documented batches. The bound keeps a runaway profile from turning one
 * confirmation into an unbounded read; reaching it refuses to create rather than risking a second
 * loop.
 */
export const DOTLOOP_RECONCILE_MAX_BATCHES = 50;

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
  /** The exact name this provider created or reconciled each loop under; readback verifies it. */
  readonly #loopNames = new Map<string, string>();

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

    // One documented `loop-it` call carries the template, the participants, and the property
    // address together; the plain loop create documents none of them.
    const loop = await client.createLoop({
      profileId: selection.profileId,
      name,
      templateId: selection.templateId,
      transactionType: selection.transactionType,
      status: selection.initialStatus,
      participants,
      address: this.#deps.propertyAddress
        ? {
            streetName: this.#deps.propertyAddress.streetName,
            city: this.#deps.propertyAddress.city,
            state: this.#deps.propertyAddress.state,
            zipCode: this.#deps.propertyAddress.zip,
          }
        : null,
    });
    this.#loopNames.set(loop.id, name);
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

  /**
   * Read one loop back from what the provider actually exposes. The documented loop resource carries
   * no template id, so the template is attested only through the app-chosen loop NAME (the
   * provider-observable identity this provider created or reconciled the loop under); a loop whose
   * name is not ours reads back with an empty template, which the executor treats as ambiguous.
   * Participants are the documented participant list, never an echo of what was requested.
   */
  async readLoop(loopRef: string): Promise<{
    loopRef: string;
    templateRef: string;
    participantRefs: readonly string[];
    active: boolean;
  } | null> {
    const { client, selection } = this.#deps;
    const loop = await client.getLoop(selection.profileId, loopRef);
    if (!loop) return null;
    const expectedName =
      this.#loopNames.get(loop.id) ??
      (this.#deps.packetSnapshotId
        ? dotloopLoopNameFor(this.#deps.packetSnapshotId)
        : null);
    const observedParticipants = await client.listParticipants(
      selection.profileId,
      loop.id,
    );
    return {
      loopRef: loop.id,
      templateRef:
        expectedName !== null && loop.name === expectedName ? selection.templateId : "",
      participantRefs: observedParticipants
        .map((participant) => participant.email)
        .filter((email) => email !== ""),
      active: loop.status !== "ARCHIVED",
    };
  }

  /**
   * Read one uploaded document back by its exact composite reference. The provider exposes no
   * content hash of its own, so the caller's confirmed type and hash are echoed only after the
   * document is observed present in the exact loop folder; without them the readback carries
   * empty values and can never match a preview.
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

  /**
   * Find the loop carrying an exact name. The documented list has no name filter and no stable
   * default order, so every documented batch is read until the name appears or the list ends. A
   * profile larger than the bound refuses rather than risking a second loop.
   */
  async #findByName(name: string): Promise<string | null> {
    const { client, selection } = this.#deps;
    for (
      let batchNumber = 1;
      batchNumber <= DOTLOOP_RECONCILE_MAX_BATCHES;
      batchNumber += 1
    ) {
      const loops = await client.listLoops(selection.profileId, {
        batchSize: DOTLOOP_MAX_BATCH_SIZE,
        batchNumber,
      });
      const match = loops.find((loop) => loop.name === name);
      if (match) {
        this.#loopNames.set(match.id, name);
        return match.id;
      }
      if (loops.length < DOTLOOP_MAX_BATCH_SIZE) return null;
    }
    throw new Error(
      "Dotloop loop reconciliation did not finish within the bounded page count, so no loop was created; reconcile this profile before confirming again.",
    );
  }
}
