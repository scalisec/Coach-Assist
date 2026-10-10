// Fills the official BOMBA score sheet. pdf-lib is passed in (window.PDFLib in the browser,
// require('pdf-lib') in tests) so this file has no loader of its own.

import { HEADER, HV, SLOTS } from './fieldmap.js';

/**
 * @param {object} PDFLib       the pdf-lib module
 * @param {ArrayBuffer|Uint8Array} template  bytes of assets/score_sheet.pdf
 * @param {object} data         from scoreSheetData()
 * @param {object} [opts]       {flatten: false} keeps the form fields (used by tests)
 * @returns {Promise<Uint8Array>} the filled, flattened PDF
 */
export async function fillScoreSheet(PDFLib, template, data, { flatten = true } = {}) {
  const { PDFDocument, StandardFonts, TextAlignment, rgb } = PDFLib;
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const set = (name, value, size, center = false) => {
    if (value == null || value === '') return;
    const f = form.getTextField(name);
    // the inning cells are "comb" fields that space each letter into fixed slots: turn that off
    if (f.isCombed()) f.disableCombing();
    const text = String(value);
    const max = f.getMaxLength();
    f.setText(max ? text.slice(0, max) : text);
    if (size) f.setFontSize(size);
    if (center) f.setAlignment(TextAlignment.Center);
  };

  set(HEADER.division, data.division, 10);
  set(HEADER.team1No, data.team1.no, 9);
  set(HEADER.team1Name, data.team1.name, 10);
  set(HEADER.team2No, data.team2.no, 9);
  set(HEADER.team2Name, data.team2.name, 10);
  set(HEADER.gameNo, data.gameNo, 10);
  set(HEADER.date, data.date, 9);
  set(HEADER.headCoach, data.headCoach, 9);
  data.coaches.slice(0, 3).forEach((c, i) => set(HEADER.coaches[i], c, 9));

  data.slots.slice(0, SLOTS.length).forEach((s, i) => {
    const f = SLOTS[i];
    set(f.num, s.num, 10, true);
    set(f.name, s.name, s.name.length > 20 ? 8 : 10);
    s.pos.slice(0, 7).forEach((p, k) => set(f.pos[k], p, p.length > 2 ? 8 : 10, true));
  });

  form.updateFieldAppearances(helv);
  if (flatten) form.flatten(); // flattened so every phone and printer shows the same thing

  const page = doc.getPages()[0];
  const ink = rgb(0.11, 0.25, 0.66);
  // circle H or V for each team row (the form has no fields for these boxes)
  const circle = (x, y) => page.drawEllipse({ x, y, xScale: 9.5, yScale: 6.5, borderColor: ink, borderWidth: 1.4 });
  circle(data.home ? HV.hX : HV.vX, HV.row1Y);
  circle(data.home ? HV.vX : HV.hX, HV.row2Y);

  if (!data.compliant) {
    const msg = 'NOT FAIR-PLAY COMPLIANT: NEEDS CONVENOR APPROVAL (BOMBA rule 4.3 / 4.5)';
    page.drawText(msg, { x: 306 - bold.widthOfTextAtSize(msg, 8) / 2, y: 781, size: 8, font: bold, color: rgb(0.7, 0.1, 0.1) });
  }
  page.drawText(data.footer, { x: 52, y: 22, size: 6.5, font: helv, color: rgb(0.45, 0.45, 0.45) });

  doc.setTitle(data.title);
  doc.setProducer('CoachAssist');
  return doc.save();
}
