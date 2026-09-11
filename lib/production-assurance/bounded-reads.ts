/** Bounded read scheduling; results keep input order and every started read settles on failure. */
export async function mapAssuranceReads<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  signal: AbortSignal,
  read: (input: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error("assurance_read_concurrency_invalid");
  signal.throwIfAborted();
  const results: Output[] = new Array(inputs.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (next < inputs.length && !failed && !signal.aborted) {
      const index = next++;
      try {
        results[index] = await read(inputs[index], index);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  if (failed) throw failure;
  signal.throwIfAborted();
  return results;
}
