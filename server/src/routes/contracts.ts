import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import * as quoteService from '../services/quote.service.js';
import * as contractService from '../services/contract.service.js';
import * as pdfService from '../services/pdf.service.js';
import * as emailService from '../services/email.service.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Admin-only: render the contract HTML for preview (no PDF, no email).
// Uses the same buildContractHtml the PDF generator uses so preview === PDF.
router.get('/api/admin/contracts/:quoteId/preview', requireAuth, async (req, res) => {
  const quoteId = req.params.quoteId as string;
  const quote = await quoteService.getQuote(quoteId);
  const html = contractService.buildContractHtml(quote);
  res.type('html').send(html);
});

// Generate contract PDF and email it
router.post('/api/contracts/:quoteId/generate', async (req, res) => {
  const quoteId = req.params.quoteId as string;
  const quote = await quoteService.getQuote(quoteId);

  // Build HTML and generate PDF
  const html = contractService.buildContractHtml(quote);
  const pdfBuffer = await pdfService.generatePdf(html);

  // Save contract record
  const dbQuote = await prisma.quote.findFirst({
    where: { quoteNumber: quote.quoteNumber },
  });
  const contract = await prisma.contract.create({
    data: {
      quoteId: dbQuote!.id,
      pdfData: new Uint8Array(pdfBuffer),
      emailedAt: new Date(),
    },
  });

  // Email contract with payment link if available
  await emailService.sendContractEmail(
    quote,
    pdfBuffer,
    quote.apPaymentLink,
  );

  res.json({
    success: true,
    contractId: contract.id,
  });
});

export default router;
