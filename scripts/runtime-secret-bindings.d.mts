export const MAINTENANCE_INTAKE_RUNTIME_SECRET_NAMES: readonly [
  "MAINTENANCE_INTAKE_TOKEN_SECRET",
  "MAINTENANCE_INTAKE_IP_HASH_SALT",
];

export const MAINTENANCE_INTAKE_MIN_SECRET_BYTES: 32;

export interface MaintenanceIntakeSecretValidation {
  configured: boolean;
  errors: string[];
  ok: boolean;
}

export function validateMaintenanceIntakeRuntimeValues(
  env?: Record<string, string | undefined>,
): MaintenanceIntakeSecretValidation;

export function resolveMaintenanceIntakeSecretBindings(
  env?: Record<string, string | undefined>,
): MaintenanceIntakeSecretValidation & {
  bindings: Record<string, string>;
};
