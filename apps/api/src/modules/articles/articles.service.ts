import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { ArticleStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditModule } from '../audit/audit.module';
import { assertTransition } from './status.machine';
import { CreateArticleDto } from './dto/create-article.dto';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreateArticleDto) {
    const slug = await this.generateSlug(dto.title);
    const article = await this.prisma.article.create({
      data: {
        title: dto.title,
        slug,
        body: (dto.body as object | null) ?? {},
        excerpt: dto.excerpt,
        language: dto.language ?? 'en',
        categoryId: dto.categoryId,
        regionId: dto.regionId,
        authorId,
        tags: dto.tagIds
          ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: { tags: { include: { tag: true } }, mediaAssets: true },
    });

    await this.prisma.articleVersion.create({
      data: { articleId: article.id, title: article.title, body: article.body as object, changedById: authorId },
    });

    return article;
  }

  async findAll(filters: {
    status?: ArticleStatus;
    categoryId?: string;
    authorId?: string;
    language?: string;
    page?: number;
    limit?: number;
  }) {
    const p     = Math.max(1, parseInt(String(filters.page  ?? 1),  10) || 1);
    const take  = Math.min(100, parseInt(String(filters.limit ?? 20), 10) || 20);
    const { status, categoryId, authorId, language } = filters;
    const where = {
      ...(status     && { status }),
      ...(categoryId && { categoryId }),
      ...(authorId   && { authorId }),
      ...(language   && { language }),
    };

    const [data, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip: (p - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        include: { tags: { include: { tag: true } }, riskAssessment: true },
      }),
      this.prisma.article.count({ where }),
    ]);
    const page = p; const limit = take;

    return { data, total, page, limit };
  }

  async findOne(idOrSlug: string) {
    const include = {
      tags: { include: { tag: true } },
      mediaAssets: true,
      versions: { orderBy: { changedAt: 'desc' } as const, take: 10 },
      riskAssessment: true,
      socialCaptions: true,
      provenance: true,
    };
    // Try UUID first, fall back to slug lookup
    const isUuid = /^[0-9a-f-]{36}$/.test(idOrSlug);
    const article = isUuid
      ? await this.prisma.article.findUnique({ where: { id: idOrSlug }, include })
      : await this.prisma.article.findUnique({ where: { slug: idOrSlug }, include });
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  async update(id: string, userId: string, userRole: Role, data: Partial<CreateArticleDto>) {
    const article = await this.findOne(id);

    if (userRole === Role.REPORTER && article.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own articles');
    }

    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        title: data.title ?? article.title,
        body: (data.body as object | null) ?? (article.body as object),
        excerpt: data.excerpt,
        categoryId: data.categoryId,
        regionId: data.regionId,
      },
    });

    await this.prisma.articleVersion.create({
      data: { articleId: id, title: updated.title, body: updated.body as object, changedById: userId },
    });

    return updated;
  }

  async transition(id: string, to: ArticleStatus, editorId?: string) {
    const article = await this.findOne(id);
    assertTransition(article.status, to);

    return this.prisma.article.update({
      where: { id },
      data: {
        status: to,
        ...(editorId && { editorId }),
        ...(to === ArticleStatus.PUBLISHED && { publishedAt: new Date() }),
      },
    });
  }

  private async generateSlug(title: string): Promise<string> {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const exists = await this.prisma.article.findUnique({ where: { slug: base } });
    return exists ? `${base}-${Date.now()}` : base;
  }
}
