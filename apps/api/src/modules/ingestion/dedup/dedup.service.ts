import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const SIMILARITY_BLOCK_THRESHOLD = 0.7;

@Injectable()
export class DedupService {
  constructor(private readonly prisma: PrismaService) {}

  async isDuplicate(hash: string, body: string): Promise<boolean> {
    // Exact hash match
    const exact = await this.prisma.ingestedArticle.findUnique({ where: { contentHash: hash } });
    if (exact) return true;

    // Simple token-overlap similarity check against recent articles
    const recent = await this.prisma.ingestedArticle.findMany({
      where: { fetchedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { body: true },
      take: 200,
    });

    const incoming = new Set(body.toLowerCase().split(/\s+/).filter((w) => w.length > 4));

    for (const r of recent) {
      const existing = new Set(r.body.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
      const intersection = [...incoming].filter((w) => existing.has(w)).length;
      const union = new Set([...incoming, ...existing]).size;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity >= SIMILARITY_BLOCK_THRESHOLD) return true;
    }

    return false;
  }
}
