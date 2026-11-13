export const S260_DRIVER: "tests/browser/one-path-november-9-qualification-driver.mjs";
export const S271_DRIVER: "tests/browser/one-path-november-10-qualification-driver.mjs";
export const S284_DRIVER: "tests/browser/one-path-november-12-qualification-driver.mjs";
export const COMPILED_MAIL_DRIVERS: readonly string[];

export interface CompiledMailRequest {
  cwd: string;
  driver: string | null;
  compiled: boolean;
  mailAdapter: boolean;
  overlay: boolean;
  namedCommit: boolean;
  servedSha: string;
  harnessSha: string;
}

/** Whether one rehearsal may build the compiled synthetic mail for its driver. */
export function compiledMailAdmits(request: CompiledMailRequest): boolean;

export function setupCompiledMail(
  request: Omit<CompiledMailRequest, "cwd"> & { clockFile: string },
): {
  token: string;
  now: () => number;
  identity: Record<string, string>;
  environment: Record<string, string>;
  build(run: () => Promise<void>): Promise<void>;
};
