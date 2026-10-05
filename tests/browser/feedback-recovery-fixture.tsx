"use client";
import { useState } from "react";
import { ReportIssueButton } from "@/components/feedback/ReportIssueButton";
import { ErrorReportPanel } from "@/components/feedback/ErrorReportPanel";

export function FeedbackRecoveryFixture() {
  const [recoveries, setRecoveries] = useState(0);
  return (
    <>
      <section className="panel ui-stack" aria-label="Feedback submission">
        <ReportIssueButton />
      </section>
      <section className="panel ui-stack" aria-label="Crash report submission">
        <ErrorReportPanel
          error={new Error("Local crash fixture")}
          reset={() => setRecoveries((value) => value + 1)}
        />
        <p role="status">Local page recoveries: {recoveries}</p>
      </section>
    </>
  );
}
