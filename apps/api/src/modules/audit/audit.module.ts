import { Module } from '@nestjs/common';
import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { safeInt } from '../../common/safe-int.util';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('audit-logs')
class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const page = safeInt(pageRaw, 1, 1, 100000);
    const limit = safeInt(limitRaw, 50, 1, 200);
    return this.prisma.auditLog.findMany({
      where: { ...(entityType && { entityType }), ...(entityId && { entityId }) },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}

@Module({ controllers: [AuditController], providers: [PrismaService] })
export class AuditModule {}
