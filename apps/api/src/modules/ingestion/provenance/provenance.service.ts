import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ProvenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async record(data: {
    ingestedArticleId?: string;
    articleId?: string;
    sourceUrl: string;
    sourceTitle: string;
    sourceName: string;
    fetchedAt: Date;
    rightsMetadata?: object;
    attributionNote?: string;
  }) {
    return this.prisma.contentProvenance.create({ data });
  }

  async getForArticle(articleId: string) {
    return this.prisma.contentProvenance.findUnique({ where: { articleId } });
  }
}
