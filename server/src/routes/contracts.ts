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

// Admin-only: list contracts for a quote (to expose for delete).
router.get('/api/admin/quotes/:quoteId/contracts', requireAuth, async (req, res) => {
  const quoteId = req.params.quoteId as string;
  const dbQuote = await prisma.quote.findFirst({
    where: { OR: [{ id: quoteId }, { quoteNumber: quoteId }] },
    select: { id: true },
  });
  if (!dbQuote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  const contracts = await prisma.contract.findMany({
    where: { quoteId: dbQuote.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, pdfUrl: true, emailedAt: true, createdAt: true },
  });
  res.json({ contracts });
});

// Admin-only: delete a generated contract record. Removes the PDF blob and
// row entirely. The associated Quote is unaffected. Use to clean up old
// drafts that were superseded by a re-issued contract.
router.delete('/api/admin/contracts/:contractId', requireAuth, async (req, res) => {
  const contractId = req.params.contractId as string;
  const existing = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!existing) {
    res.status(404).json({ error: 'Contract not found' });
    return;
  }
  await prisma.contract.delete({ where: { id: contractId } });
  res.json({ success: true });
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
