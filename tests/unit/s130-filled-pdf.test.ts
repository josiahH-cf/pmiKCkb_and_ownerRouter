import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { fillAcroformPdf, readAcroformValues } from "@/lib/lease-documents/acroform-pdf";
import { syntheticAcroform } from "@/tests/fixtures/synthetic-acroform";
import { objectsHolding } from "@/tests/fixtures/synthetic-static";

describe("S130 actual saved PDF output", () => {
  it("fills and independently reopens the saved PDF bytes", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([400, 300]);
    pdf
      .getForm()
      .createTextField("Amount")
      .addToPage(page, { x: 30, y: 100, width: 200, height: 25 });
    const original = await pdf.save();
    const output = await fillAcroformPdf(original, [{ name: "Amount", value: "0" }]);
    expect(Buffer.from(output.content).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await readAcroformValues(output.content)).toMatchObject({ Amount: "0" });
    expect(await readAcroformValues(original)).toMatchObject({ Amount: "" });
    expect(output.outputHash).not.toBe(output.originalHash);
  });
  it("preserves original, all unmapped values and unsigned signatures", async () => {
    const original = await syntheticAcroform(["Amount", "Preserved"]);
    const saved = await fillAcroformPdf(original, [{ name: "Amount", value: "0" }]);
    expect(await readAcroformValues(saved.content)).toEqual({
      Amount: "0",
      Preserved: "",
      "Human signature": null,
    });
    expect(await readAcroformValues(original)).toEqual({
      Amount: "",
      Preserved: "",
      "Human signature": null,
    });
    expect(saved.comparison.unchangedObjects).toBeGreaterThan(0);
  });
  it.each(["JS", "AA", "OpenAction", "XFA", "EmbeddedFiles", "Perms"])(
    "refuses parsed %s in compressed PDFs",
    async (key) => {
      const pdf = await PDFDocument.load(await syntheticAcroform(["Amount"]));
      pdf.catalog.set(PDFName.of(key), PDFString.of("SYNTHETIC"));
      await expect(
        fillAcroformPdf(await pdf.save(), [{ name: "Amount", value: "0" }]),
      ).rejects.toThrow(/unsupported/);
    },
  );
  it.each([
    [{ name: "Missing", value: "0" }],
    [{ name: "Human signature", value: "SYNTHETIC" }],
    [{ name: "Amount", value: "line\nbreak" }],
    [{ name: "Amount", value: "\u4e2d" }],
    [{ name: "Amount", value: "x".repeat(500) }],
    [{ name: "Amount", value: false }],
    [
      { name: "Amount", value: "1" },
      { name: "Amount", value: "2" },
    ],
  ])("fails closed on unsupported targets, values or capacity: %j", async (...values) => {
    await expect(
      fillAcroformPdf(await syntheticAcroform(["Amount"]), values),
    ).rejects.toThrow();
  });
  it("refuses active signatures and read-only fields", async () => {
    const pdf = await PDFDocument.load(await syntheticAcroform(["Amount"]));
    pdf
      .getForm()
      .getField("Human signature")
      .acroField.dict.set(PDFName.of("V"), pdf.context.obj({ Type: "Sig" }));
    await expect(
      fillAcroformPdf(await pdf.save(), [{ name: "Amount", value: "0" }]),
    ).rejects.toThrow(/signature/);
    const readonly = await PDFDocument.load(await syntheticAcroform(["Amount"]));
    readonly.getForm().getField("Amount").enableReadOnly();
    await expect(
      fillAcroformPdf(await readonly.save(), [{ name: "Amount", value: "0" }]),
    ).rejects.toThrow(/protected/);
  });
  it("rejects an escaped active-content key after parsing its decoded name", async () => {
    const pdf = await PDFDocument.load(await syntheticAcroform(["Amount"]));
    pdf.catalog.set(PDFName.of("JS"), PDFString.of("SYNTHETIC"));
    const raw = Buffer.from(await pdf.save({ useObjectStreams: false }))
      .toString("latin1")
      .replace("/JS", "/J#53");
    await expect(
      fillAcroformPdf(Buffer.from(raw, "latin1"), [{ name: "Amount", value: "0" }]),
    ).rejects.toThrow(/unsupported|cannot be parsed/);
  });
  it("preserves false checkboxes and exact enum choices after serialization", async () => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage();
    pdf
      .getForm()
      .createCheckBox("Flag")
      .addToPage(page, { x: 30, y: 30, width: 20, height: 20 });
    const select = pdf.getForm().createDropdown("Choice");
    select.addOptions(["A", "B"]);
    select.addToPage(page, { x: 60, y: 30, width: 100, height: 25 });
    const original = await pdf.save();
    const saved = await fillAcroformPdf(original, [
      { name: "Flag", value: false },
      { name: "Choice", value: "B" },
    ]);
    expect(await readAcroformValues(saved.content)).toEqual({ Flag: false, Choice: "B" });
    await expect(
      fillAcroformPdf(original, [{ name: "Choice", value: "invented" }]),
    ).rejects.toThrow(/existing/);
  });
  it("clears a text value and a selection to the field's empty state, keeping no earlier appearance in the file (R-F10-04)", async () => {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([612, 792]),
      form = pdf.getForm();
    form
      .createTextField("Tenant 1")
      .addToPage(page, { x: 30, y: 700, width: 240, height: 24 });
    const second = form.createTextField("Tenant 2");
    second.addToPage(page, { x: 30, y: 640, width: 240, height: 24 });
    second.setText("Earlier person");
    const kind = form.createDropdown("Kind 2");
    kind.addOptions(["Adult", "Minor"]);
    kind.addToPage(page, { x: 300, y: 640, width: 120, height: 24 });
    kind.select("Minor");
    const pick = form.createRadioGroup("Pick 2");
    pick.addOptionToPage("Yes", page, { x: 450, y: 640, width: 20, height: 20 });
    pick.addOptionToPage("No", page, { x: 490, y: 640, width: 20, height: 20 });
    pick.select("Yes");
    form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica));
    const original = await pdf.save({ useObjectStreams: false });
    const saved = await fillAcroformPdf(original, [
      { name: "Tenant 1", value: "Synthetic A" },
      { name: "Tenant 2", value: "" },
      { name: "Kind 2", value: "" },
      { name: "Pick 2", value: "" },
    ]);
    expect(await readAcroformValues(saved.content)).toEqual({
      "Tenant 1": "Synthetic A",
      "Tenant 2": "",
      "Kind 2": "",
      "Pick 2": "",
    });
    expect(await objectsHolding(original, ["Earlier person"])).not.toEqual([]);
    expect(await objectsHolding(saved.content, ["Earlier person"])).toEqual([]);
    // The option stays in the form's list; no appearance draws the earlier selection.
    expect(await objectsHolding(original, ["Minor"], { streams: true })).not.toEqual([]);
    expect(await objectsHolding(saved.content, ["Minor"], { streams: true })).toEqual([]);
  });
  it("refuses corrupt, truncated, oversized and static files", async () => {
    for (const original of [
      new Uint8Array(),
      Buffer.from("%PDF-1.4\n%%EOF"),
      new Uint8Array(2 * 1024 * 1024 + 1),
      await syntheticAcroform([]),
    ]) {
      await expect(
        fillAcroformPdf(original, [{ name: "Amount", value: "0" }]),
      ).rejects.toThrow();
    }
  });
});
