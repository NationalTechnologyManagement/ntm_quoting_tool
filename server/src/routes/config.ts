import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import type { Package as PackageType, Addon as AddonType, PromoCode, TermsContent } from '@ntm/shared';

const router = Router();

router.get('/api/config', async (_req, res) => {
  const [dbPackages, dbAddons, dbPromoCodes, dbTerms] = await Promise.all([
    prisma.package.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.addon.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.promoCode.findMany({ where: { active: true } }),
    prisma.terms.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const packages: PackageType[] = dbPackages
    // Lite quoting tool intentionally hides Essentials — it's the entry-level
    // package and not what we want lead-gen visitors anchored on.
    .filter((p) => !env.LEAD_GEN_MODE || p.name.toLowerCase() !== 'essentials')
    .map((p) => ({
      id: p.id,
      name: p.name,
      pricePerUser: p.pricePerUser,
      pricePerLocation: p.pricePerLocation,
      frequency: p.frequency as PackageType['frequency'],
      features: p.features as string[],
      isBestValue: p.isBestValue,
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

  res.json({ packages, addons, promoCodes, terms });
});

export default router;
