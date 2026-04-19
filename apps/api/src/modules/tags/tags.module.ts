import { Module } from '@nestjs/common';
import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('tags')
@Controller('tags')
class TagsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()  findAll() { return this.prisma.tag.findMany({ orderBy: { name: 'asc' } }); }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN, Role.CHIEF_EDITOR)
  @Post() create(@Body() dto: { name: string; slug: string }) {
    return this.prisma.tag.create({ data: dto });
  }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)
  @Delete(':id') delete(@Param('id') id: string) {
    return this.prisma.tag.delete({ where: { id } });
  }
}

@Module({ controllers: [TagsController], providers: [PrismaService] })
export class TagsModule {}
