import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DedupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * URL/content-hash dedup only. Fuzzy word overlap was blocking regional feeds when
   * fetched HTML contained shared English chrome.
   */
  async isDuplicate(hash: string, _body?: string, _articleLanguage?: string): Promise<boolean> {
    const exact = await this.prisma.ingestedArticle.findUnique({ where: { contentHash: hash } });
    return Boolean(exact);
  }
}
