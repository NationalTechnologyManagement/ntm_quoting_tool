import { Router } from 'express';
import { env } from '../config/env.js';
import * as apService from '../services/ap.service.js';
import * as emailService from '../services/email.service.js';
import * as quoteService from '../services/quote.service.js';
import * as contractService from '../services/contract.service.js';
import * as pdfService from '../services/pdf.service.js';
import * as cwService from '../services/connectwise.service.js';
import * as ghlService from '../services/crm.service.js';

const router = Router();

// Alternative Payments webhook
router.post('/api/webhooks/ap', async (req, res) => {
  // Verify webhook secret if configured
  if (env.AP_WEBHOOK_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${env.AP_WEBHOOK_SECRET}`) {
      console.error('[AP Webhook] Invalid authorization header');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const { topic, entity_id, data } = req.body;

  try {
    switch (topic) {
      case 'invoice_paid': {
        const invoiceId = data?.invoice_id || entity_id;
        const quote = await apService.handleInvoicePaid(invoiceId);

        if (quote) {
          const quoteData = await quoteService.getQuote(quote.quoteNumber);

          // Generate contract PDF and email it
          try {
            const html = contractService.buildContractHtml(quoteData);
            const pdfBuffer = await pdfService.generatePdf(html);
            await emailService.sendContractEmail(quoteData, pdfBuffer);
            await emailService.sendPaymentConfirmationEmail(quoteData);
          } catch (e) {
            console.error('[AP Webhook] Contract/email generation failed:', e);
          }

          // Fire-and-forget: CW post-payment actions
          cwService.onPaymentCompleted(quoteData).then(async (cwIds) => {
            if (cwIds.cwProjectId || cwIds.cwAgreementId) {
              await quoteService.updateQuoteCWIds(quoteData.quoteNumber, cwIds);
            }
          }).catch((err) => console.error('[CW] onPaymentCompleted error:', err));

          // Fire-and-forget: GHL mark won
          ghlService.onPaymentCompleted(quoteData)
            .catch((err) => console.error('[GHL] onPaymentCompleted error:', err));
        }
        break;
      }
      case 'payment_failed': {
        const invoiceId = data?.invoice_id || entity_id;
        await apService.handlePaymentFailed(invoiceId);
        break;
      }
      default:
        console.log(`[AP Webhook] Unhandled topic: ${topic}`);
    }
  } catch (err) {
    console.error('[AP Webhook] Processing error:', err);
  }

  res.json({ received: true });
});

export default router;
