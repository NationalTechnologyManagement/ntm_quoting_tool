// Sends the 30-day "still interested?" follow-up email for unpaid quotes.
//
// Wakes every QUOTE_FOLLOWUP_INTERVAL_MS (default hourly) and queries for
// quotes that are:
//   1. Older than QUOTE_FOLLOWUP_DAYS (default 30).
//   2. Not paid (status NOT IN ('paid')) — sent / accepted / draft are all
//      candidates because none of those mean the customer paid.
//   3. Have not already been nudged (followupSentAt IS NULL).
//
// Stamps followupSentAt the moment the email succeeds so we never send
// twice for the same quote, even if the DB stays stale longer than expected.

import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { sendQuoteFollowupEmail } from './email.service.js';
import { getQuote } from './quote.service.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const cutoff = new Date(Date.now() - env.QUOTE_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000);

    const candidates = await prisma.quote.findMany({
      where: {
        followupSentAt: null,
        createdAt: { lte: cutoff },
        status: { notIn: ['paid', 'expired'] },
      },
      select: { id: true, quoteNumber: true },
      take: 25,
    });

    if (candidates.length === 0) return;

    console.log(`[quote-followup] nudging ${candidates.length} quote(s) past day ${env.QUOTE_FOLLOWUP_DAYS}`);

    for (const { id, quoteNumber } of candidates) {
      try {
        const quote = await getQuote(quoteNumber);
        if (!quote.customer?.email) {
          // Missing email: stamp anyway so we don't re-scan every hour.
          await prisma.quote.update({
            where: { id },
            data: { followupSentAt: new Date() },
          });
          continue;
        }

        const result = await sendQuoteFollowupEmail(quote);
        if (result.success) {
          await prisma.quote.update({
            where: { id },
            data: { followupSentAt: new Date() },
          });
          console.log(`[quote-followup] sent for ${quoteNumber} -> ${quote.customer.email}`);
        }
      } catch (e) {
        console.error(`[quote-followup] failed for ${quoteNumber}:`, e);
      }
    }
  } catch (e) {
    console.error('[quote-followup] tick error:', e);
  } finally {
    running = false;
  }
}

export function startQuoteFollowupWorker(): void {
  if (env.QUOTE_FOLLOWUP_DISABLED) {
    console.log('[quote-followup] disabled (QUOTE_FOLLOWUP_DISABLED=true)');
    return;
  }
  if (timer) return;
  // First tick after a short delay so the worker doesn't fight migrations on boot.
  setTimeout(() => {
    void tick();
  }, 30_000).unref?.();
  timer = setInterval(tick, env.QUOTE_FOLLOWUP_INTERVAL_MS);
  timer.unref?.();
  console.log(
    `[quote-followup] worker started; interval=${env.QUOTE_FOLLOWUP_INTERVAL_MS}ms, threshold=${env.QUOTE_FOLLOWUP_DAYS}d`,
  );
}

export function stopQuoteFollowupWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
