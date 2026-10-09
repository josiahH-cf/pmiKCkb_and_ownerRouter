"""Parameterised accepted PMI layout. No provider access, downloads or fixed weekly facts."""
import argparse
import hashlib
import json
from datetime import date
from html import escape
from pathlib import Path

import pypdfium2
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#505050")
ORANGE = colors.HexColor("#ff6d00")
PAPER = colors.HexColor("#f4f3f0")
WHITE = colors.white
AUDIT = []


class Page:
    def __init__(self, c, width, height, artifact, number):
        self.c, self.w, self.h, self.artifact, self.n = c, width, height, artifact, number

    def box(self, x, top, width, height, fill=PAPER, radius=10):
        self.c.setFillColor(fill)
        self.c.roundRect(x, self.h - top - height, width, height, radius, stroke=0, fill=1)

    def text(self, value, x, top, width, size=16, weight="Regular", color=INK, max_h=100):
        style = ParagraphStyle("copy", fontName=f"PMI-{weight}", fontSize=size,
                               leading=size * 1.32, textColor=color, splitLongWords=False)
        p = Paragraph(escape(str(value)).replace("\n", "<br/>"), style)
        _, height = p.wrap(width, 2000)
        # Reject long unbreakable tokens as well as vertical overflow.
        longest = max((pdfmetrics.stringWidth(word, f"PMI-{weight}", size) for word in str(value).split()), default=0)
        if height > max_h + .1 or longest > width + .1 or top + height > self.h - 10:
            raise ValueError(f"{self.artifact} page {self.n}: shorten overflowing text: {value}")
        p.drawOn(self.c, x, self.h - top - height)
        AUDIT.append({"artifact": self.artifact, "page": self.n, "text": value,
                      "bbox": [x, top, x + width, top + height], "font_size": size})
        return top + height

    def brand(self, dark=False):
        self.text("pmi.", 48, 27, 90, 24, "Bold", WHITE if dark else INK, 33)
        self.text("KC METRO", 128, 36, 140, 9, "SemiBold", WHITE if dark else MUTED, 15)


def new_canvas(path, size, title):
    c = canvas.Canvas(str(path), pagesize=size, pageCompression=1, invariant=1)
    c.setTitle(title)
    c.setAuthor("PMI KC Metro")
    c.setSubject("Staff check-in; private evidence stored separately")
    return c


def slide(c, n, total, stamp, title, subtitle):
    p = Page(c, 960, 540, "deck", n)
    p.box(0, 0, 960, 540, WHITE, 0)
    p.box(0, 0, 960, 7, ORANGE, 0)
    p.brand()
    p.text("TEAM CHECK-IN", 48, 82, 864, 10, "SemiBold", MUTED, 15)
    p.text(title, 48, 106, 864, 32, "SemiBold", max_h=46)
    p.text(subtitle, 48, 158, 864, 14, color=MUTED, max_h=38)
    p.box(48, 506, 864, 1, colors.HexColor("#dcd9d3"), 0)
    p.text("PMI KC / RENEWAL TEAM CHECK-IN", 48, 516, 500, 8, color=MUTED, max_h=12)
    p.text(f"{stamp} | {n} / {total}", 730, 516, 182, 8, color=MUTED, max_h=12)
    return p


def cards(p, items, empty):
    if not items:
        p.box(48, 216, 864, 238)
        p.text(empty, 76, 249, 808, 23, "Medium", max_h=150)
    for i, item in enumerate(items):
        x, top = 48 + (i % 2) * 442, 210 + (i // 2) * 143
        p.box(x, top, 422, 126)
        p.box(x + 20, top + 18, 4, 28, ORANGE, 0)
        p.text(item["title"], x + 36, top + 15, 366, 18, "SemiBold", max_h=48)
        p.text(item["detail"], x + 20, top + 62, 382, 14, color=MUTED, max_h=42)
        p.text(item["state"].upper(), x + 20, top + 108, 382, 8, "SemiBold", MUTED, 12)


def deck(path, data):
    total, stamp = 6 + len(data["extra_slides"]), data["date"]
    c = new_canvas(path, (960, 540), f"PMI KC check-in | {stamp}")
    p = Page(c, 960, 540, "deck", 1)
    p.box(0, 0, 960, 540, INK, 0)
    p.box(0, 0, 13, 540, ORANGE, 0)
    p.brand(True)
    p.text("TEAM CHECK-IN", 60, 130, 820, 13, "SemiBold", WHITE, 20)
    p.text("Review. Decide.\nKeep work moving.", 60, 172, 830, 46, "SemiBold", WHITE, 140)
    p.text(data["objective"], 60, 330, 810, 22, color=WHITE, max_h=90)
    p.text(f"{date.fromisoformat(stamp).strftime('%A, %d %B %Y')} | {data['minutes']} minutes", 60, 469, 810, 14, color=WHITE, max_h=24)
    c.showPage()
    p = slide(c, 2, total, stamp, "What changed", "Completed work and its practical value. Status labels retain their exact meaning.")
    cards(p, data["changes"], "No new completed work is listed. Use this session to review current priorities.")
    c.showPage()
    p = slide(c, 3, total, stamp, "Connections and decisions", "Open dependencies, owners and the next action are on the action sheet.")
    cards(p, data["blockers"], "No blocker was identified in the reviewed repository sources. Confirm any new dependencies with the team.")
    c.showPage()
    p = slide(c, 4, total, stamp, "Operating picture", "Measurement dates and scope travel with every number.")
    metrics = [{**m, "title": f"{m['value']} | {m['title']}", "detail": f"{m['scope']}. {m['period']}. Measured {m['measured_at']}. {m['type']}."} for m in data["metrics"]]
    cards(p, metrics, "Live operating and billing numbers were not refreshed for this pack. Do not carry forward last week's figures.")
    c.showPage()
    p = slide(c, 5, total, stamp, "Today's workflow", "Choose real work. Record actual findings and leave unrun steps open.")
    steps = data["workflow"]
    if not steps:
        cards(p, [], "Agree which real workflow to review before opening a case.")
    for i, item in enumerate(steps):
        column, row = i // 3, i % 3
        x, top = 48 + column * 221, 215 + row * 88
        p.box(x, top, 201, 80)
        p.text(f"{i + 1:02d}", x + 12, top + 10, 32, 13, "SemiBold", max_h=20)
        p.text(item["title"], x + 46, top + 10, 142, 13, "Medium", max_h=60)
    c.showPage()
    p = slide(c, 6, total, stamp, "What comes next", "Agree priorities and owners. Planned work is labelled explicitly.")
    cards(p, data["next"], "Next priorities need confirmation. Capture the decision and owner during the meeting.")
    c.showPage()
    for n, extra in enumerate(data["extra_slides"], 7):
        p = slide(c, n, total, stamp, extra["title"], "Requested discussion")
        cards(p, extra["items"], "")
        c.showPage()
    c.save()


def handout_header(c, name, number, stamp):
    p = Page(c, 612, 792, name, number)
    p.box(0, 0, 612, 7, ORANGE, 0)
    p.brand()
    p.text(name.replace("-", " ").title(), 48, 83, 516, 27, "SemiBold", max_h=40)
    p.text(f"{stamp} | PMI KC | {number}", 48, 751, 516, 9, color=MUTED, max_h=15)
    return p


AGENDA = ["Review the deck", "Discuss upcoming changes", "Choose the real workflow", "Walk through the work", "Agree actions and owners"]


def handouts(out, data, timings):
    c = new_canvas(out / "agenda.pdf", (612, 792), f"PMI KC agenda | {data['date']}")
    p = handout_header(c, "agenda", 1, data["date"])
    p.text(data["objective"], 48, 136, 516, 16, max_h=65)
    elapsed = 0
    for i, (title, minutes) in enumerate(zip(AGENDA, timings)):
        top = 225 + i * 82
        p.box(48, top, 516, 68)
        p.text(f"{elapsed:02d}-{elapsed + minutes:02d} min", 64, top + 15, 110, 13, "SemiBold", max_h=20)
        p.text(title, 186, top + 14, 360, 16, "Medium", max_h=43)
        elapsed += minutes
    p.text("Use relative times. Record observations only when someone actually performs the step.", 48, 662, 516, 12, color=MUTED, max_h=48)
    c.showPage()
    p = handout_header(c, "walkthrough", 2, data["date"])
    for i, item in enumerate(data["workflow"]):
        top = 137 + i * 47
        p.text(f"{i+1:02d}", 48, top, 32, 10, "SemiBold", max_h=15)
        p.text(item["title"], 86, top, 478, 11, "SemiBold", max_h=16)
        p.text(item["detail"], 86, top + 17, 478, 9, color=MUTED, max_h=27)
    if not data["workflow"]:
        p.text("Workflow steps need agreement before the walkthrough.", 48, 150, 516, 16)
    p.text("Finding / owner / next action: ______________________________________________", 48, 718, 516, 10, max_h=20)
    c.showPage()
    c.save()
    c = new_canvas(out / "actions.pdf", (612, 792), f"PMI KC actions | {data['date']}")
    p = handout_header(c, "blockers-and-actions", 1, data["date"])
    for i, item in enumerate(data["blockers"]):
        top = 138 + i * 132
        p.box(48, top, 516, 119)
        p.text(item["title"], 64, top + 12, 484, 15, "SemiBold", max_h=40)
        p.text(f"Owner: {item['owner']} | {item['state']}", 64, top + 53, 484, 11, max_h=18)
        p.text(f"Next: {item['next_action']}", 64, top + 76, 484, 11, color=MUTED, max_h=33)
    if not data["blockers"]:
        p.text("No blocker identified in the reviewed repository sources. Confirm new issues with the team.", 48, 150, 516, 16)
    p.text("Meeting decisions / owner / due date:", 48, 694, 516, 12, "SemiBold", max_h=20)
    p.box(48, 730, 516, 1, colors.HexColor("#dcd9d3"), 0)
    c.showPage()
    c.save()
    rows, elapsed = [], 0
    for title, minutes in zip(AGENDA, timings):
        rows.append(f"| {elapsed}-{elapsed + minutes} min | {title} |")
        elapsed += minutes
    markdown = f"# PMI KC agenda | {data['date']}\n\n{data['objective']}\n\n| Relative time | Discussion |\n| --- | --- |\n" + "\n".join(rows)
    markdown += "\n\n## Walkthrough\n\n" + "\n".join(f"{i+1}. **{s['title']}**: {s['detail']}" for i, s in enumerate(data["workflow"])) + "\n"
    (out / "agenda.md").write_text(markdown, encoding="utf8")


def render(content, out, fonts, timings):
    out.mkdir(parents=True, exist_ok=False)
    for weight in ["Regular", "Medium", "SemiBold", "Bold"]:
        path = fonts / f"Poppins-{weight}.ttf"
        if not path.is_file():
            raise ValueError(f"Missing supplied font: {path}")
        pdfmetrics.registerFont(TTFont(f"PMI-{weight}", str(path)))
    deck(out / "deck.pdf", content)
    handouts(out, content, timings)
    files, pages = {}, []
    for name, expected, size in [("deck", 6 + len(content["extra_slides"]), (960, 540)), ("agenda", 2, (612, 792)), ("actions", 1, (612, 792))]:
        path = out / f"{name}.pdf"
        reader = PdfReader(path)
        if len(reader.pages) != expected:
            raise ValueError(f"Wrong page count: {name}")
        for page in reader.pages:
            if tuple(float(v) for v in [page.mediabox.width, page.mediabox.height]) != size:
                raise ValueError("Wrong page size")
            if "\ufffd" in page.extract_text():
                raise ValueError("Broken PDF glyph")
        doc = pypdfium2.PdfDocument(path)
        for i in range(len(doc)):
            png = out / f"{name}-{i+1:02d}.png"
            doc[i].render(scale=1.5).to_pil().save(png)
            pages.append(png.name)
        doc.close()
    (out / "layout-audit.json").write_text(json.dumps(AUDIT, indent=2), encoding="utf8")
    for path in sorted(out.iterdir()):
        files[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    result = {"version": 1, "date": content["date"], "deck_pages": 6 + len(content["extra_slides"]), "agenda_minutes": sum(timings), "pages": pages, "files": files, "visual_review": "not_run", "human_observation": "not_run"}
    (out / "manifest.json").write_text(json.dumps(result, indent=2), encoding="utf8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--content", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--font-dir", required=True, type=Path)
    parser.add_argument("--timings", required=True)
    args = parser.parse_args()
    render(json.loads(args.content.read_text(encoding="utf8")), args.output, args.font_dir,
           [int(value) for value in args.timings.split(",")])
