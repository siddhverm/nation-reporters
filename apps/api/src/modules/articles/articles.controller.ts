import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ArticleStatus, Role } from '@prisma/client';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('articles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('articles')
export class ArticlesController {
  constructor(private readonly svc: ArticlesService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateArticleDto) {
    return this.svc.create(user.id, dto);
  }

  @Get()
  findAll(
    @Query('status') status?: ArticleStatus,
    @Query('categoryId') categoryId?: string,
    @Query('authorId') authorId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.findAll({ status, categoryId, authorId, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: Partial<CreateArticleDto>,
  ) {
    return this.svc.update(id, user.id, user.role, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(@Param('id') id: string) {
    return this.svc.transition(id, ArticleStatus.PENDING_REVIEW);
  }

  @Post(':id/approve')
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN)
  @HttpCode(200)
  approve(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.transition(id, ArticleStatus.APPROVED, user.id);
  }

  @Post(':id/reject')
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN)
  @HttpCode(200)
  reject(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.transition(id, ArticleStatus.NEEDS_EDIT, user.id);
  }

  @Post(':id/publish')
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN)
  @HttpCode(200)
  publish(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.transition(id, ArticleStatus.PUBLISHING, user.id);
  }

  @Get(':id/versions')
  versions(@Param('id') id: string) {
    return this.svc.findOne(id).then((a) => a.versions);
  }
}
