import { Router } from 'express';
import { cred } from '../services/integration-credentials.service.js';
import * as apService from '../services/ap.service.js';
import * as emailService from '../services/email.service.js';
import * as quoteService from '../services/quote.service.js';
import * as contractService from '../services/contract.service.js';
import * as pdfService from '../services/pdf.service.js';
import * as cwService from '../services/connectwise.service.js';
import { CwHardFailError } from '../services/connectwise.service.js';
import * as ghlService from '../services/crm.service.js';
import * as notify from '../services/notify.service.js';

const router = Router();

// Alternative Payments webhook
router.post('/api/webhooks/ap', async (req, res) => {
  // Verify webhook secret if configured. Read via cred() (DB cache → env) so
  // a secret set through the admin "register webhook" tool — which stores it
  // in the integration_credentials table, not process.env — is actually
  // honored. Previously this read env.AP_WEBHOOK_SECRET directly, so a
  // DB-only secret meant AP's signed webhooks were never verified.
  const webhookSecret = cred('AP_WEBHOOK_SECRET');
  if (webhookSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${webhookSecret}`) {
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

          // Generate contract PDF and email it.
          // We send ONE email: the Contract/Welcome email, with the signed
          // PDF attached. It already covers "we got your payment" + welcome
          // + next steps, so no separate Payment Received email goes out.
          try {
            const html = contractService.buildContractHtml(quoteData);
            const pdfBuffer = await pdfService.generatePdf(html);
            await emailService.sendContractEmail(quoteData, pdfBuffer);
          } catch (e) {
            console.error('[AP Webhook] Contract/email generation failed:', e);
          }

          // CW post-payment provisioning. Hard-fail surfaces here so AP can retry.
          // Soft fails are recorded in CwProvisioningStep and surfaced via the
          // admin Quote Management page; the retry worker will pick them up later.
          try {
            const cwIds = await cwService.onPaymentCompleted(quoteData);
            if (cwIds.cwProjectId || cwIds.cwAgreementId) {
              await quoteService.updateQuoteCWIds(quoteData.quoteNumber, cwIds);
            }
          } catch (err) {
            if (err instanceof CwHardFailError) {
              console.error('[AP Webhook] CW hard fail:', err);
              await notify.notifyProvisioningFailed({
                quoteNumber: quoteData.quoteNumber,
                businessName: quoteData.customer.businessName,
                step: 'company',
                error: err.message,
              });
              // Return 5xx so AP retries delivery; do not auto-refund.
              res.status(500).json({ error: 'CW provisioning hard-failed', details: err.message });
              return;
            }
            console.error('[CW] onPaymentCompleted error:', err);
          }

          // Fire-and-forget: GHL mark won (CRM, not billing-critical)
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
