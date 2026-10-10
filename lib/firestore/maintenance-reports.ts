import { OPERATING_POLICY_COLLECTIONS as POLICY } from "./maintenance-operating-policy-reader";
import {
  parseOperatingPolicyHead,
  parseOperatingPolicyVersion,
  type OperatingPolicyHead,
  type OperatingPolicyVersion,
} from "@/lib/maintenance/operating-policy";
// Read-only canonical projection; one human save freezes facts and immutable export bytes.
import { createHash } from "node:crypto";
import {
  FieldPath,
  type Firestore,
  type Transaction,
  type Query,
} from "firebase-admin/firestore";
import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import {
  assertMaintenanceCaseActor,
  MAINTENANCE_CASE_COLLECTIONS as CASE,
} from "./maintenance-case-records";
import { MAINTENANCE_TICKET_COLLECTIONS as T } from "./maintenance-tickets";
import {
  MaintenanceReportRequestSchema,
  projectMaintenanceReport,
  maintenanceReportCsv,
  type MaintenanceReport,
  type MaintenanceReportRequest,
  type ReportEvent,
  type ReportArtifact,
  type ReportVendor,
  SaveMaintenanceReportSchema,
  type SaveMaintenanceReportInput,
} from "@/lib/maintenance/report-model";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type { FinancialEntry } from "@/lib/maintenance/case-model";
import { maintenanceReportPdf } from "@/lib/maintenance/report-pdf";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
import {
  FirestorePublicationContentStore,
  publicationContentChunkDocumentId,
} from "@/lib/publication/content";
import type { PublicationContentReference } from "@/lib/publication/types";
const REPORTS = "maintenance_report_snapshots" as const;
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const bytesSha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
export const maintenanceReportSnapshotHash = (report: MaintenanceReport) => {
  const { generatedAt, ...facts } = report;
  void generatedAt;
  return sha(facts);
};
async function completeRead(tx: Transaction, query: Query, maximum: number) {
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let after: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    const page = await tx.get(
      after
        ? query.orderBy(FieldPath.documentId()).startAfter(after).limit(500)
        : query.orderBy(FieldPath.documentId()).limit(500),
    );
    docs.push(...page.docs);
    if (docs.length > maximum)
      throw new EditableLayerError(
        "The complete history exceeds this report's read bound. No truncated report was generated.",
        409,
      );
    if (page.size < 500)
      return docs.map((d) => ({
        ...d.data(),
        id: typeof d.data().id === "string" ? d.data().id : d.id,
        documentId: d.id,
      }));
    after = page.docs.at(-1)!;
  }
}
export async function prepareMaintenanceReport(
  actor: AuthenticatedUser,
  request: MaintenanceReportRequest,
  db: Firestore = getAdminFirestore(),
  generatedAt = new Date().toISOString(),
) {
  assertMaintenanceCaseActor(actor);
  const q = MaintenanceReportRequestSchema.parse(request);
  const source = await db.runTransaction(async (tx) => {
    const [tickets, events, financial, artifacts, vendors, policyHeads, policyVersions] =
      await Promise.all([
        completeRead(
          tx,
          db.collection(T.tickets).where("data_mode", "==", "live"),
          10000,
        ),
        completeRead(tx, db.collection(CASE.events), 20000),
        completeRead(tx, db.collection(CASE.financial), 10000),
        completeRead(tx, db.collection(CASE.artifacts), 10000),
        completeRead(tx, db.collection("vendors"), 5000),
        completeRead(tx, db.collection(POLICY.heads), 5000),
        completeRead(tx, db.collection(POLICY.versions), 20000),
      ]);
    const heads = policyHeads
        .map(parseOperatingPolicyHead)
        .filter((h): h is OperatingPolicyHead => h !== null),
      versions = policyVersions
        .map(parseOperatingPolicyVersion)
        .filter((v): v is OperatingPolicyVersion => v !== null);
    if (heads.length !== policyHeads.length || versions.length !== policyVersions.length)
      throw new EditableLayerError(
        "Current operating policy evidence is incomplete or invalid. No complete report was generated.",
        409,
      );
    return {
      operatingPolicies: { heads, versions },
      tickets: tickets as unknown as MaintenanceTicketRecord[],
      events: events as unknown as ReportEvent[],
      financial: financial as unknown as FinancialEntry[],
      artifacts: artifacts as unknown as ReportArtifact[],
      vendors: vendors as ReportVendor[],
    };
  });
  try {
    const report = projectMaintenanceReport({
      ...source,
      request: q,
      generatedAt,
      complete: true,
    });
    if (Buffer.byteLength(JSON.stringify(report), "utf8") > 700000)
      throw Error(
        "The complete report exceeds the retained snapshot size. Choose a narrower scope or period; no facts were omitted.",
      );
    return { report, snapshotHash: maintenanceReportSnapshotHash(report) };
  } catch (error) {
    throw new EditableLayerError(
      error instanceof Error
        ? error.message
        : "The complete report could not be prepared.",
      409,
    );
  }
}
interface StoredReport {
  id: string;
  actor_uid: string;
  fingerprint: string;
  state: "preparing" | "saved";
  report: MaintenanceReport;
  snapshotHash: string;
  created_at: string;
  pdfHash: string;
  csvHash: string;
  pdf: PublicationContentReference | null;
  csv: PublicationContentReference | null;
  product_retention_class: "indefinite";
  legal_hold: boolean;
}
interface CancelledReport {
  id: string;
  actor_uid: string;
  state: "cancelled";
  created_at: string;
  legal_hold?: boolean;
}
type ReportRecord = StoredReport | CancelledReport;
const view = (r: ReportRecord) =>
  r.state === "cancelled"
    ? {
        id: r.id,
        state: r.state,
        createdAt: r.created_at,
        report: null,
        snapshotHash: null,
        pdfHash: null,
        csvHash: null,
        retentionClass: "indefinite" as const,
        legalHold: r.legal_hold === true,
      }
    : {
        id: r.id,
        state: r.state,
        report: r.report,
        snapshotHash: r.snapshotHash,
        pdfHash: r.pdfHash,
        csvHash: r.csvHash,
        createdAt: r.created_at,
        retentionClass: r.product_retention_class,
        legalHold: r.legal_hold,
      };
function checkOriginal(
  r: ReportRecord,
  actor: AuthenticatedUser,
  fingerprint: string,
): asserts r is StoredReport {
  if (r.actor_uid !== actor.uid)
    throw new EditableLayerError("This original report belongs to another author.", 404);
  if (r.state === "cancelled")
    throw new EditableLayerError(
      "This original report save was stopped before admission. Prepare a new reviewed report identity.",
      409,
    );
  if (r.actor_uid !== actor.uid || r.fingerprint !== fingerprint)
    throw new EditableLayerError(
      "This report identity belongs to different work. Read the original saved result.",
      409,
    );
}
export async function saveMaintenanceReport(
  actor: AuthenticatedUser,
  input: SaveMaintenanceReportInput,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor, true);
  const command = SaveMaintenanceReportSchema.parse(input),
    fingerprint = sha(command),
    ref = db.collection(REPORTS).doc(command.operationId),
    prior = await ref.get();
  let original = prior.exists ? (prior.data() as ReportRecord) : null;
  if (original) {
    checkOriginal(original, actor, fingerprint);
    if (original.state === "saved") return view(original);
  }
  if (!original) {
    const now = Date.now(),
      reviewAt = Date.parse(command.reviewedGeneratedAt);
    if (reviewAt > now || now - reviewAt > 15 * 60 * 1000)
      throw new EditableLayerError(
        "This report review has expired. Keep your selection and prepare fresh facts before saving.",
        409,
      );
    const fresh = await prepareMaintenanceReport(actor, command.request, db);
    if (fresh.snapshotHash !== command.expectedSnapshotHash)
      throw new EditableLayerError(
        "Report facts changed after review. Prepare the current report; the earlier selection was kept.",
        409,
      );
    const report = { ...fresh.report, generatedAt: command.reviewedGeneratedAt };
    const [pdf, csv] = await Promise.all([
      maintenanceReportPdf(report),
      Promise.resolve(Buffer.from(maintenanceReportCsv(report), "utf8")),
    ]);
    if (pdf.length > 5 * 1024 * 1024 || csv.length > 5 * 1024 * 1024)
      throw new EditableLayerError(
        "The complete export exceeds 5 MiB. Choose a narrower report; no rows were omitted.",
        409,
      );
    original = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.exists) {
        const r = current.data() as ReportRecord;
        checkOriginal(r, actor, fingerprint);
        return r;
      }
      const record = stampProductRecordRetention(REPORTS, {
        id: command.operationId,
        actor_uid: actor.uid,
        fingerprint,
        state: "preparing" as const,
        report,
        snapshotHash: command.expectedSnapshotHash,
        created_at: new Date().toISOString(),
        pdfHash: bytesSha(pdf),
        csvHash: bytesSha(csv),
        pdf: null,
        csv: null,
      });
      tx.create(ref, record);
      return record;
    });
  }
  if (original.state === "saved") return view(original);
  const [pdfBytes, csvBytes] = await Promise.all([
    maintenanceReportPdf(original.report),
    Promise.resolve(Buffer.from(maintenanceReportCsv(original.report), "utf8")),
  ]);
  if (bytesSha(pdfBytes) !== original.pdfHash || bytesSha(csvBytes) !== original.csvHash)
    throw new EditableLayerError(
      "Original export bytes could not be reproduced exactly. No original artifact was overwritten.",
      409,
    );
  const store = new FirestorePublicationContentStore(db),
    pdf = await store.putImmutable({
      contentId: `maintenance_artifact_report_${command.operationId}_pdf`,
      contentHash: original.pdfHash,
      content: pdfBytes,
    }),
    csv = await store.putImmutable({
      contentId: `maintenance_artifact_report_${command.operationId}_csv`,
      contentHash: original.csvHash,
      content: csvBytes,
    });
  await Promise.all([store.read(pdf), store.read(csv)]);
  const saved = await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists)
      throw new EditableLayerError("Original report identity is unavailable.", 409);
    const r = current.data() as ReportRecord;
    checkOriginal(r, actor, fingerprint);
    const chunkRefs = [pdf, csv].flatMap((content) =>
      Array.from({ length: content.chunkCount }, (_, index) =>
        db
          .collection("publication_content_chunks")
          .doc(publicationContentChunkDocumentId(content.contentId, index)),
      ),
    );
    const chunks = chunkRefs.length ? await tx.getAll(...chunkRefs) : [];
    for (const chunk of chunks) {
      if (!chunk.exists)
        throw new EditableLayerError(
          "An original export chunk is unavailable. Retain the original save identity.",
          409,
        );
      tx.set(chunk.ref, {
        ...chunk.data(),
        product_retention_policy: "product-record-retention:v1.0",
        product_retention_class: "indefinite",
        legal_hold:
          chunk.data()!.legal_hold === true || current.data()!.legal_hold === true,
      });
    }
    const updated = stampProductRecordRetention(
      REPORTS,
      { ...r, state: "saved" as const, pdf, csv },
      current.data(),
    );
    tx.set(ref, updated);
    return updated;
  });
  return view(saved);
}
export async function readMaintenanceReport(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
  download?: "pdf" | "csv",
) {
  assertMaintenanceCaseActor(actor);
  z.string().uuid().parse(id);
  const read = async () => {
    const snapshot = await db.collection(REPORTS).doc(id).get();
    if (!snapshot.exists)
      throw new EditableLayerError("That retained report is unavailable.", 404);
    const r = snapshot.data() as ReportRecord;
    if (r.state !== "saved" && r.actor_uid !== actor.uid)
      throw new EditableLayerError(
        "The original report preparation is private to its staff author.",
        404,
      );
    return r;
  };
  const r = await read();
  if (!download) return { ...view(r), bytes: null };
  if (r.state !== "saved" || !r[download])
    throw new EditableLayerError(
      "The original exports have not finished saving. Check or resume that original save.",
      409,
    );
  const bytes = await new FirestorePublicationContentStore(db).read(r[download]!);
  await read();
  assertMaintenanceCaseActor(actor);
  return { ...view(r), bytes };
}

export async function stopOriginalMaintenanceReport(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor, true);
  z.string().uuid().parse(id);
  const ref = db.collection(REPORTS).doc(id);
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.exists) {
      const r = current.data() as ReportRecord;
      if (r.actor_uid !== actor.uid)
        throw new EditableLayerError(
          "This original report belongs to another author.",
          404,
        );
      return view(r);
    }
    const cancelled = stampProductRecordRetention(REPORTS, {
      id,
      actor_uid: actor.uid,
      state: "cancelled" as const,
      created_at: new Date().toISOString(),
    });
    tx.create(ref, cancelled);
    return view(cancelled);
  });
}
