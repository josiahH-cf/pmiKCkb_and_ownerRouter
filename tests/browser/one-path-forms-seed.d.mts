// Types of the S253 rehearsal seed (one-path-forms-seed.mjs), for the checks that import it.

export type OnePathFormKind =
  | "animal_agreement"
  | "owner_acknowledgment"
  | "brokerage_disclosure"
  | "renewal_extension";

export interface OnePathForm {
  kind: OnePathFormKind;
  fileName: string;
  publicationId: string;
  /** `publication:<publicationId>`, the reference the reviewed map names. */
  reference: string;
  bytes: Uint8Array;
  byteSize: number;
  contentHash: string;
  pages: number;
  /** The reviewed map, in the shape `ArtifactFieldMapSchema` parses. */
  fieldMap: Record<string, unknown>;
  mapHash: string;
  documentRef: string;
}

export type OnePathAnimalProfile =
  | "none"
  | "one_pet"
  | "two_pets"
  | "assistance_animal"
  | "pet_and_assistance_animal";

export interface OnePathLease {
  leaseId: string;
  /** How many tenants the lease has; one when absent. */
  tenants?: number;
  animals?: OnePathAnimalProfile;
}

export interface OnePathSeedOptions {
  /** Build the pet agreement whose text states its old fee outside every reviewed region. */
  differingPetAgreement?: boolean;
  /** False leaves the plain renewal extension out. */
  includeRenewalExtension?: boolean;
  leases?: readonly OnePathLease[];
  nowIso?: string;
}

export interface OnePathSeedDocument {
  id: string;
  data: Record<string, unknown>;
}

/** The subset of the Firestore Admin API the seed uses. */
export interface OnePathSeedStore {
  collection(name: string): {
    doc(id: string): {
      set(data: Record<string, unknown>): Promise<unknown>;
      get(): Promise<{ exists: boolean }>;
    };
  };
}

export const ONE_PATH_FORM_FAMILY: string;
export const ONE_PATH_SEED_ACTOR: string;
export const ONE_PATH_OLD_FEE_TEXT: string;
export const ONE_PATH_ORGANIZATIONS: Readonly<
  Record<"animal_agreement" | "owner_acknowledgment" | "brokerage_disclosure", string>
>;
export const ONE_PATH_EXECUTION_DATE_AREA: Readonly<{
  pageIndex: number;
  rect: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;
export const ONE_PATH_FAMILY_USE_STEPS: ReadonlyArray<
  Readonly<{ kind: OnePathFormKind; use: "mandatory" | "conditional" | "not_used" }>
>;
export const ONE_PATH_ANIMAL_PROFILES: readonly OnePathAnimalProfile[];

export function buildOnePathForms(
  options?: Pick<OnePathSeedOptions, "differingPetAgreement" | "includeRenewalExtension">,
): Promise<Record<OnePathFormKind, OnePathForm>>;
export function onePathIntakeEntry(
  form: OnePathForm,
  nowIso: string,
): Record<string, unknown>;
export function onePathPublication(
  form: OnePathForm,
  nowIso: string,
): {
  version: OnePathSeedDocument;
  resource: OnePathSeedDocument;
  chunk: OnePathSeedDocument;
};
export function onePathPacketInputs(
  lease: OnePathLease,
  nowIso: string,
): Record<string, unknown>;
export function onePathPacketInputsDocId(leaseId: string): string;
export function seedOnePathForms(
  db: OnePathSeedStore,
  options?: OnePathSeedOptions,
): Promise<{
  forms: Record<OnePathFormKind, OnePathForm>;
  nowIso: string;
  familyUseSteps: typeof ONE_PATH_FAMILY_USE_STEPS;
}>;
