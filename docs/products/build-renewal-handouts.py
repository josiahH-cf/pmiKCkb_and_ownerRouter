"""Render the maintained S113 handouts after documented production release acceptance.

Run with Python/reportlab. This performs no live reads or verification; it requires the current
serving result in docs/status.md. Review every rendered page after changes. Default outputs are
local output/pdf; --output-dir docs/products refreshes the published documentation artifacts.
"""
from pathlib import Path
import argparse
import re
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
ROOT = Path(__file__).resolve().parents[2]

def render_training(path):
    c = canvas.Canvas(str(path), pagesize=(612, 792))
    c.setTitle('PMI KC - Renewal dashboard operator guide')
    c.setAuthor('PMI KC')
    orange = colors.HexColor('#ff6d00')
    ink = colors.HexColor('#17212b')
    light = colors.HexColor('#f3f5f7')
    body = ParagraphStyle('body', fontName='Helvetica', fontSize=10.5, leading=15, textColor=ink, spaceAfter=8)
    small = ParagraphStyle('small', parent=body, fontSize=9, leading=12)
    heading = ParagraphStyle('heading', parent=body, fontName='Helvetica-Bold', fontSize=14, leading=18)

    def p(text, x, y, w=516, style=body):
        q = Paragraph(text, style)
        _, h = q.wrap(w, 700)
        q.drawOn(c, x, y - h)
        return y - h - 10

    def page(n, title, subtitle):
        c.setFillColor(orange)
        c.rect(0, 774, 612, 18, fill=1, stroke=0)
        c.setFillColor(ink)
        c.setFont('Helvetica-Bold', 11)
        c.drawString(48, 744, 'PMI KC  /  LEASE RENEWALS')
        y = p(title, 48, 711, style=ParagraphStyle('title', parent=heading, fontSize=25, leading=29))
        y = p(subtitle, 48, y, style=small)
        c.setStrokeColor(colors.HexColor('#cbd3dc'))
        c.line(48, 45, 564, 45)
        c.setFont('Helvetica', 8)
        c.drawString(48, 30, 'S113 guide - 10 September 2026 - check current release status before use')
        c.drawRightString(564, 30, f'{n} / 3')
        return y - 9
    y = page(1, 'One lease. One dashboard.', 'Use for a fresh renewal or one already underway. Opening a section does not complete it.')
    steps = [('1  Lease details', 'Confirm the exact people, dates and base rent. Compare sources; keep additional charges and listed rent separate.'), ('2  Comps', 'Run RentCast deliberately, inspect comp/trend evidence, and save preparation before asking the owner.'), ('3  Owner', 'Review and copy the owner request or prepare an unsent Gmail draft. Record actual outreach and the exact response.'), ('4  Tenant', 'Use the current owner-approved rent and dates. Review applicable charges and links; record the actual tenant response.'), ('5  Documents and completion', 'Record applicable documents, signatures and follow-ups. Finish with explicit staff-recorded completion.')]
    for title, text in steps:
        c.setFillColor(light)
        c.roundRect(48, y - 72, 516, 72, 8, fill=1, stroke=0)
        c.setFillColor(orange)
        c.rect(48, y - 72, 5, 72, fill=1, stroke=0)
        p(title, 64, y - 10, 480, heading)
        p(text, 64, y - 33, 480, small)
        y -= 85
    p('<b>Decision branches:</b> waiting keeps the lease open; a counteroffer returns to owner review; a decline uses the approved non-renewal handoff.', 48, y, style=small)
    c.showPage()
    y = page(2, 'Do the work, then record it.', 'The same dashboard keeps recorded activity, source changes and provider evidence distinct.')
    blocks = [('Correct a fact', 'In <b>Correct a lease fact</b>, select the fact, reviewed value, source/reason and supported destination. An Editor saves a proposal; the approving role reviews it. Admin confirms each exact source effect and reads its returned result.'), ('Understand separate outcomes', 'An existing-row Sheet update and a RentVine change each have their own preview, confirmation and receipt. A partial success stays partial. Recover an uncertain existing attempt before another write. Corrections use a new current-state preview; row deletion is unavailable.'), ('Prepare the message', 'Use <b>Owner message preparation</b> or <b>Tenant message preparation</b>. Review wording, applicability, separate charges, links and your signature. Save the reviewed preparation. <b>Copy formatted body</b> preserves formatting; <b>Copy plain text</b> supports a manually reviewed portal/text message.'), ('Create an unsent draft', '<b>Preview unsent Gmail draft</b> shows exact recipients, subject, body and any attachment. Confirm only that draft. A person reviews and sends in Gmail. A draft is never evidence of sending; recover an uncertain draft through its exact saved attempt.'), ('Resume and finish', 'Record actual outside work with its source/channel and occurrence evidence. Owner approval and tenant response are separate. <b>Not applicable</b> needs its approved rule and reason; unknown stays unfinished. <b>Record staff completion</b> explicitly means completion recorded by staff. Reopening the page retains the cycle; a later renewal starts a new reviewed cycle.')]
    for title, text in blocks:
        y = p(title, 48, y, style=heading)
        y = p(text, 48, y)
        y -= 5
    if y < 55:
        raise RuntimeError(f'Page 2 overflow: {y}')
    c.showPage()
    y = page(3, 'Links, documents and evidence.', 'Missing team inputs are localized. They do not block the dashboard, manual work or release.')
    blocks = [('Leave unknown links blank', 'The persistent labeled boxes include <b>Insurance flyer</b>, <b>Renewal information form</b>, the resident benefits flyer and all seven legal-form locations. Admin may save verified, applicable HTTPS links later. Blank means pending team input. Blank or unverified values never become customer links or legal content.'), ('Use the exact document handoff', 'The document panel names missing approved forms/mappings, connection/selection and activation gates. S106 owns connection; S34 owns exact loop and upload actions. The Dotloop keys remain closed until their separate gates pass. A location link alone is not an approved publication.'), ('Inspect files before signature work', 'The normal packet preview shows exact participants, mapped facts and included publications. Download and inspect the approved file. Mapped facts shown in the preview do not fill its bytes; review and complete applicable fields in Dotloop before a person sends for signature.'), ('Read evidence honestly', 'A provider receipt proves only its bounded operation. <b>Refresh from Dotloop</b> records loop metadata. A file name proves document presence, not signatures or verified content. A matching loop name without the attempt receipt does not prove creation. Record actual returned signed artifacts through the existing evidence/manual controls.'), ('Facilitator checklist', 'Choose the exact lease; inspect its sources; propose a correction; distinguish source outcomes; recover an uncertain attempt; prepare/copy a message; record outside work; close and reopen the lease. Cover a fresh and an already-started renewal, a counteroffer and missing data. Never create a customer effect just to demonstrate a control.')]
    for title, text in blocks:
        y = p(title, 48, y, style=heading)
        y = p(text, 48, y)
        y -= 3
    if y < 55:
        raise RuntimeError(f'Page 3 overflow: {y}')
    c.save()

def render_brief(path, release_commit, findings):
    c = canvas.Canvas(str(path), pagesize=(612, 792))
    c.setTitle('PMI KC - Wednesday renewal meeting brief')
    c.setAuthor('PMI KC')
    c.setFillColor(colors.HexColor('#ff6d00'))
    c.rect(0, 774, 612, 18, fill=1, stroke=0)
    s = ParagraphStyle('body', fontName='Helvetica', fontSize=10.5, leading=15, textColor=colors.HexColor('#17212b'))

    def para(text, y, bold=False):
        q = Paragraph(text, ParagraphStyle('title' if bold else 'p', parent=s, fontName='Helvetica-Bold' if bold else 'Helvetica', fontSize=15 if bold else 10.5, leading=20 if bold else 15))
        _, height = q.wrap(516, 700)
        q.drawOn(c, 48, y - height)
        return y - height - 12
    y = 744
    y = para('PMI KC / Renewal meeting brief', y, True)
    y = para('Wednesday, 9 September 2026: user-supplied meeting identity. Updated 10 September after the verified S113 production release.', y)
    for title, text in [('Current delivery', f'The consolidated renewal workflow is live. Backend verification, all {findings} review findings, exact-commit CI, candidate assurance, promotion and five-minute observation passed. The three-page operator guide and all 42 control steps passed. Human usability review remains unrecorded.'), ('Walk through one lease', 'Choose the exact lease. Inspect facts and sources. Prepare a correction and distinguish each source result. Review comps and copyable messages. Record actual owner/tenant responses and outside work. Close and reopen the saved cycle; return to the same filtered list. Include waiting, a counteroffer and missing data.'), ('Keep evidence distinct', 'A staff completion record reports actual work. A provider receipt proves only its bounded operation. A draft is unsent; a document name proves presence, not signatures. Every message send stays with a person. Do not create customer effects merely to demonstrate completion.'), ('Accepted pending-team inputs', 'Insurance flyer, renewal information form and approved legal-form location boxes may remain blank. Admin can save verified, applicable links later. Blank or unverified values never become real customer links or legal content. Only the resource-dependent output waits; manual S113 work and release proceed independently.'), ('Document continuation', 'S106 owns real Dotloop credentials, managed connection and resource selection. S34 owns approved forms/mappings and separately activated exact loop/upload effects. Current keys remain closed. The preview does not fill file bytes. A person completes/reviews applicable form fields and sends for signature in Dotloop; actual returned artifacts are recorded separately.'), ('Verified release, actual work', f'Serving commit {release_commit[:7]} passed canonical version, traffic, configuration and backend readbacks. Both supplied templates are approved. No customer completion, live draft, paid comp or signature effect was created for demonstration. Assign only real owners and agreed dates; no commitment is inferred.')]:
        y = para(title, y, True)
        y = para(text, y)
    if y < 55:
        raise RuntimeError(f'Overflow {y}')
    c.setStrokeColor(colors.HexColor('#cbd3dc'))
    c.line(48, 45, 564, 45)
    c.setFillColor(colors.HexColor('#17212b'))
    c.setFont('Helvetica', 8)
    c.drawString(48, 30, 'Read with the current operator guide, delivery readout and input sheet.')
    c.drawRightString(564, 30, '1 / 1')
    c.save()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'output/pdf')
    args = parser.parse_args()
    status = (ROOT / 'docs/status.md').read_text(encoding='utf-8')
    commit = re.search('Production serves `([a-f0-9]{40})`', status)
    findings = re.search('All (\\d+) in-scope adversarial findings are closed', status)
    if not commit or not findings or 'S113 F1-F5 is COMPLETE / DEPLOYED' not in status:
        raise SystemExit('Current documented production acceptance is required; no PDF was written.')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    render_training(args.output_dir / 'renewal-training-guide.pdf')
    render_brief(args.output_dir / 'wednesday-meeting-brief.pdf', commit.group(1), findings.group(1))
    print('Rendered three-page training guide and one-page meeting brief; visual review required.')
if __name__ == '__main__':
    main()
