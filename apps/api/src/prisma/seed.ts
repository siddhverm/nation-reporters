import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user
  await prisma.user.upsert({
    where: { email: 'admin@nationreporters.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@nationreporters.com',
      passwordHash: await bcrypt.hash('Admin@123456', 12),
      role: 'ADMIN',
    },
  });

  // Categories
  const categories = [
    { name: 'India', slug: 'india' },
    { name: 'World', slug: 'world' },
    { name: 'Politics', slug: 'politics' },
    { name: 'Business', slug: 'business' },
    { name: 'Sports', slug: 'sports' },
    { name: 'Entertainment', slug: 'entertainment' },
    { name: 'Technology', slug: 'tech' },
    { name: 'Health', slug: 'health' },
    { name: 'Science', slug: 'science' },
    { name: 'Environment', slug: 'environment' },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: {}, create: cat });
  }

  // Regions
  const regions = [
    { name: 'India', slug: 'india', country: 'IN' },
    { name: 'United States', slug: 'us', country: 'US' },
    { name: 'United Kingdom', slug: 'uk', country: 'GB' },
    { name: 'World', slug: 'world', country: 'GLOBAL' },
  ];
  for (const region of regions) {
    await prisma.region.upsert({ where: { slug: region.slug }, update: {}, create: region });
  }

  // Default risk rules
  await prisma.riskRule.upsert({
    where: { id: 'default-low-risk' },
    update: {},
    create: {
      id: 'default-low-risk',
      name: 'Auto-approve low-risk tech/sports/entertainment',
      maxScore: 0.3,
      minConfidence: 0.8,
      requireTrustedSource: true,
      autoApprove: true,
    },
  });

  // Feature flags
  const flags = [
    { key: 'FEATURE_AUTO_APPROVE', enabled: false },
    { key: 'FEATURE_TTS', enabled: false },
    { key: 'FEATURE_LIVE_TV', enabled: false },
  ];
  for (const flag of flags) {
    await prisma.featureFlag.upsert({ where: { key: flag.key }, update: {}, create: flag });
  }

  // Sample ingestion source (public domain RSS for testing)
  await prisma.ingestedSource.upsert({
    where: { feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    update: {},
    create: {
      name: 'BBC World News',
      feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
      type: 'rss',
      isActive: false, // disabled by default — admin must enable
      isTrusted: false,
      rightsMetadata: { note: 'For testing only. Ensure proper licensing before enabling.' },
    },
  });

  console.log('Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
