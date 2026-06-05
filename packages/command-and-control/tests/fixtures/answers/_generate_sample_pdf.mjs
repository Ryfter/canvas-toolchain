// One-shot generator for sample-slides.pdf — a 2-page test fixture used by
// slide_pdf.test.ts. Run via `node tests/fixtures/answers/_generate_sample_pdf.mjs`
// from the package root. Output: tests/fixtures/answers/sample-slides.pdf
//
// Not invoked at test time. Kept committed alongside the PDF so the fixture is
// reproducible if it ever needs to be regenerated.

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);

const page1 = doc.addPage([612, 792]);
page1.drawText('Page 1 content: VLOOKUP introduction', {
  x: 72, y: 720, size: 24, font,
});
page1.drawText('This is the first slide of the sample deck.', {
  x: 72, y: 680, size: 14, font,
});

const page2 = doc.addPage([612, 792]);
page2.drawText('Page 2 content: VLOOKUP example', {
  x: 72, y: 720, size: 24, font,
});
page2.drawText('This is the second slide of the sample deck.', {
  x: 72, y: 680, size: 14, font,
});

const bytes = await doc.save();
const outPath = join(__dirname, 'sample-slides.pdf');
await writeFile(outPath, bytes);
console.log(`Wrote ${outPath} (${bytes.length} bytes, 2 pages)`);
