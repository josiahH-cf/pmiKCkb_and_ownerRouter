"""Render the maintained Markdown training/meeting documents as printable handouts.

Run with Python plus reportlab. Outputs are private/local in output/pdf; no live reads.
The flow diagram is a schematic guide, not an app screenshot. Review rendered pages
after changing the Markdown or diagram. No customer values belong in these sources.
"""

from pathlib import Path
import argparse
import html
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable,
)

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/products"
ORANGE = colors.HexColor("#ff6d00")
INK = colors.HexColor("#17242d")
MUTED = colors.HexColor("#475569")
LINE = colors.HexColor("#dce3e8")
PALE = colors.HexColor("#f3f6f8")
STOP = colors.HexColor("#8e3424")
FONT = "Helvetica"
BOLD = "Helvetica-Bold"


def typography(font_dir):
    global FONT, BOLD
    if font_dir:
        regular, bold = Path(font_dir) / "arial.ttf", Path(font_dir) / "arialbd.ttf"
        if not regular.is_file() or not bold.is_file():
            raise ValueError("Font directory must contain arial.ttf and arialbd.ttf")
        pdfmetrics.registerFont(TTFont("Guide", str(regular)))
        pdfmetrics.registerFont(TTFont("GuideBold", str(bold)))
        pdfmetrics.registerFontFamily("Guide", normal="Guide", bold="GuideBold")
        FONT, BOLD = "Guide", "GuideBold"


def styles():
    base = dict(fontName=FONT, textColor=INK, alignment=TA_LEFT)
    return {
        "body": ParagraphStyle("body", **base, fontSize=10.4, leading=14.9, spaceAfter=9),
        "small": ParagraphStyle("small", **base, fontSize=8.5, leading=11.5, spaceAfter=7),
        "h1": ParagraphStyle("h1", fontName=BOLD, textColor=INK, fontSize=24,
                             leading=28, spaceAfter=15, keepWithNext=True),
        "h2": ParagraphStyle("h2", fontName=BOLD, textColor=INK, fontSize=18,
                             leading=22, spaceAfter=13, keepWithNext=True),
        "h3": ParagraphStyle("h3", fontName=BOLD, textColor=INK, fontSize=13,
                             leading=17, spaceBefore=8, spaceAfter=9, keepWithNext=True),
        "cell": ParagraphStyle("cell", **base, fontSize=9.1, leading=12.4),
        "quote": ParagraphStyle("quote", **base, fontSize=11, leading=16,
                                borderColor=ORANGE, borderWidth=0,
                                backColor=PALE, borderPadding=10, spaceAfter=17),
    }


def inline(value):
    value = value.replace("—", " - ").replace("–", "-").replace("\u2011", "-")
    value = value.replace("←", "Back:") if FONT == "Helvetica" else value
    value = html.escape(value)

    def link(match):
        label, destination = match.groups()
        if destination.startswith("https://"):
            return f'<link href="{destination}" color="#174c72"><u>{label}</u></link>'
        if "renewal-client-walkthrough" in destination:
            target = "renewal-training-guide.pdf"
        elif any(part in destination for part in ("client-call-agenda", "wednesday-")):
            target = "wednesday-meeting-brief.pdf"
        else:
            return label
        return f'<link href="{target}" color="#174c72"><u>{label}</u></link>'

    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, value)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    return value


class ProcessMap(Flowable):
    """Main sequence plus all conditional branches from the maintained guide."""

    def __init__(self):
        super().__init__()
        self.width, self.height = 516, 400

    def draw(self):
        c = self.canv
        left, width, right, side = 0, 302, 324, 192

        def para(text, x, y, w, size=9.6, bold=False):
            p = Paragraph(text, ParagraphStyle("map", fontName=BOLD if bold else FONT,
                          fontSize=size, leading=size + 3, textColor=INK))
            _, h = p.wrap(w, 100)
            p.drawOn(c, x, y - h)

        def box(text, y, h=31, x=left, w=width, stop=False):
            c.setFillColor(colors.white if not stop else colors.HexColor("#fff3ed"))
            c.setStrokeColor(STOP if stop else LINE)
            c.roundRect(x, y - h, w, h, 5, fill=1, stroke=1)
            para(text, x + 10, y - 7, w - 20, bold=True)

        def arrow(x, top, bottom, horizontal=None):
            c.setStrokeColor(MUTED)
            c.setFillColor(MUTED)
            c.setLineWidth(1)
            if horizontal is not None:
                c.line(x, top, horizontal, top)
                d = 1 if horizontal > x else -1
                p = c.beginPath()
                p.moveTo(horizontal, top)
                p.lineTo(horizontal - 4*d, top + 2.5)
                p.lineTo(horizontal - 4*d, top - 2.5)
            else:
                c.line(x, top, x, bottom)
                p = c.beginPath()
                p.moveTo(x, bottom)
                p.lineTo(x - 2.5, bottom + 4)
                p.lineTo(x + 2.5, bottom + 4)
            p.close()
            c.drawPath(p, fill=1, stroke=0)

        items = [
            ("1  Choose a lease", False),
            ("2  Verify renewal", False),
            ("3  Owner decision", True),
            ("4  Tenant offer: draft, then Gmail send", False),
            ("5  Record tenant response", False),
            ("7  Document packet", True),
            ("8  Signatures in Dotloop", True),
            ("9  Compliance and verified completion", True),
            ("10  Back to renewals: next lease", False),
        ]
        for index, (label, blocked) in enumerate(items):
            y = 395 - index * 44
            box(label, y, stop=blocked)
            if index < len(items) - 1:
                arrow(150, y - 31, y - 44)

        box("Owner / tenant answers", 307, h=132, x=right, w=side)
        para("Agrees / accepted: continue.<br/><br/>Waiting or unclear: pause.<br/>",
             right + 10, 278, side - 20)
        para("Changes or counteroffer: step 3.<br/><br/>Declined: separate approved non-renewal handoff.",
             right + 10, 237, side - 20)
        arrow(width, 289, 0, horizontal=right)
        arrow(width, 205, 0, horizontal=right)

        box("6  Source changes, if needed", 166, h=79, x=right, w=side)
        para("Admin reviews and confirms each approved effect. Then return to the current phase.",
             right + 10, 137, side - 20)
        c.setStrokeColor(MUTED)
        c.line(width, 192, 313, 192)
        c.line(313, 192, 313, 150)
        arrow(313, 150, 0, horizontal=right)

        para("Tinted stages have an open workflow gap today. Follow the stop instructions.",
             right + 3, 60, side - 6, size=9.1)


class PhaseRail(Flowable):
    """A labelled schematic of the real phase links, with this page's phase marked."""

    def __init__(self, active):
        super().__init__()
        self.width, self.height, self.active = 516, 59, active

    def draw(self):
        c = self.canv
        c.setFillColor(MUTED)
        c.setFont(FONT, 8.3)
        c.drawString(0, 49, "WHERE TO CLICK IN THE WORKSPACE  /  phase links")
        labels = ["Verify renewal", "Owner decision", "Tenant decision",
                  "Document packet", "Signatures", "Compliance"]
        for i, label in enumerate(labels):
            x = i * 86
            c.setFillColor(colors.HexColor("#fff3ed") if i in self.active else PALE)
            c.setStrokeColor(ORANGE if i in self.active else LINE)
            c.roundRect(x, 15, 81, 25, 4, fill=1, stroke=1)
            c.setFillColor(INK)
            c.setFont(BOLD if i in self.active else FONT, 8.1)
            c.drawCentredString(x + 40.5, 24, label)


def table(rows, sty):
    cells = [[Paragraph(inline(t), sty["cell"]) for t in row] for row in rows]
    n = len(rows[0])
    widths = {2: [156, 360], 3: [91, 238, 187], 4: [108, 100, 195, 113],
              5: [118, 80, 74, 115, 129]}.get(n, [516 / n] * n)
    t = Table(cells, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PALE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, ORANGE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def parse(markdown, sty, training=False):
    result = []
    lines = markdown.splitlines()
    i, section = 0, 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith(("~~~", "```")):
            i += 1
            while i < len(lines) and not lines[i].startswith(("~~~", "```")):
                i += 1
            if training:
                result.append(ProcessMap())
                result.append(Spacer(1, 6))
            i += 1
            continue
        if line.startswith("# "):
            result.append(Paragraph(inline(line[2:]), sty["h1"]))
            i += 1
            continue
        if line.startswith("## "):
            section += 1
            if training and section > 1:
                result.append(PageBreak())
            result.append(Paragraph(inline(line[3:]), sty["h2"]))
            phases = {2: [0], 3: [1], 4: [2], 5: [2], 6: [0], 7: [3, 4, 5]}
            if training and section in phases:
                result.append(PhaseRail(phases[section]))
            i += 1
            continue
        if line.startswith("### "):
            result.append(Paragraph(inline(line[4:]), sty["h3"]))
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [s.strip() for s in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"[:\- ]+", s) for s in cells):
                    rows.append(cells)
                i += 1
            result.extend([table(rows, sty), Spacer(1, 12)])
            continue
        quote = line.startswith("> ")
        bullet = line.startswith("- ")
        parts = [line[2:] if quote or bullet else line]
        i += 1
        while i < len(lines) and lines[i].strip():
            nxt = lines[i].strip()
            if nxt.startswith(("#", "|", "- ", "~~~", "```")) or re.match(r"\d+\. ", nxt):
                break
            parts.append(nxt[2:] if quote and nxt.startswith("> ") else nxt)
            i += 1
        body = " ".join(parts)
        prefix = "• " if bullet else ""
        style = sty["quote"] if quote else sty["body"]
        if training and section == 0:
            style = sty["small"]
        if training and section == 1:
            style = sty["small"]
        p = Paragraph(inline(prefix + body), style)
        result.append(p)
    return result


def render(path, story, label):
    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(ORANGE)
        canvas.rect(48, 753, 30, 3, stroke=0, fill=1)
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT, 8)
        canvas.drawString(87, 752, "PMI KC  /  " + label)
        canvas.setStrokeColor(LINE)
        canvas.line(48, 38, 564, 38)
        canvas.drawString(48, 24, "Checked 9 September 2026  |  Read current availability before acting")
        canvas.drawRightString(564, 24, str(doc.page))
        canvas.restoreState()

    doc = SimpleDocTemplate(str(path), pagesize=letter, rightMargin=48, leftMargin=48,
                            topMargin=56, bottomMargin=51, title=label, author="PMI KC",
                            pageCompression=1)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output/pdf")
    parser.add_argument("--font-dir", type=Path)
    args = parser.parse_args()
    typography(args.font_dir)
    sty = styles()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    training = (DOCS / "renewal-client-walkthrough-2026-09-09.md").read_text(encoding="utf-8-sig")
    render(args.output_dir / "renewal-training-guide.pdf", parse(training, sty, training=True),
           "Renewal training guide")
    meeting = []
    sty["body"].fontSize, sty["body"].leading, sty["body"].spaceAfter = 9.7, 13.2, 7
    sty["h1"].fontSize, sty["h1"].leading, sty["h1"].spaceAfter = 20, 24, 11
    sty["h2"].fontSize, sty["h2"].leading, sty["h2"].spaceAfter = 13, 17, 8
    sty["quote"].fontSize, sty["quote"].leading, sty["quote"].spaceAfter = 10, 14, 13
    for filename in ["client-call-agenda-2026-09-09.md", "wednesday-delivery-readout-2026-09-09.md",
                     "wednesday-decisions-and-inputs-2026-09-09.md"]:
        if meeting:
            meeting.append(PageBreak())
        meeting.extend(parse((DOCS / filename).read_text(encoding="utf-8-sig"), sty))
    render(args.output_dir / "wednesday-meeting-brief.pdf", meeting, "Wednesday meeting brief")
    print("Rendered renewal-training-guide.pdf and wednesday-meeting-brief.pdf")


if __name__ == "__main__":
    main()
