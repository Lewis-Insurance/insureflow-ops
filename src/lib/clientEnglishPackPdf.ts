import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { ClientEnglishPackV1 } from '@/lib/clientEnglishPack';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const BODY_SIZE = 9;
const LINE_HEIGHT = 13;
const FOOTER_TOP = 82;

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function pdfSafe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7e\u00a1-\u00ff]/g, '?');
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function renderClientEnglishPackPdf(
  pack: ClientEnglishPackV1,
  options: { generatedOn: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const generatedOn = new Date(options.generatedOn);
  if (Number.isNaN(generatedOn.getTime())) throw new Error('generatedOn must be a valid date');
  pdf.setTitle('Client coverage summary');
  pdf.setAuthor(pack.agency.name);
  pdf.setCreator('InsureFlow');
  pdf.setProducer('InsureFlow');
  pdf.setCreationDate(generatedOn);
  pdf.setModificationDate(generatedOn);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let exhausted = false;

  const ensure = (height: number): boolean => {
    if (exhausted) return false;
    if (y - height >= FOOTER_TOP) return true;
    if (pdf.getPageCount() >= 2) {
      page.drawText('Additional details are available from your agency.', { x: MARGIN, y: FOOTER_TOP, size: 7, font: regular, color: rgb(0.35, 0.38, 0.42) });
      exhausted = true;
      return false;
    }
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    return true;
  };
  const text = (value: string, opts: { font?: PDFFont; size?: number; indent?: number; gap?: number } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? BODY_SIZE;
    const indent = opts.indent ?? 0;
    const lines = wrap(value, font, size, PAGE_WIDTH - MARGIN * 2 - indent);
    if (!ensure(lines.length * LINE_HEIGHT + (opts.gap ?? 0))) return;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + indent, y, size, font, color: rgb(0.12, 0.15, 0.18) });
      y -= LINE_HEIGHT;
    }
    y -= opts.gap ?? 0;
  };
  const heading = (value: string) => {
    if (!ensure(28)) return;
    y -= 8;
    text(value, { font: bold, size: 13, gap: 4 });
  };
  const carrierChips = (carriers: string[]) => {
    if (!carriers.length) return;
    if (!ensure(30)) return;
    text('Carriers', { font: bold, size: 8, gap: 2 });
    let x = MARGIN;
    const chipHeight = 17;
    for (const carrier of carriers) {
      const label = pdfSafe(carrier);
      const width = Math.min(regular.widthOfTextAtSize(label, 8) + 14, PAGE_WIDTH - MARGIN * 2);
      if (x > MARGIN && x + width > PAGE_WIDTH - MARGIN) {
        y -= chipHeight + 4;
        if (!ensure(chipHeight)) return;
        x = MARGIN;
      }
      page.drawRectangle({
        x,
        y: y - 4,
        width,
        height: chipHeight,
        color: rgb(0.95, 0.96, 0.97),
        borderColor: rgb(0.65, 0.68, 0.71),
        borderWidth: 0.75,
      });
      const visibleLabel = label.length && regular.widthOfTextAtSize(label, 8) <= width - 14
        ? label
        : `${label.slice(0, Math.max(1, Math.floor((width - 20) / 4.5)))}...`;
      page.drawText(visibleLabel, { x: x + 7, y, size: 8, font: regular, color: rgb(0.12, 0.15, 0.18) });
      x += width + 6;
    }
    y -= chipHeight + 5;
  };

  text('Client coverage summary', { font: bold, size: 20, gap: 5 });
  text(pack.insuredName ?? 'Insured name not listed', { font: bold, size: 12 });
  carrierChips(pack.carriers);
  if (pack.policyNumber) text(`Policy number: ${pack.policyNumber}`);
  if (pack.effectiveDate || pack.expirationDate) text(`Effective ${pack.effectiveDate ?? 'not listed'} to ${pack.expirationDate ?? 'not listed'}`);

  heading('What you have');
  for (const coverage of pack.coverages) {
    const details = [coverage.limit && `Limit ${coverage.limit}`, coverage.deductible && `Deductible ${coverage.deductible}`, coverage.premium && `${coverage.premium} of your total`].filter(Boolean).join(' | ');
    text(`${coverage.includedWith ? '  ' : ''}${coverage.name}${coverage.includedWith ? `: Included with ${coverage.includedWith}` : ''}${details ? `. ${details}` : ''}`, { indent: coverage.includedWith ? 12 : 0 });
  }
  for (const vehicle of pack.vehicles) {
    const label = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
    if (label) text(`Vehicle: ${label}`);
  }

  heading('What it costs');
  if (pack.premium.total !== null) text(`Premium: ${money(pack.premium.total)}${pack.premium.frequency ? ` ${pack.premium.frequency}` : ''}`);
  if (!pack.fees.length) text('No separate fees are listed on the documents we reviewed.');
  for (const fee of pack.fees) text(`${fee.label}: ${fee.amount === null ? 'Not listed' : money(fee.amount)}`);
  if (pack.computedTotal !== null) text(`Premium and listed fees: ${money(pack.computedTotal)}`, { font: bold });
  for (const flag of pack.flags) text(flag, { gap: 2 });

  if (pack.changes.length) {
    heading('What changed from your current policy');
    for (const change of pack.changes) text(`${change.label}: ${change.oldValue} to ${change.newValue}`);
  }
  if (pack.keyDetails.length) {
    heading('Worth knowing');
    for (const detail of pack.keyDetails) text(detail);
  }

  const footerPage = pdf.getPages()[pdf.getPageCount() - 1];
  footerPage.drawLine({ start: { x: MARGIN, y: 72 }, end: { x: PAGE_WIDTH - MARGIN, y: 72 }, thickness: 0.5, color: rgb(0.65, 0.68, 0.71) });
  footerPage.drawText(pdfSafe(`${pack.agency.name}${pack.agency.phone ? ` | ${pack.agency.phone}` : ''}`), { x: MARGIN, y: 59, size: 7, font: bold, color: rgb(0.12, 0.15, 0.18) });
  const disclaimerLines = wrap(pack.disclaimer, regular, 7, PAGE_WIDTH - MARGIN * 2);
  disclaimerLines.slice(0, 2).forEach((line, index) => footerPage.drawText(line, { x: MARGIN, y: 48 - index * 9, size: 7, font: regular, color: rgb(0.35, 0.38, 0.42) }));
  footerPage.drawText(pdfSafe(`Generated ${options.generatedOn}`), { x: MARGIN, y: 25, size: 6, font: regular, color: rgb(0.35, 0.38, 0.42) });

  return pdf.save({ useObjectStreams: false, addDefaultPage: false });
}
