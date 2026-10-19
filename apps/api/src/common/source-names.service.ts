import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { registerSourceNames, sourceNameVariants } from './source-scrub.util';

type SourceRow = { name: string; feedUrl: string };

/** Build the publisher-name list for every source (names + domain-derived brands). Pure; exported for scripts/tests. */
export function namesFromSources(rows: readonly SourceRow[]): string[] {
  return rows.flatMap((r) => sourceNameVariants(r.name, r.feedUrl));
}

/** Load all (active and inactive) source names from the DB into the process-wide scrub registry. */
export async function loadRegisteredSourceNames(prisma: Pick<PrismaService, 'ingestedSource'>): Promise<number> {
  const rows = await prisma.ingestedSource.findMany({ select: { name: true, feedUrl: true } });
  const names = namesFromSources(rows);
  registerSourceNames(names);
  return names.length;
}

/**
 * Keeps scrubSourceMentions aware of every publisher in the sources table, so ALL stories are cleaned on the way out
 * (read-time) — including stories ingested from feeds that are not in the built-in list. Refreshes every 10 minutes.
 */
@Injectable()
export class SourceNamesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SourceNamesService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), 10 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh() {
    try {
      const n = await loadRegisteredSourceNames(this.prisma);
      this.logger.log(`registered ${n} publisher name variants for source scrubbing`);
    } catch (e) {
      this.logger.warn(`could not load source names: ${(e as Error).message?.slice(0, 120)} (built-in list still applies)`);
    }
  }
}
