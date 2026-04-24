import { Module } from '@nestjs/common';
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CHIEF_EDITOR)
@Controller('analytics')
class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    const [totalArticles, published, pending, failed, sources] = await Promise.all([
      this.prisma.article.count(),
      this.prisma.article.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.article.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.publishJob.count({ where: { status: 'FAILED' } }),
      this.prisma.ingestedSource.count({ where: { isActive: true } }),
    ]);
    return { totalArticles, published, pending, failed, activeSources: sources };
  }

  @Get('articles/:id')
  async articleStats(@Param('id') id: string) {
    const jobs = await this.prisma.publishJob.findMany({
      where: { articleId: id },
      select: { platform: true, status: true, executedAt: true },
    });
    return { articleId: id, publishJobs: jobs };
  }

  @Get('content-health')
  async contentHealth() {
    const monitoredCategories = ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'tech'];
    const monitoredLanguages = ['en', 'hi', 'mr', 'bn', 'ta', 'te', 'gu', 'kn', 'pa', 'ur', 'ar', 'fr', 'de', 'es', 'pt', 'ru', 'zh', 'ja', 'ko'];
    const minRequired = Number(process.env.INGESTION_MIN_SECTION_INVENTORY ?? 20);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const categories = await this.prisma.category.findMany({
      where: { slug: { in: monitoredCategories } },
      select: { id: true, slug: true, name: true },
      orderBy: { slug: 'asc' },
    });
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const [counts24h, countsTotal, ingestionMeta] = await Promise.all([
      this.prisma.article.groupBy({
        by: ['categoryId', 'language'],
        where: {
          status: 'PUBLISHED',
          categoryId: { in: categories.map((c) => c.id) },
          language: { in: monitoredLanguages },
          publishedAt: { gte: since },
        },
        _count: { _all: true },
      }),
      this.prisma.article.groupBy({
        by: ['categoryId', 'language'],
        where: {
          status: 'PUBLISHED',
          categoryId: { in: categories.map((c) => c.id) },
          language: { in: monitoredLanguages },
        },
        _count: { _all: true },
      }),
      this.prisma.ingestedSource.aggregate({
        _max: { lastFetchedAt: true },
        _count: { _all: true },
      }),
    ]);

    const map24h = new Map<string, number>();
    const mapTotal = new Map<string, number>();
    for (const row of counts24h) {
      if (!row.categoryId) continue;
      map24h.set(`${row.categoryId}|${(row.language ?? 'en').toLowerCase()}`, row._count._all);
    }
    for (const row of countsTotal) {
      if (!row.categoryId) continue;
      mapTotal.set(`${row.categoryId}|${(row.language ?? 'en').toLowerCase()}`, row._count._all);
    }

    const rows: Array<{
      categorySlug: string;
      categoryName: string;
      language: string;
      count24h: number;
      countTotal: number;
      belowMin: boolean;
    }> = [];

    for (const category of categories) {
      for (const language of monitoredLanguages) {
        const key = `${category.id}|${language}`;
        const count24h = map24h.get(key) ?? 0;
        const countTotal = mapTotal.get(key) ?? 0;
        rows.push({
          categorySlug: category.slug,
          categoryName: category.name,
          language,
          count24h,
          countTotal,
          belowMin: count24h < minRequired,
        });
      }
    }

    const lowInventory = rows.filter((r) => r.belowMin);

    return {
      generatedAt: new Date().toISOString(),
      minRequired,
      lastIngestionAt: ingestionMeta._max.lastFetchedAt,
      activeSourceCount: ingestionMeta._count._all,
      categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
      languages: monitoredLanguages,
      rows,
      lowInventory,
    };
  }
}

@Module({ controllers: [AnalyticsController], providers: [PrismaService] })
export class AnalyticsModule {}
