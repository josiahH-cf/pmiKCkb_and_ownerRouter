// Hand-written declarations for scripts/source-corpus-readiness.mjs (pure module; no
// filesystem or SDK imports). Consumed by lib/admin/migration-readiness.ts.

export interface SourceManifestEntry {
  space_id: string;
  source_path: string;
  gcs_uri: string;
  data_store_id: string;
  approval_status: string;
  sensitivity: string;
  document_id?: string;
}

export interface SourceCorpusReadiness {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  counts: Record<string, unknown>;
}

export function validateSourceManifest(value: unknown): SourceManifestEntry[];

export function buildSourceCorpusReadiness(
  entries: SourceManifestEntry[],
): SourceCorpusReadiness;
