import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StoryImageService } from './story-image.service';

/** Public generated image for a story. Never exposes storage keys, bucket names or any source URL. */
@ApiTags('articles')
@Controller('articles')
export class StoryImageController {
  constructor(private readonly images: StoryImageService) {}

  @Get(':idOrSlug/image')
  async image(@Param('idOrSlug') idOrSlug: string, @Res() res: Response) {
    const img = await this.images.readGeneratedImage(idOrSlug);
    if (!img) throw new NotFoundException('No generated image for this story');
    res.set({
      'Content-Type': img.mimeType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(img.buffer);
  }
}
