import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import type {
  Package as PackageType,
  Addon as AddonType,
  PromoCode,
  TermsContent,
  SiteContent,
} from '@ntm/shared';

const router = Router();

router.get('/api/config', async (_req, res) => {
  const [dbPackages, dbAddons, dbPromoCodes, dbTerms, dbSiteContent] = await Promise.all([
    prisma.package.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.addon.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.promoCode.findMany({ where: { active: true } }),
    prisma.terms.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } }),
    prisma.siteContent.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    }),
  ]);

  const packages: PackageType[] = dbPackages
    // Hide packages flagged as customerVisible=false (e.g. Essentials). Admin
    // UI still sees the full list via /api/packages.
    .filter((p) => p.customerVisible !== false)
    // Lite quoting tool also hides Essentials by name as a defense in depth —
    // even if customerVisible somehow gets toggled true on Essentials, lite
    // still won't show it.
    .filter((p) => !env.LEAD_GEN_MODE || p.name.toLowerCase() !== 'essentials')
    .map((p) => ({
      id: p.id,
      name: p.name,
      pricePerUser: p.pricePerUser,
      pricePerUserF3: p.pricePerUserF3,
      pricePerLocation: p.pricePerLocation,
      frequency: p.frequency as PackageType['frequency'],
      features: p.features as string[],
      featureGroups: (p.featureGroups as any) ?? [],
      isBestValue: p.isBestValue,
      customerVisible: p.customerVisible,
      cwAgreementTypeId: p.cwAgreementTypeId,
      cwPerUserProductId: p.cwPerUserProductId,
      cwPerUserF3ProductId: p.cwPerUserF3ProductId,
      cwPerLocationProductId: p.cwPerLocationProductId,
      agreementMonths: p.agreementMonths,
    }));

  const addons: AddonType[] = dbAddons.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    price: a.price,
    frequency: a.frequency as AddonType['frequency'],
    active: a.active,
    recurringPrice: a.recurringPrice ?? undefined,
    recurringFrequency: a.recurringFrequency as AddonType['recurringFrequency'],
    setupPrice: a.setupPrice ?? undefined,
    pricingType: a.pricingType as AddonType['pricingType'],
  }));

  const promoCodes: PromoCode[] = dbPromoCodes
    .filter((p) => {
      // Hide admin-only promos from the customer wizard. They're still
      // appliable from /admin/quotes/:id.
      if ((p as any).adminOnly) return false;
      if (p.expiresAt && p.expiresAt < new Date()) return false;
      if (p.maxUses && p.currentUses >= p.maxUses) return false;
      return true;
    })
    .map((p) => ({
      id: p.id,
      code: p.code,
      discount: p.discount,
      discountType: p.discountType as PromoCode['discountType'],
      applyTo: p.applyTo as PromoCode['applyTo'],
      active: p.active,
    }));

  const terms: TermsContent | null = dbTerms
    ? {
        id: dbTerms.id,
        version: dbTerms.version,
        content: dbTerms.content,
        lastUpdated: dbTerms.updatedAt.toISOString(),
      }
    : null;

  const siteContent: SiteContent = {
    quoteBuilderHeading: dbSiteContent.quoteBuilderHeading,
    quoteBuilderSubheading: dbSiteContent.quoteBuilderSubheading,
    quoteBuilderExplainerTitle: dbSiteContent.quoteBuilderExplainerTitle,
    quoteBuilderExplainerBody: dbSiteContent.quoteBuilderExplainerBody,
  };

  res.json({ packages, addons, promoCodes, terms, siteContent });
});

export default router;
