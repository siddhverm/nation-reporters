import { Controller, Get, HttpCode, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { StoryImageService } from './story-image.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/** Public story picture (mirrored source image or generated). Never exposes storage keys, bucket names or any source URL. */
@ApiTags('articles')
@Controller('articles')
export class StoryImageController {
  constructor(private readonly images: StoryImageService) {}

  @Get(':idOrSlug/image')
  async image(@Param('idOrSlug') idOrSlug: string, @Res() res: Response) {
    const img = await this.images.readStoryImage(idOrSlug);
    if (!img) throw new NotFoundException('No image for this story');
    res.set({
      'Content-Type': img.mimeType,
      // Source pictures are cached briefly so a takedown takes effect quickly; generated ones are long-lived.
      'Cache-Control': img.origin === 'source'
        ? 'public, max-age=3600'
        : 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
      'X-Image-Origin': img.origin,
    });
    res.send(img.buffer);
  }

  /**
   * Takedown (staff only): swap the story's picture to an AI-generated one and purge the mirrored source image
   * (object + DB rows). Idempotent.
   */
  @Post(':idOrSlug/image/replace-with-generated')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN)
  async replaceWithGenerated(@Param('idOrSlug') idOrSlug: string) {
    const out = await this.images.replaceWithGenerated(idOrSlug);
    if (!out.found) throw new NotFoundException('Article not found');
    return {
      articleId: out.articleId, slug: out.slug, imageOrigin: out.origin,
      removedSourceAssets: out.removedAssets, deletedObjects: out.deletedObjects, generatedImageCreated: out.generated,
    };
  }
}
