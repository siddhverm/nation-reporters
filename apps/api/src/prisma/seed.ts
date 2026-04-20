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

  // Sample published articles for homepage preview
  const admin = await prisma.user.findUnique({ where: { email: 'admin@nationreporters.com' } });
  if (admin) {
    const sampleArticles = [
      {
        title: 'India GDP Growth Hits 8.4% in Q3, Fastest Among Major Economies',
        slug: 'india-gdp-growth-8-4-q3',
        excerpt: 'India\'s economy expanded at its fastest pace in six quarters, driven by strong manufacturing output and robust domestic consumption.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'India\'s GDP grew at 8.4% in the third quarter, surpassing all major economies. The growth was driven by strong manufacturing output, rising domestic consumption, and record infrastructure investment by the government.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'business' } }))?.id,
      },
      {
        title: 'ISRO Successfully Tests Gaganyaan Life Support Systems Ahead of 2025 Launch',
        slug: 'isro-gaganyaan-life-support-test',
        excerpt: 'The Indian Space Research Organisation has completed critical life support system tests for the Gaganyaan human spaceflight mission.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ISRO successfully completed a series of tests for the Gaganyaan crew module\'s life support systems. The mission, India\'s first human spaceflight, is on track for its 2025 launch window.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'science' } }))?.id,
      },
      {
        title: 'India vs Australia: Rohit Sharma Leads Team to Series Victory with Stunning Century',
        slug: 'india-australia-rohit-sharma-century',
        excerpt: 'Captain Rohit Sharma\'s unbeaten 127 guided India to a historic series win against Australia on Australian soil.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'In a masterclass innings, Rohit Sharma scored 127 not out to lead India to a 6-wicket victory and secure the series 3-1. The win marks India\'s second consecutive series win in Australia.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'sports' } }))?.id,
      },
      {
        title: 'Supreme Court Upholds Digital Personal Data Protection Act',
        slug: 'supreme-court-data-protection-act',
        excerpt: 'In a landmark ruling, the Supreme Court has upheld the constitutionality of the Digital Personal Data Protection Act 2023.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The Supreme Court of India dismissed all petitions challenging the Digital Personal Data Protection Act, calling it a balanced framework for data governance.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'politics' } }))?.id,
      },
      {
        title: 'Reliance Jio Launches True 5G in 50 More Cities, Coverage Reaches 600 Districts',
        slug: 'jio-5g-expansion-50-cities',
        excerpt: 'Reliance Jio expanded its True 5G network to 50 additional cities, strengthening its lead in India\'s telecom landscape.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reliance Jio announced the launch of True 5G services across 50 new cities, bringing its network coverage to over 600 districts. The company claims 5G download speeds averaging 500 Mbps.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'tech' } }))?.id,
      },
      {
        title: 'G20 Summit: PM Modi Calls for Global AI Governance Framework',
        slug: 'g20-pm-modi-ai-governance',
        excerpt: 'Prime Minister Narendra Modi urged G20 leaders to develop a unified global framework for regulating artificial intelligence.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'At the G20 Summit, PM Modi called for an international AI governance framework built on principles of inclusivity, transparency, and safety.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'world' } }))?.id,
      },
      {
        title: 'AIIMS Delhi Performs India\'s First Robotic Heart Bypass Surgery',
        slug: 'aiims-robotic-heart-bypass-surgery',
        excerpt: 'AIIMS New Delhi achieved a milestone by performing India\'s first fully robotic coronary artery bypass graft surgery.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Doctors at AIIMS New Delhi successfully performed India\'s first robotic CABG surgery on a 62-year-old patient. The procedure took 4 hours and the patient is recovering well.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'health' } }))?.id,
      },
      {
        title: 'Bollywood Box Office: Pathaan 2 Shatters Opening Day Records with ₹120 Crore',
        slug: 'pathaan-2-opening-day-record',
        excerpt: 'Shah Rukh Khan\'s Pathaan 2 smashed the all-time opening day record at the domestic box office.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pathaan 2, starring Shah Rukh Khan and Deepika Padukone, collected ₹120 crore on its opening day, breaking the previous record of ₹105 crore set by its predecessor.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'entertainment' } }))?.id,
      },
    ];

    for (const art of sampleArticles) {
      const existing = await prisma.article.findUnique({ where: { slug: art.slug } });
      if (!existing) {
        await prisma.article.create({
          data: {
            ...art,
            body: art.body,
            authorId: admin.id,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            language: 'en',
            seoTitle: art.title,
            seoDescription: art.excerpt,
            seoSlug: art.slug,
          },
        });
      }
    }
  }

  console.log('Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
