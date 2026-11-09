const CASES = [
  "N09-01",
  "N09-02",
  "N09-03",
  "N09-04",
  "N09-05",
  "N09-06",
  "N09-07",
  "N09-08",
  "N09-09-Admin",
  "N09-09-Approver",
  "N09-09-Editor",
  "N09-10",
];

export function novemberNineMatrixVerdict({
  run,
  rehearsal,
  compiled,
  results,
  networkRefusals,
  tenantSendProof,
}) {
  const source = rehearsal.servedVersion;
  const exact =
    !rehearsal.overlay &&
    !run.harness_uncommitted &&
    run.served_sha === source &&
    run.harness_sha === source &&
    rehearsal.servedCommit === source &&
    (tenantSendProof || (compiled?.source === source && Boolean(compiled.buildId)));
  const expected = tenantSendProof ? ["N09-07"] : CASES;
  const actual = results.map(({ id }) => id).sort();
  const completeMatrix = JSON.stringify(actual) === JSON.stringify(expected);
  const unsupported = results.some(({ verdict, observed }) => {
    if (verdict === "UNVERIFIED") return false;
    return (
      verdict !== "Yes" ||
      !observed ||
      !Object.keys(observed).length ||
      Boolean(observed.missing)
    );
  });
  const rejected = !exact || !completeMatrix || networkRefusals.length > 0 || unsupported;
  // This is the matrix verdict. The independent Help, verification and delivery gates
  // have their own evidence and cannot become green from browser observations alone.
  const verdict = rejected
    ? "No"
    : results.every((row) => row.verdict === "Yes")
      ? "Yes"
      : "UNVERIFIED";
  return {
    source,
    compiled: rehearsal.compiled,
    buildId: compiled?.buildId ?? null,
    networkRefusals: networkRefusals.length,
    exact,
    completeMatrix,
    fixture: "November 5 mix",
    human: "NOT RUN",
    verdict,
    journeys: results,
  };
}
