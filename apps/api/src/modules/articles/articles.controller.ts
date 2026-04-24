import {
  Controller, Get, Post, Patch, Body, Param,
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
@Controller('articles')
export class ArticlesController {
  constructor(private readonly svc: ArticlesService) {}

  // ── Public read endpoints (no auth required) ──────────────────────────────

  @Get()
  findAll(
    @Query('status') status?: ArticleStatus,
    @Query('categoryId') categoryId?: string,
    @Query('authorId') authorId?: string,
    @Query('language') language?: string,
    @Query('hasVideo') hasVideo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.findAll({
      status,
      categoryId,
      authorId,
      language,
      hasVideo: hasVideo === 'true',
      page,
      limit,
    });
  }

  @Get('country-feed')
  countryFeed(
    @Query('localLang') localLang = 'en',
    @Query('globalLang') globalLang = 'en',
    @Query('localLimit') localLimit?: number,
    @Query('globalLimit') globalLimit?: number,
  ) {
    return this.svc.findCountryFeed({ localLang, globalLang, localLimit, globalLimit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/versions')
  versions(@Param('id') id: string) {
    return this.svc.findOne(id).then((a) => a.versions);
  }

  // ── Authenticated write endpoints ─────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateArticleDto) {
    return this.svc.create(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: Role },
    @Body() dto: Partial<CreateArticleDto>,
  ) {
    return this.svc.update(id, user.id, user.role, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/submit')
  @HttpCode(200)
  submit(@Param('id') id: string) {
    return this.svc.transition(id, ArticleStatus.PENDING_REVIEW);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN)
  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.transition(id, ArticleStatus.APPROVED, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN)
  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.transition(id, ArticleStatus.NEEDS_EDIT, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN)
  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.transition(id, ArticleStatus.PUBLISHING, user.id);
  }
}
