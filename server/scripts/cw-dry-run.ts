// Manual end-to-end dry-run against a real CW instance.
//
// Usage (from server/):
//   tsx scripts/cw-dry-run.ts QT-20260427-0001
//
// Requirements:
// - CW credentials set in env (.env at repo root)
// - The given quote already exists in DB and has selectedPackage with cwAgreementTypeId set
// - All required CwConfig keys filled (see /admin/cw-reference-ids in the running app)
//
// Effect:
// - Runs onPaymentCompleted for the quote against the configured CW instance
// - Prints per-step status from the cw_provisioning_steps table at the end
//
// Be aware: this WILL create real CW objects (agreement, project, etc.). Run
// against staging or a sandbox CW company first.

import { prisma } from '../src/config/prisma.js';
import { onPaymentCompleted } from '../src/services/connectwise.service.js';
import { getQuote } from '../src/services/quote.service.js';
import { getAllSteps } from '../src/services/cw-state.service.js';

async function main() {
  const quoteNumber = process.argv[2];
  if (!quoteNumber) {
    console.error('Usage: tsx scripts/cw-dry-run.ts <quoteNumber>');
    process.exit(1);
  }
  console.log(`Running CW provisioning dry-run for ${quoteNumber}...`);

  const quote = await prisma.quote.findUnique({ where: { quoteNumber } });
  if (!quote) {
    console.error(`Quote ${quoteNumber} not found`);
    process.exit(1);
  }
  if (!quote.cwCompanyId) {
    console.error(
      `Quote ${quoteNumber} has no cwCompanyId — onQuoteCreated must have run first. ` +
        'Aborting dry-run.',
    );
    process.exit(1);
  }

  const quoteData = await getQuote(quoteNumber);
  try {
    const result = await onPaymentCompleted(quoteData);
    console.log('Result:', result);
  } catch (e: any) {
    console.error('Run failed:', e?.message || e);
  }

  console.log('\nFinal step state:');
  const steps = await getAllSteps(quote.id);
  for (const s of steps) {
    console.log(
      `  [${s.status.padEnd(8)}] ${s.step.padEnd(16)} cwId=${s.cwId ?? '-'} attempts=${s.attempts}` +
        (s.lastError ? `\n      err: ${s.lastError}` : ''),
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
