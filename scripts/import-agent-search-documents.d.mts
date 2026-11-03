export interface ImportArguments {
  collection: string;
  createDataStore: boolean;
  dataSchema: string;
  dataStore?: string;
  displayName?: string;
  dryRun: boolean;
  gcsUris: string[];
  sourceGenerations: string[];
  location: string;
  project?: string;
}
export function parseImportArgs(
  argv?: string[],
  env?: Record<string, string | undefined>,
  localEnv?: Record<string, string | undefined>,
): ImportArguments;
export function verifyImportSourceGenerations(
  args: Pick<ImportArguments, "gcsUris" | "sourceGenerations">,
  readGeneration?: (uri: string) => Promise<string>,
): Promise<void>;
export function buildImportDocumentsRequest(input: Partial<ImportArguments>): {
  forceRefreshContent: boolean;
  gcsSource: { dataSchema: string; inputUris: string[] };
  parent: string;
  reconciliationMode: string;
};
