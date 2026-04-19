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
}

@Module({ controllers: [AnalyticsController], providers: [PrismaService] })
export class AnalyticsModule {}
