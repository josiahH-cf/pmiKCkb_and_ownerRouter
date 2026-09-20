# App-owned date display inventory (S126, F06)

Convention: every app-controlled full calendar date reads `MM/DD/YYYY`; month-only views read as a
month name and year; audit timestamps read as `MM/DD/YYYY, h:mm AM CDT` in the business time zone
(America/Chicago). Canonical `YYYY-MM-DD` values stay untouched in storage, URLs (`from`, `through`,
`endDate`), sort keys, hashes, provider payloads and receipts. Missing dates read as an explicit
unavailable label (or the surface's existing precise label such as Needs Verification); malformed or
impossible values read as Invalid date, never as zero, the epoch, today or "Invalid Date".

Shared utility: `lib/date-display.ts` (`formatCalendarDate`, `describeCalendarDate`,
`formatCalendarMonth`, `formatCalendarDateRange`, `formatBusinessTimestamp`,
`formatCalendarDateOrTimestamp`). Boundary tests: `tests/unit/s126-date-display.test.ts`. Surface
tests: `tests/unit/s126-date-surfaces.test.tsx`.

| Surface                              | File                                                     | Displays                                                             | Formatter                                                            | Result                                                  |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| Renewal desk table                   | `components/lease-renewal/RenewalDeskTable.tsx`          | Renewal date cell, month-to-month review due, cycle source-date note | `formatCalendarDate` inside `<time dateTime=ISO>`                    | MM/DD/YYYY; ISO kept as the `dateTime` and filter value |
| Renewal desk date filters            | `components/lease-renewal/RenewalDeskTable.tsx`          | Exact date, range start, range end (native pickers)                  | `DateInputHint` companion line                                       | Picker submits ISO; companion echoes MM/DD/YYYY         |
| Lease workspace header and subtitle  | `components/lease-renewal/RenewalWorkspace.tsx`          | Lease end in the identity header and page subtitle                   | `formatCalendarDate`                                                 | MM/DD/YYYY                                              |
| Lease workspace term facts           | `components/lease-renewal/RenewalWorkspace.tsx`          | Lease start/end, month-to-month anchor, next review                  | `formatCalendarDate` with the existing missing labels                | MM/DD/YYYY; Needs Verification / Needs review kept      |
| Lease workspace notice timing (S125) | `components/lease-renewal/RenewalWorkspace.tsx`          | Notice given, target date                                            | `formatCalendarDate` with Not recorded                               | MM/DD/YYYY                                              |
| Lease information panel              | `components/lease-renewal/RenewalLeaseInformation.tsx`   | Month-to-month anchor, next review                                   | `formatCalendarDate`                                                 | MM/DD/YYYY                                              |
| Manual renewal workspace             | `components/lease-renewal/RenewalManualWorkspace.tsx`    | Cycle basis date                                                     | `formatCalendarDate`                                                 | MM/DD/YYYY; date input keeps ISO value                  |
| Cycle source-date labels (S123)      | `lib/lease-renewal/cycle-source-date.ts`                 | Recorded and current lease end in the change notice                  | `formatCalendarDate`                                                 | MM/DD/YYYY                                              |
| Live renewal notices                 | `components/lease-renewal/LiveRenewalNotices.tsx`        | Window end, lease end                                                | `formatCalendarDate`                                                 | MM/DD/YYYY                                              |
| Follow-up status                     | `components/lease-renewal/RenewalFollowUpStatus.tsx`     | Last verified contact (instant), follow-up due (date or instant)     | `formatBusinessTimestamp`, `formatCalendarDateOrTimestamp`           | Instant keeps time and zone; date reads MM/DD/YYYY      |
| Attempt summary card                 | `components/lease-renewal/RenewalAttemptSummaryCard.tsx` | Last attempt (instant)                                               | `formatBusinessTimestamp` with Needs Verification                    | MM/DD/YYYY, time, zone                                  |
| Dotloop packet link panel            | `components/lease-renewal/DotloopPacketLinkPanel.tsx`    | Last read back (instant)                                             | `formatBusinessTimestamp` with Needs Verification                    | MM/DD/YYYY, time, zone                                  |
| Staff work status audit stamp (S119) | `lib/lease-renewal/work-status.ts`                       | Recorded at                                                          | `formatWorkStatusRecordedAt` over `formatBusinessTimestamp`          | MM/DD/YYYY, time, zone; unparseable shown as recorded   |
| Renewal notice dates in message text | `lib/lease-renewal/notice-rules.ts`                      | `formatNoticeDate` used by tenant draft variable text and rule views | `formatCalendarDate`                                                 | MM/DD/YYYY in newly generated text only                 |
| Approval queue                       | `components/approval/ApprovalQueueModel.ts`              | `formatDateTime` for queue timestamps                                | `formatBusinessTimestamp`                                            | MM/DD/YYYY, time, zone                                  |
| Access requests lane                 | `components/approval/AccessRequestsLane.tsx`             | Request timestamps                                                   | `formatBusinessTimestamp` (replaced browser-locale `toLocaleString`) | MM/DD/YYYY, time, zone                                  |
| Access center (Admin)                | `components/admin/AccessCenter.tsx`                      | Request timestamps                                                   | `formatBusinessTimestamp` (replaced browser-locale `toLocaleString`) | MM/DD/YYYY, time, zone                                  |
| Admin activity log                   | `components/admin/AdminActivityLogPanel.tsx`             | Changed at                                                           | `formatBusinessTimestamp`                                            | MM/DD/YYYY, time, zone                                  |
| Runtime suspension panel (Admin)     | `components/admin/RuntimeSuspensionAdminPanel.tsx`       | Changed at                                                           | `formatBusinessTimestamp`                                            | MM/DD/YYYY, time, zone                                  |
| Support reports (Admin)              | `components/admin/SupportReportsPanel.tsx`               | Reported at                                                          | `formatBusinessTimestamp`                                            | MM/DD/YYYY, time, zone                                  |
| Ask correction review                | `components/ask/AskForm.tsx`                             | Reviewed date                                                        | `formatCalendarDate`                                                 | MM/DD/YYYY                                              |
| Maintenance queue history            | `components/maintenance/MaintenanceQueue.tsx`            | History stamps                                                       | `formatBusinessTimestamp`                                            | MM/DD/YYYY, time, zone                                  |
| My Work accountability board         | `components/work/WorkAccountabilityBoard.tsx`            | Task timestamps                                                      | `formatBusinessTimestamp` (replaced host-locale `Intl` with no zone) | MM/DD/YYYY, time, zone                                  |

Left as they are, on purpose:

- `lib/lease-renewal/business-calendar.ts` and `lib/assistant/work-adapter.ts` derive canonical
  business dates (`en-CA` gives ISO); they are semantics, not display.
- Native `type="date"` inputs keep their browser layout; the desk filters gained a companion line
  and every input keeps its ISO value (`LeaseTermReviewControl`, `RenewalManualWorkspace`,
  `RenewalFutureRent`, `RentvineUpdatesPanel`, approval and maintenance date inputs are unchanged
  ISO-valued controls).
- Quoted source email text, immutable historical messages, approved form wording, provider screens
  and historical receipts are not rewritten; hashes over stored evidence are unchanged.
- `docs/products/renewal-operator-guide.md` contains no numeric date format instruction to update.
