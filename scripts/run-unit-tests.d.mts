// Hand-written declarations for the subset of scripts/run-unit-tests.mjs consumed by
// vitest.config.ts. Keep in sync with the implementation; tests/unit/unit-test-runner.test.mjs
// exercises the real module.

export interface CheckoutWorkerOptions {
  cwd?: string;
  platform?: string;
  procVersion?: string;
  parallelism?: number;
  memoryBytes?: number;
}

export function recommendedWorkers(parallelism?: number, memoryBytes?: number): number;
export function workersForCheckout(options?: CheckoutWorkerOptions): number;
