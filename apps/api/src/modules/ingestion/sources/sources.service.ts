import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IngestionCronService } from '../cron/ingestion-cron.service';

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cron: IngestionCronService,
  ) {}

  findAll() {
    return this.prisma.ingestedSource.findMany({ orderBy: { name: 'asc' } });
  }

  create(data: {
    name: string;
    feedUrl: string;
    type: string;
    language?: string;
    isTrusted?: boolean;
    rightsMetadata?: object;
  }) {
    return this.prisma.ingestedSource.create({ data });
  }

  async update(
    id: string,
    data: Partial<{ name: string; language: string; isActive: boolean; isTrusted: boolean }>,
  ) {
    const source = await this.prisma.ingestedSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source not found');
    return this.prisma.ingestedSource.update({ where: { id }, data });
  }

  async delete(id: string) {
    const source = await this.prisma.ingestedSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source not found');
    return this.prisma.ingestedSource.delete({ where: { id } });
  }

  async fetchNow(id: string) {
    const source = await this.prisma.ingestedSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source not found');
    return this.cron.fetchSource(source);
  }

  async fetchAll() {
    return this.cron.runScheduledIngestion();
  }
}
