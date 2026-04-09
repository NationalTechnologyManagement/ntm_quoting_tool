import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { QUOTE_VALIDITY_DAYS } from '@ntm/shared';
import type { CreateQuotePayload, QuoteData, CheckoutPayload } from '@ntm/shared';

function generateQuoteNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `QT-${date}-${rand}`;
}

export async function createQuote(payload: CreateQuotePayload): Promise<QuoteData> {
  const quoteNumber = generateQuoteNumber();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + QUOTE_VALIDITY_DAYS);

  const quote = await prisma.quote.create({
    data: {
      quoteNumber,
      status: 'draft',
      customer: payload.customer as any,
      selectedPackage: payload.selectedPackage as any,
      selectedAddons: payload.selectedAddons as any,
      onboarding: payload.onboarding as any,
      appliedPromoCodes: payload.appliedPromoCodes as any,
      totals: payload.totals as any,
      terms: payload.terms as any,
      expiresAt,
    },
  });

  return mapQuoteToData(quote);
}

export async function getQuote(quoteId: string): Promise<QuoteData> {
  // Try to find by quoteNumber or by id
  const quote = await prisma.quote.findFirst({
    where: {
      OR: [
        { quoteNumber: quoteId },
        { id: quoteId },
      ],
    },
  });

  if (!quote) throw new AppError(404, 'Quote not found');
  return mapQuoteToData(quote);
}

export async function getQuotesByEmail(email: string): Promise<Array<{
  quoteNumber: string;
  status: string;
  businessName: string;
  packageName: string;
  grandTotal: number;
  recurringCosts: number;
  createdAt: string;
}>> {
  const quotes = await prisma.quote.findMany({
    where: {
      customer: { path: ['email'], equals: email },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return quotes.map((q) => {
    const customer = q.customer as any;
    const pkg = q.selectedPackage as any;
    const totals = q.totals as any;
    return {
      quoteNumber: q.quoteNumber,
      status: q.status,
      businessName: customer?.businessName || '',
      packageName: pkg?.name || '',
      grandTotal: totals?.grandTotal || 0,
      recurringCosts: totals?.recurringCosts || 0,
      createdAt: q.createdAt.toISOString(),
    };
  });
}

export async function applyPromoCode(quoteNumber: string, code: string): Promise<QuoteData> {
  const quote = await prisma.quote.findFirst({ where: { quoteNumber } });
  if (!quote) throw new AppError(404, 'Quote not found');

  // Look up the promo code
  const promo = await prisma.promoCode.findFirst({
    where: { code: { equals: code, mode: 'insensitive' }, active: true },
  });
  if (!promo) throw new AppError(400, 'Invalid or inactive promo code');

  // Check expiration
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    throw new AppError(400, 'Promo code has expired');
  }

  // Check max uses
  if (promo.maxUses && promo.currentUses >= promo.maxUses) {
    throw new AppError(400, 'Promo code has reached maximum uses');
  }

  // Check if already applied
  const existing = (quote.appliedPromoCodes as any[]) || [];
  if (existing.some((p: any) => p.code.toUpperCase() === code.toUpperCase())) {
    throw new AppError(400, 'Promo code already applied');
  }

  // Add promo and recalculate totals
  const newPromos = [...existing, {
    code: promo.code,
    discount: promo.discount,
    discountType: promo.discountType,
    applyTo: promo.applyTo,
  }];

  const updated = await recalcAndSaveQuote(quote, newPromos);


  // Increment promo usage
  await prisma.promoCode.update({
    where: { id: promo.id },
    data: { currentUses: { increment: 1 } },
  });

  return mapQuoteToData(updated);
}

export async function removePromoCode(quoteNumber: string, code: string): Promise<QuoteData> {
  const quote = await prisma.quote.findFirst({ where: { quoteNumber } });
  if (!quote) throw new AppError(404, 'Quote not found');

  const existing = (quote.appliedPromoCodes as any[]) || [];
  const newPromos = existing.filter((p: any) => p.code.toUpperCase() !== code.toUpperCase());

  if (newPromos.length === existing.length) {
    throw new AppError(400, 'Promo code not found on this quote');
  }

  const updated = await recalcAndSaveQuote(quote, newPromos);

  // Decrement promo usage
  const promo = await prisma.promoCode.findFirst({
    where: { code: { equals: code, mode: 'insensitive' } },
  });
  if (promo && promo.currentUses > 0) {
    await prisma.promoCode.update({
      where: { id: promo.id },
      data: { currentUses: { decrement: 1 } },
    });
  }

  return mapQuoteToData(updated);
}

export async function updateQuoteStatus(quoteNumber: string, status: string) {
  return prisma.quote.update({
    where: { quoteNumber },
    data: { status },
  });
}

export async function updateQuoteAgreement(quoteNumber: string, payload: CheckoutPayload) {
  const quote = await prisma.quote.update({
    where: { quoteNumber },
    data: {
      agreement: payload.agreement as any,
      orderNumber: payload.orderNumber,
      status: 'accepted',
    },
  });
  return mapQuoteToData(quote);
}

export async function updateQuoteAPSession(
  quoteNumber: string,
  apCustomerId: string,
  apInvoiceId: string,
  apPaymentLink: string,
) {
  return prisma.quote.update({
    where: { quoteNumber },
    data: {
      apCustomerId,
      apInvoiceId,
      apPaymentLink,
      status: 'checkout_pending',
    },
  });
}

export async function markQuotePaid(apInvoiceId: string) {
  const quote = await prisma.quote.findFirst({
    where: { apInvoiceId },
  });
  if (!quote) return null;

  return prisma.quote.update({
    where: { id: quote.id },
    data: { status: 'paid' },
  });
}

export async function getQuoteByAPInvoice(apInvoiceId: string) {
  const quote = await prisma.quote.findFirst({
    where: { apInvoiceId },
  });
  if (!quote) return null;
  return mapQuoteToData(quote);
}

export async function updateQuoteCWIds(
  quoteNumber: string,
  cwIds: { cwCompanyId?: number; cwContactId?: number; cwOpportunityId?: number; cwProjectId?: number; cwAgreementId?: number },
) {
  return prisma.quote.update({
    where: { quoteNumber },
    data: cwIds,
  });
}

export async function updateQuoteGHLIds(
  quoteNumber: string,
  ghlIds: { ghlContactId?: string; ghlOpportunityId?: string },
) {
  return prisma.quote.update({
    where: { quoteNumber },
    data: ghlIds,
  });
}

// Shared: recalculate totals from raw quote data + promo list, save to DB
async function recalcAndSaveQuote(quote: any, promos: any[]): Promise<any> {
  const onboarding = quote.onboarding as any;
  const totals = quote.totals as any;
  const selectedAddons = quote.selectedAddons as any[];
  const pkg = quote.selectedPackage as any;
  const customer = quote.customer as any;

  // Always derive base costs from raw stored data
  const baseOnboarding = onboarding.totalCost || 0;
  const baseOneTime = selectedAddons
    .filter((a: any) => a.pricingType === 'one-time-only' || a.pricingType === 'both')
    .reduce((sum: number, a: any) => sum + (a.setupPrice || 0) * a.quantity, 0);
  const packageCost = (pkg.pricePerUser * customer.userCount) + (pkg.pricePerLocation * customer.locationCount);
  const addonRecurring = selectedAddons
    .filter((a: any) => a.pricingType === 'recurring-only' || a.pricingType === 'both')
    .reduce((sum: number, a: any) => sum + (a.recurringPrice || 0) * a.quantity, 0);
  const baseRecurring = packageCost + addonRecurring;

  let onboardingDiscount = 0;
  let oneTimeDiscount = 0;
  let recurringDiscount = 0;

  for (const p of promos) {
    if (p.discountType === 'percentage') {
      if (p.applyTo === 'onboarding') onboardingDiscount += baseOnboarding * (p.discount / 100);
      else if (p.applyTo === 'one-time') oneTimeDiscount += baseOneTime * (p.discount / 100);
      else if (p.applyTo === 'monthly') recurringDiscount += baseRecurring * (p.discount / 100);
    } else {
      if (p.applyTo === 'onboarding') onboardingDiscount += Math.min(p.discount, baseOnboarding - onboardingDiscount);
      else if (p.applyTo === 'one-time') oneTimeDiscount += Math.min(p.discount, baseOneTime - oneTimeDiscount);
      else if (p.applyTo === 'monthly') recurringDiscount += Math.min(p.discount, baseRecurring - recurringDiscount);
    }
  }

  const finalOnboarding = Math.max(0, baseOnboarding - onboardingDiscount);
  const finalOneTime = Math.max(0, baseOneTime - oneTimeDiscount);
  const finalRecurring = Math.max(0, baseRecurring - recurringDiscount);
  const totalDiscount = onboardingDiscount + oneTimeDiscount + recurringDiscount;

  return prisma.quote.update({
    where: { quoteNumber: quote.quoteNumber },
    data: {
      appliedPromoCodes: promos as any,
      onboarding: { ...onboarding, discount: onboardingDiscount, finalCost: finalOnboarding } as any,
      totals: {
        ...totals,
        onboardingCost: finalOnboarding,
        oneTimeCosts: finalOneTime,
        recurringCosts: finalRecurring,
        discount: totalDiscount,
        grandTotal: finalOnboarding + finalOneTime + finalRecurring,
        recurringFrequency: totals.recurringFrequency,
      } as any,
    },
  });
}

function mapQuoteToData(quote: any): QuoteData {
  const quoteUrl = `${env.FRONTEND_URL}/quote-review?id=${quote.quoteNumber}`;
  return {
    quoteNumber: quote.quoteNumber,
    customer: quote.customer as QuoteData['customer'],
    selectedPackage: quote.selectedPackage as QuoteData['selectedPackage'],
    selectedAddons: quote.selectedAddons as QuoteData['selectedAddons'],
    onboarding: quote.onboarding as QuoteData['onboarding'],
    appliedPromoCodes: quote.appliedPromoCodes as QuoteData['appliedPromoCodes'],
    totals: quote.totals as QuoteData['totals'],
    terms: quote.terms as QuoteData['terms'],
    agreement: quote.agreement as QuoteData['agreement'],
    status: quote.status as QuoteData['status'],
    apCustomerId: quote.apCustomerId ?? undefined,
    apInvoiceId: quote.apInvoiceId ?? undefined,
    apPaymentLink: quote.apPaymentLink ?? undefined,
    cwCompanyId: quote.cwCompanyId ?? undefined,
    cwContactId: quote.cwContactId ?? undefined,
    cwOpportunityId: quote.cwOpportunityId ?? undefined,
    cwProjectId: quote.cwProjectId ?? undefined,
    cwAgreementId: quote.cwAgreementId ?? undefined,
    ghlContactId: quote.ghlContactId ?? undefined,
    ghlOpportunityId: quote.ghlOpportunityId ?? undefined,
    timestamp: quote.createdAt.toISOString(),
  };
}
