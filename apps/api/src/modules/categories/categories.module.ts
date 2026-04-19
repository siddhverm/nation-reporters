import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('categories')
@Controller('categories')
class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()  findAll() { return this.prisma.category.findMany(); }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)
  @Post() create(@Body() dto: { name: string; slug: string; parentId?: string }) {
    return this.prisma.category.create({ data: dto });
  }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: any) {
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)
  @Delete(':id') delete(@Param('id') id: string) {
    return this.prisma.category.delete({ where: { id } });
  }
}

@Module({ controllers: [CategoriesController], providers: [PrismaService] })
export class CategoriesModule {}
