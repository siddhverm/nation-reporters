import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Role } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { StoryImageController } from './story-image.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

const proto = StoryImageController.prototype;

describe('StoryImageController', () => {
  it('public image route is unauthenticated; takedown route is staff-only (JWT + CHIEF_EDITOR/ADMIN)', () => {
    expect(Reflect.getMetadata('__guards__', proto.image) ?? []).toEqual([]);
    const guards = Reflect.getMetadata('__guards__', proto.replaceWithGenerated);
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata('roles', proto.replaceWithGenerated)).toEqual([Role.CHIEF_EDITOR, Role.ADMIN]);
    expect(Reflect.getMetadata('path', proto.replaceWithGenerated)).toBe(':idOrSlug/image/replace-with-generated');
    expect(Reflect.getMetadata('method', proto.replaceWithGenerated)).toBe(1); // POST
  });
  it('serves the image with origin header and short cache for source pictures', async () => {
    const headers: Record<string, string> = {};
    const res: any = { set: (h: Record<string, string>) => Object.assign(headers, h), send: jest.fn() };
    const ctrl = new StoryImageController({ readStoryImage: async () => ({ buffer: Buffer.from('x'), mimeType: 'image/jpeg', origin: 'source' }) } as never);
    await ctrl.image('a-slug', res);
    expect(headers['X-Image-Origin']).toBe('source');
    expect(headers['Cache-Control']).toBe('public, max-age=3600');
    expect(JSON.stringify(headers)).not.toMatch(/s3|bucket|source-mirror/i);
  });
  it('takedown endpoint returns a summary without storage keys, 404 when unknown', async () => {
    const ok = new StoryImageController({ replaceWithGenerated: async () => ({ found: true, articleId: 'a1', slug: 's', removedAssets: 1, deletedObjects: 1, generated: true, origin: 'generated' }) } as never);
    expect(await ok.replaceWithGenerated('s')).toEqual({ articleId: 'a1', slug: 's', imageOrigin: 'generated', removedSourceAssets: 1, deletedObjects: 1, generatedImageCreated: true });
    const nf = new StoryImageController({ replaceWithGenerated: async () => ({ found: false, removedAssets: 0, deletedObjects: 0, generated: false }) } as never);
    await expect(nf.replaceWithGenerated('x')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('CLI script + npm alias exist', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    expect(pkg.scripts['image:replace-with-generated']).toMatch(/replace-with-generated\.ts/);
    expect(fs.existsSync(path.resolve(__dirname, '../../scripts/replace-with-generated.ts'))).toBe(true);
    expect(Role.ADMIN).toBeDefined();
  });
});
