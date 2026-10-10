import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { reportMoney, type MaintenanceReport } from "./report-model";
// A standalone export over the frozen model. No source/provider calls or hidden recounts.
export async function maintenanceReportPdf(
  report: MaintenanceReport,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Maintenance history | ${report.scopeLabel}`);
  pdf.setAuthor("PMI KC");
  pdf.setSubject(
    `${report.request.startDate} to ${report.request.endDate}; ${report.timeZone}`,
  );
  pdf.setCreationDate(new Date(report.generatedAt));
  pdf.setModificationDate(new Date(report.generatedAt));
  const normal = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    ink = rgb(0.12, 0.19, 0.24),
    muted = rgb(0.35, 0.4, 0.44),
    accent = rgb(0.04, 0.36, 0.39),
    pale = rgb(0.93, 0.96, 0.96),
    line = rgb(0.82, 0.87, 0.88),
    width = 516,
    left = 48,
    bottom = 55;
  let page!: PDFPage,
    y = 0;
  const safe = (s: string, font: PDFFont) => {
    try {
      font.encodeText(s.replace(/[\r\n\t]/g, " "));
      return s;
    } catch {
      throw Error(
        "PDF generation cannot encode one of the selected names or facts. No incomplete PDF was produced. Download the exact UTF-8 CSV instead.",
      );
    }
  };
  function wrap(value: string, w: number, size = 10, font = normal) {
    const lines: string[] = [];
    for (const paragraph of safe(value, font).replaceAll("\r", "").split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const candidate = current ? current + " " + word : word;
        if (font.widthOfTextAtSize(candidate, size) <= w) {
          current = candidate;
          continue;
        }
        if (current) {
          lines.push(current);
          current = "";
        }
        let fragment = "";
        for (const char of word) {
          if (fragment && font.widthOfTextAtSize(fragment + char, size) > w) {
            lines.push(fragment);
            fragment = "";
          }
          fragment += char;
        }
        current = fragment;
      }
      lines.push(current);
    }
    return lines;
  }
  function newPage() {
    if (pdf.getPageCount() >= 300)
      throw Error(
        "This PDF exceeds 300 pages. Choose a narrower report; no pages were omitted.",
      );
    page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 745, width: 612, height: 47, color: accent });
    page.drawText("MAINTENANCE HISTORY", {
      x: left,
      y: 763,
      size: 11,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(
      safe(
        `${report.scopeLabel} | ${report.request.startDate} to ${report.request.endDate}`,
        normal,
      ),
      { x: left, y: 727, size: 9, font: normal, color: muted },
    );
    y = 704;
  }
  function ensure(height: number) {
    if (y - height < bottom) newPage();
  }
  function text(value: string, size = 10, color = ink, font = normal, w = width) {
    for (const l of wrap(value, w, size, font)) {
      ensure(size * 1.45);
      page.drawText(l, { x: left, y: y - size, size, font, color });
      y -= size * 1.45;
    }
    y -= 4;
  }
  function heading(value: string) {
    ensure(44);
    y -= 12;
    text(value, 14, accent, bold);
  }
  function row(cells: string[], columns: number[], header = false) {
    const size = header ? 9 : 9,
      lh = 13,
      wrapped = cells.map((c, i) =>
        wrap(c, columns[i] - 12, size, header ? bold : normal),
      );
    let offset = 0;
    const total = Math.max(...wrapped.map((x) => x.length));
    if (!header && total * lh + 10 < 600 && y - total * lh - 10 < bottom) {
      newPage();
      row(
        [
          "Case / date",
          "Reviewed work / location",
          "Invoice USD",
          "Owner charge USD",
          "Verified paid USD",
        ],
        columns,
        true,
      );
    }
    while (offset < total) {
      if (y - 28 < bottom) {
        newPage();
        if (!header)
          row(
            [
              "Case / date",
              "Reviewed work / location",
              "Invoice USD",
              "Owner charge USD",
              "Verified paid USD",
            ],
            columns,
            true,
          );
      }
      const capacity = Math.max(1, Math.floor((y - bottom - 10) / lh)),
        take = Math.min(capacity, total - offset),
        height = take * lh + 10;
      page.drawRectangle({
        x: left,
        y: y - height,
        width: columns.reduce((a, b) => a + b, 0),
        height,
        color: header ? pale : rgb(1, 1, 1),
        borderColor: line,
        borderWidth: 0.5,
      });
      let x = left;
      wrapped.forEach((lines, i) => {
        for (let n = 0; n < take; n++) {
          const value = lines[offset + n];
          if (value)
            page.drawText(value, {
              x: x + 6,
              y: y - 15 - n * lh,
              size,
              font: header ? bold : normal,
              color: header ? accent : ink,
            });
        }
        x += columns[i];
      });
      y -= height;
      offset += take;
    }
  }
  newPage();
  text("Maintenance history", 25, ink, bold);
  text(
    `${report.scopeLabel}  •  ${report.request.startDate} to ${report.request.endDate}`,
    12,
  );
  text(
    `Generated ${report.generatedAt} | Business timezone ${report.timeZone}`,
    9,
    muted,
  );
  const cards = [
    ["OPENED", report.counts.opened],
    ["PMI COMPLETED", report.counts.completed],
    ["OPEN AT PERIOD END", report.counts.openAsOfEnd],
  ] as const;
  ensure(64);
  cards.forEach(([label, value], i) => {
    const x = left + i * 176;
    page.drawRectangle({ x, y: y - 57, width: 164, height: 57, color: pale });
    page.drawText(label, { x: x + 12, y: y - 18, size: 8, font: bold, color: accent });
    page.drawText(String(value), {
      x: x + 12,
      y: y - 46,
      size: 24,
      font: bold,
      color: ink,
    });
  });
  y -= 70;
  text(
    `History coverage starts: ${report.coverage.startDate ?? "Unknown"}. ${report.coverage.incomplete ? "Coverage is incomplete for this selection." : "Selected period falls within retained prospective coverage."}`,
    10,
    muted,
  );
  for (const note of report.coverage.notes) text(note, 9, muted);
  heading(`Separate financial totals • ${report.request.financialDateBasis} date basis`);
  const totals = [
    ["Proposed estimates", report.totals.estimateCents],
    ["Vendor quotes", report.totals.quotedCents],
    ["Vendor invoice allocations", report.totals.invoicedCents],
    ["Vendor credit allocations", report.totals.creditsCents],
    ["Reviewed vendor cost", report.totals.reviewedVendorCostCents],
    ["Reviewed PMI markup", report.totals.markupCents],
    ["Reviewed PMI adjustments", report.totals.adjustmentCents],
    ["Reviewed owner charges", report.totals.ownerChargeCents],
    ["Staff payment claims (unverified)", report.totals.claimedPaidCents],
    ["Provider-verified payments", report.totals.verifiedPaidCents],
    ["Balance from verified evidence", report.totals.balanceCents],
  ] as const;
  for (const [label, amount] of totals) text(`${label}: ${reportMoney(amount)}`, 10);
  text(
    `Payment evidence state: ${report.totals.paymentState.replaceAll("_", " ")}. Unreviewed invoices/credits: ${report.totals.unreviewedInvoices}.`,
    9,
    muted,
  );
  if (report.totals.excludedCurrencies.length)
    text(
      `Excluded currencies (not converted): ${report.totals.excludedCurrencies.join(", ")}`,
      9,
      muted,
    );
  heading("Count and date definitions");
  for (const value of Object.values(report.definitions)) text(value, 9, muted);
  heading("Monthly work trend");
  text(
    "Opened and PMI-completed counts. A reopened case can appear in both counts; cancellations are excluded.",
    9,
    muted,
  );
  const maximum = Math.max(1, ...report.trends.flatMap((t) => [t.opened, t.completed]));
  for (const t of report.trends) {
    ensure(49);
    text(
      `${t.month}  Opened ${t.opened} | PMI completed ${t.completed} | Invoice ${reportMoney(t.invoicedCents)} | Owner charge ${reportMoney(t.ownerChargeCents)} | Verified paid ${reportMoney(t.verifiedPaidCents)}`,
      9,
    );
    page.drawRectangle({
      x: left,
      y: y - 7,
      width: Math.max(0.5, (t.opened / maximum) * width),
      height: 5,
      color: accent,
    });
    page.drawRectangle({
      x: left,
      y: y - 15,
      width: Math.max(0.5, (t.completed / maximum) * width),
      height: 5,
      color: rgb(0.5, 0.66, 0.69),
    });
    y -= 24;
  }
  text(
    `Bar axis: 0 to ${maximum} cases. Dark: opened; light: PMI completed. Values above are the text equivalent.`,
    8,
    muted,
  );
  heading("Chronological jobs");
  const columns = [61, 212, 85, 85, 73];
  row(
    [
      "Case / date",
      "Reviewed work / location",
      "Invoice USD",
      "Owner charge USD",
      "Verified paid USD",
    ],
    columns,
    true,
  );
  if (!report.jobs.length)
    text(
      "No scoped work is recorded for this selection. Missing coverage is disclosed above.",
      10,
      muted,
    );
  for (const j of report.jobs)
    row(
      [
        `${j.ticketId}\n${j.openedDate}`,
        `${j.title}\n${j.location}\nStage at end: ${j.stageAsOfEnd.replaceAll("_", " ")}`,
        reportMoney(j.totals.invoicedCents),
        reportMoney(j.totals.ownerChargeCents),
        reportMoney(j.totals.verifiedPaidCents),
      ],
      columns,
    );
  for (const j of report.jobs) {
    heading(`Case ${j.ticketId} • version ${j.ticketVersion}`);
    text(j.location, 12, ink, bold);
    text(
      `Event-date association ${j.association.eventDate}: property ${j.association.propertyId ?? "unknown"}; unit ${j.association.unitId ?? "not applicable"}; lease ${j.association.leaseId ?? "not established"}; owner contact ${j.association.ownerRef ?? "not established"}.`,
      9,
      muted,
    );
    text(
      `Trade: ${j.trade ?? "Not recorded"} | Vendor: ${j.vendor ?? "Not recorded for the selected financial evidence"}`,
      9,
      muted,
    );
    text(
      `Opened ${j.openedDate}; assessment ${j.assessmentDate ?? "not recorded"}; work ${j.workDates.join(", ") || "not recorded"}; PMI completion ${j.completedDates.join(", ") || "none in period"}.`,
      9,
      muted,
    );
    text(j.reviewedScope ?? "Reviewed scope not yet recorded.", 10);
    if (j.responsibility) {
      const r = j.responsibility;
      text(
        `Recorded responsibility v${r.version}: ${r.state}; review at export ${r.reviewAtExport.replaceAll("_", " ")}.`,
        10,
        ink,
        bold,
      );
      text(
        `Policy ${r.policyId ?? "unset"} v${r.policyVersion ?? "unset"}; recorded ${r.recordedAt}. Proposed amount ${reportMoney(r.proposedAmountCents)}. ${r.meaning}.`,
        9,
        muted,
      );
      text(r.amountBasis || "Proposed amount basis not established.", 9, muted);
      for (const a of r.allocations)
        text(
          `${a.party}: ${(a.basisPoints / 100).toFixed(2)}% staff-recorded responsibility.`,
          9,
          muted,
        );
    }
    for (const f of j.financial) {
      text(
        `${f.label}: ${reportMoney(f.amountCents, f.currency)} | ${f.sourceLabel}`,
        10,
        ink,
        bold,
      );
      text(
        `Entry ${f.id} v${f.version}; source ${f.invoiceIdentity ?? "reference retained in authorized case history"}; service ${f.serviceDate}; invoice ${f.invoiceDate ?? "unknown"}; payment ${f.paymentDate ?? "unknown"}; ${f.reviewState}.`,
        8,
        muted,
      );
    }
    if (!j.financial.length)
      text(
        "No financial entries have the selected date basis in this period; amounts remain unknown.",
        9,
        muted,
      );
    for (const d of j.documents) {
      text(`Retained ${d.sourceLabel}: ${d.filename} (${d.mimeType})`, 9);
      text(
        `Document ${d.id}; SHA-256 ${d.sha256}. Current authorized staff access is required.`,
        8,
        muted,
      );
    }
    if (!j.documents.length)
      text("No retained core documents are available for this case.", 9, muted);
    for (const e of j.chronology)
      text(`${e.date} | ${e.label} | ${e.sourceLabel} | event ${e.id}`, 8, muted);
  }
  pdf.getPages().forEach((p, i) => {
    p.drawLine({
      start: { x: left, y: 42 },
      end: { x: 564, y: 42 },
      thickness: 0.5,
      color: line,
    });
    p.drawText(`Prepared for human review | ${i + 1} / ${pdf.getPageCount()}`, {
      x: left,
      y: 28,
      size: 8,
      font: normal,
      color: muted,
    });
  });
  return pdf.save({ useObjectStreams: false });
}
