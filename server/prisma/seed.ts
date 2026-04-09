import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  defaultPackages,
  defaultAddons,
  defaultPromoCodes,
  defaultTermsContent,
} from '@ntm/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Packages ──
  for (let i = 0; i < defaultPackages.length; i++) {
    const pkg = defaultPackages[i];
    await prisma.package.upsert({
      where: { id: pkg.id },
      update: {},
      create: {
        id: pkg.id,
        name: pkg.name,
        pricePerUser: pkg.pricePerUser,
        pricePerLocation: pkg.pricePerLocation,
        frequency: pkg.frequency,
        features: pkg.features,
        isBestValue: pkg.isBestValue ?? false,
        sortOrder: i,
      },
    });
  }
  console.log(`  ✓ ${defaultPackages.length} packages`);

  // ── Addons ──
  for (let i = 0; i < defaultAddons.length; i++) {
    const addon = defaultAddons[i];
    await prisma.addon.upsert({
      where: { id: addon.id },
      update: {},
      create: {
        id: addon.id,
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
      },
    });
  }
  console.log(`  ✓ ${defaultAddons.length} addons`);

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
  await prisma.terms.upsert({
    where: { version: defaultTermsContent.version },
    update: {},
    create: {
      version: defaultTermsContent.version,
      content: defaultTermsContent.content,
      active: true,
    },
  });
  console.log('  ✓ Terms v1.0');

  // ── Admin User ──
  const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@ntm.com';
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'changeme123';
  const hash = await bcrypt.hash(password, 12);

  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash: hash },
    create: {
      email,
      passwordHash: hash,
    },
  });
  console.log(`  ✓ Admin user: ${email}`);

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
