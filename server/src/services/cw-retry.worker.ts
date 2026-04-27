// Background retry of failed CW provisioning steps.
// Wakes every CW_RETRY_INTERVAL_MS, finds quotes with at least one failed step
// under the attempt cap, and replays the full pipeline through replayProvisioning.
// runStep's resume logic skips successful steps, so we always restart from the
// failed point.

import { env } from '../config/env.js';
import { findQuotesNeedingRetry } from './cw-state.service.js';
import { replayProvisioning } from './connectwise.service.js';
import { prisma } from '../config/prisma.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return; // skip overlapping runs
  running = true;
  try {
    const quoteIds = await findQuotesNeedingRetry(env.CW_RETRY_MAX_ATTEMPTS, 10);
    if (quoteIds.length === 0) return;
    console.log(`[cw-retry] retrying ${quoteIds.length} quote(s) with failed steps`);
    for (const quoteId of quoteIds) {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        select: { quoteNumber: true },
      });
      if (!quote) continue;
      try {
        await replayProvisioning(quote.quoteNumber);
      } catch (e) {
        console.error(`[cw-retry] replay ${quote.quoteNumber} failed:`, e);
      }
    }
  } catch (e) {
    console.error('[cw-retry] tick error:', e);
  } finally {
    running = false;
  }
}

export function startCwRetryWorker(): void {
  if (env.CW_RETRY_DISABLED) {
    console.log('[cw-retry] disabled (CW_RETRY_DISABLED=true)');
    return;
  }
  if (timer) return;
  timer = setInterval(tick, env.CW_RETRY_INTERVAL_MS);
  // unref so the worker doesn't block process exit during graceful shutdown
  timer.unref?.();
  console.log(`[cw-retry] worker started; interval=${env.CW_RETRY_INTERVAL_MS}ms`);
}

export function stopCwRetryWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
