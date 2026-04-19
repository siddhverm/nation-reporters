import { Module } from '@nestjs/common';
import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

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
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.prisma.auditLog.findMany({
      where: { ...(entityType && { entityType }), ...(entityId && { entityId }) },
      skip: (+page - 1) * +limit,
      take: +limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}

@Module({ controllers: [AuditController], providers: [PrismaService] })
export class AuditModule {}
