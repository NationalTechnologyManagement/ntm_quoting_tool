import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  defaultPackages,
  defaultAddons,
  defaultPromoCodes,
  defaultTermsContent,
} from '@ntm/shared';
import { CW_CONFIG_KEYS, DEFAULTS as CW_DEFAULTS } from '../src/services/cw-config.service.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Packages ──
  // Canonical 3 packages (Essentials/SafeSecure/SafeSecure Plus). The
  // constants.ts entries are FIRST-DEPLOY DEFAULTS — once a row exists,
  // its prices / features / contract term / visibility belong to the
  // admin and the seed will NOT overwrite them on subsequent deploys.
  // We do still backfill columns that are still at their "unset" sentinel
  // (NULL CW ids, empty featureGroups) so newly-added columns roll out
  // without ops needing to fill every package by hand.
  for (let i = 0; i < defaultPackages.length; i++) {
    const pkg = defaultPackages[i];
    const fields = {
      name: pkg.name,
      pricePerUser: pkg.pricePerUser,
      pricePerUserF3: pkg.pricePerUserF3 ?? 0,
      pricePerLocation: pkg.pricePerLocation,
      frequency: pkg.frequency,
      features: pkg.features,
      featureGroups: (pkg.featureGroups ?? []) as any,
      isBestValue: pkg.isBestValue ?? false,
      customerVisible: pkg.customerVisible ?? true,
      sortOrder: i,
      cwAgreementTypeId: pkg.cwAgreementTypeId ?? null,
      cwPerUserProductId: pkg.cwPerUserProductId ?? null,
      cwPerUserF3ProductId: pkg.cwPerUserF3ProductId ?? null,
      cwPerLocationProductId: pkg.cwPerLocationProductId ?? null,
      agreementMonths: pkg.agreementMonths ?? 0,
    };
    const existing = await prisma.package.findUnique({ where: { id: pkg.id } });
    if (!existing) {
      await prisma.package.create({ data: { id: pkg.id, ...fields } });
      continue;
    }
    // Existing row: only patch columns that are still at the unset
    // sentinel. Admin edits to prices, features, visibility, etc. stick.
    const patch: any = {};
    const existingFg = (existing as any).featureGroups;
    if (existingFg == null || (Array.isArray(existingFg) && existingFg.length === 0)) {
      patch.featureGroups = fields.featureGroups;
    }
    if (existing.cwAgreementTypeId == null) patch.cwAgreementTypeId = fields.cwAgreementTypeId;
    if (existing.cwPerUserProductId == null) patch.cwPerUserProductId = fields.cwPerUserProductId;
    if (existing.cwPerUserF3ProductId == null) patch.cwPerUserF3ProductId = fields.cwPerUserF3ProductId;
    if (existing.cwPerLocationProductId == null) patch.cwPerLocationProductId = fields.cwPerLocationProductId;
    if (Object.keys(patch).length > 0) {
      await prisma.package.update({ where: { id: pkg.id }, data: patch });
    }
  }
  console.log(`  ✓ ${defaultPackages.length} packages (admin-edits preserved; only sentinel columns backfilled)`);

  // ── Addons ──
  // Same model as packages — canonical addons live in constants.ts and are
  // overwritten on each deploy. Legacy placeholder addons (id 'addon-1' through
  // 'addon-10') are deactivated here so they stop showing in the wizard. Their
  // rows stay in DB so any historical quote snapshots remain consistent.
  const LEGACY_PLACEHOLDER_IDS = [
    'addon-1','addon-2','addon-3','addon-4','addon-5',
    'addon-6','addon-7','addon-8','addon-9','addon-10',
  ];
  await prisma.addon.updateMany({
    where: { id: { in: LEGACY_PLACEHOLDER_IDS } },
    data: { active: false },
  });

  for (let i = 0; i < defaultAddons.length; i++) {
    const addon = defaultAddons[i];
    const fields = {
      name: addon.name,
      description: addon.description,
      price: addon.price,
      frequency: addon.frequency,
      active: addon.active,
      recurringPrice: addon.recurringPrice ?? null,
      recurringFrequency: addon.recurringFrequency ?? null,
      setupPrice: addon.setupPrice ?? null,
      pricingType: addon.pricingType,
      sortOrder: i,
      cwProductId: addon.cwProductId ?? null,
    };
    const existing = await prisma.addon.findUnique({ where: { id: addon.id } });
    if (!existing) {
      await prisma.addon.create({ data: { id: addon.id, ...fields } });
      continue;
    }
    // Existing row: same policy as packages — admin edits to prices stick.
    // Only backfill cwProductId when still unset.
    const patch: any = {};
    if (existing.cwProductId == null) patch.cwProductId = fields.cwProductId;
    if (Object.keys(patch).length > 0) {
      await prisma.addon.update({ where: { id: addon.id }, data: patch });
    }
  }
  console.log(`  ✓ ${defaultAddons.length} addons (admin-edits preserved; only cwProductId backfilled when unset)`);

  // ── Promo Codes ──
  for (const promo of defaultPromoCodes) {
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      update: {
        discount: promo.discount,
        discountType: promo.discountType,
        applyTo: promo.applyTo,
        active: promo.active,
      },
      create: {
        id: promo.id,
        code: promo.code,
        discount: promo.discount,
        discountType: promo.discountType,
        applyTo: promo.applyTo,
        active: promo.active,
      },
    });
  }
  console.log(`  ✓ ${defaultPromoCodes.length} promo codes`);

  // ── Terms ──
  // When the source-of-truth version in shared/src/constants.ts changes
  // (e.g. 1.0 → 2.0 for the Master Services Agreement rewrite), retire
  // every other "active" row so /api/terms returns exactly one version.
  // Don't touch admin-edited content of older versions — that's history.
  await prisma.terms.updateMany({
    where: { active: true, version: { not: defaultTermsContent.version } },
    data: { active: false },
  });
  await prisma.terms.upsert({
    where: { version: defaultTermsContent.version },
    // If an admin has edited this version in-place via the UI, leave the
    // edit alone. The seed only owns the FIRST insertion of a new version.
    update: { active: true },
    create: {
      version: defaultTermsContent.version,
      content: defaultTermsContent.content,
      active: true,
    },
  });
  console.log(`  ✓ Terms v${defaultTermsContent.version}`);

  // ── Admin User ──
  const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@ntm.com';
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'changeme123';
  const hash = await bcrypt.hash(password, 12);

  await prisma.adminUser.upsert({
    where: { email },
    // Don't overwrite admin-set fields on every deploy — only fill in defaults
    // on first create. Re-running the seed updates passwordHash from
    // INITIAL_ADMIN_PASSWORD only if the env var is set, otherwise leaves it.
    update: process.env.INITIAL_ADMIN_PASSWORD ? { passwordHash: hash } : {},
    create: {
      email,
      passwordHash: hash,
      role: 'admin',
      active: true,
    },
  });
  console.log(`  ✓ Admin user: ${email}`);

  // ── Site Content (singleton) ──
  // Idempotent: created on first deploy with Prisma model defaults; left alone
  // afterwards so admin edits survive the next deploy.
  await prisma.siteContent.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });
  console.log('  ✓ Site content singleton');

  // ── CW Config ──
  // Idempotent upsert of every documented key with its default value.
  // Real values come from docs/cw-reference-ids.md after the audit pass.
  for (const key of CW_CONFIG_KEYS) {
    await prisma.cwConfig.upsert({
      where: { key },
      update: {}, // never overwrite values an admin has set
      create: { key, value: CW_DEFAULTS[key] ?? 'null' },
    });
  }
  console.log(`  ✓ ${CW_CONFIG_KEYS.length} CW config keys seeded`);

  // One-time correction: clear the legacy hard-coded project.templateId="2"
  // ("Client Onboarding Template"). The new name-lookup fallback in
  // createProject will resolve the right id from project.templateName
  // ("SafeSecure Pure SaaS (Project Template) v3") on the next provisioning
  // run and write it back. Admin-set values (anything other than "2") are
  // left alone.
  await prisma.cwConfig.updateMany({
    where: { key: 'project.templateId', value: '2' },
    data: { value: 'null', notes: 'Cleared by seed — name lookup will repopulate.' },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
