import type { QuoteData } from '@ntm/shared';
import { SERVICE_PROVIDER } from '@ntm/shared';
import { buildContractHtml as buildHtml } from '../templates/contract.js';

export function buildContractHtml(quote: QuoteData): string {
  return buildHtml(quote);
}
