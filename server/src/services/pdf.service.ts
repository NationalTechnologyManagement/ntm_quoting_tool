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

    // Margin note: Chrome gives the template's CSS @page margins precedence
    // over these pdf() options, so the authoritative values live in
    // contract.ts (@page { margin: 0.5in 0.75in 0.6in }). These stay as the
    // fallback for any HTML without its own @page rule — keep both in sync.
    //
    // Page numbers: Chrome doesn't support CSS @page margin boxes, so the
    // template can't render its own counter — Puppeteer's header/footer
    // layer is the only thing that can. headerTemplate must be non-empty
    // (a space collapses it) or Chrome falls back to its default header.
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.75in', bottom: '0.6in', left: '0.75in' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%; font-size:8px; font-family:Arial, sans-serif; color:#999; text-align:center; padding:0 0.75in;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>`,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
