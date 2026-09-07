export declare const MANAGED_DOMAIN: string;
export declare const PROJECT: string;
export declare const AUTOMATION_PRINCIPAL: string;
export declare const AUTOMATION_SERVICE_ACCOUNT: string;

export interface CanaryIdentity {
  readonly label: "admin" | "editor";
  readonly email: string;
  readonly expectedRole: "Admin" | "Editor";
}

export declare const CANARIES: {
  readonly admin: CanaryIdentity;
  readonly editor: CanaryIdentity;
};

export declare const REQUIRED_ENV_KEYS: readonly string[];

export interface DesignatedIdentities {
  readonly managedDomain: string;
  readonly project: string;
  readonly automationPrincipal: string;
  readonly automationServiceAccount: string;
  readonly canaries: typeof CANARIES;
  readonly requiredEnvKeys: readonly string[];
}

export declare function resolveIdentities(env?: NodeJS.ProcessEnv): DesignatedIdentities;
export declare function isManagedAccount(value: unknown, domain?: string): boolean;
export declare function isProjectServiceAccount(
  value: unknown,
  project?: string,
): boolean;
