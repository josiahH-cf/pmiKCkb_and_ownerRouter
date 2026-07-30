export interface ActionRuntimeRequirement {
  readonly name: string;
  readonly kind: "managed_pmikcmetro_mailbox" | "project_service_account";
  readonly cardinality: "exactly_one";
}

export interface ActionRuntimeRequirementEntry {
  readonly mirroredExecutable: boolean;
  readonly requirements: readonly ActionRuntimeRequirement[];
}

export type ActionRuntimeRequirementRegistry = Readonly<
  Record<string, ActionRuntimeRequirementEntry>
>;

export const ACTION_RUNTIME_REQUIREMENTS: ActionRuntimeRequirementRegistry;

export interface ActionRuntimeProjection {
  runtime_active_keys: string[];
  runtime_inert: Array<{
    key: string;
    missing_runtime_variables: string[];
  }>;
}

export function projectActionRuntimeRequirements(
  runtimeValues?: Record<string, string | undefined>,
  executableByKey?: Readonly<Record<string, boolean | undefined>>,
  registry?: ActionRuntimeRequirementRegistry,
): ActionRuntimeProjection;

export function validateExecutableActionRuntimeRequirements(
  runtimeValues?: Record<string, string | undefined>,
  registry?: ActionRuntimeRequirementRegistry,
): {
  errors: string[];
  ok: boolean;
};
