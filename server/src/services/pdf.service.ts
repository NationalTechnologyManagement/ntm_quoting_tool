import puppeteer from 'puppeteer';
import { env } from '../config/env.js';

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Standard contract margins. The previous 20px was too tight — content
    // ran to the edges. 0.75in left/right keeps the body centered with
    // whitespace; 0.5in top/bottom leaves room for the page-number footer.
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.75in', bottom: '0.6in', left: '0.75in' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
