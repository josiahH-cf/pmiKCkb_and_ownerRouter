"use client";

// Reason-code select (S13 Wave 3 H2). A small shared control for the enumerated decision reason-code
// taxonomy, reused by the resolve form and the write-back approval forms. Optional by design: "Not
// categorized" is the default so the field never blocks a decision. The code is a category, never a
// client value.

import {
  DECISION_REASON_CODES,
  DECISION_REASON_CODE_LABELS,
} from "@/lib/lease-renewal/reason-codes";

export function ReasonCodeSelect({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (value: string) => void }>) {
  return (
    <label>
      Reason code (optional)
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not categorized</option>
        {DECISION_REASON_CODES.map((code) => (
          <option key={code} value={code}>
            {DECISION_REASON_CODE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
