import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { STORAGE_PROVIDER, StorageProvider } from './storage.types';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Serves avatar images over HTTP for the local-disk storage driver so `<img>`
 * tags can load them (a `file://` URL never renders in a browser). Public and
 * scoped to the `avatars/` folder only — keys are UUID-prefixed and avatars are
 * shown across the app, so this exposes nothing sensitive. Production uses the
 * Supabase driver, whose signed URLs bypass this route entirely.
 */
@Controller({ path: 'storage', version: '1' })
export class StorageController {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  @Public()
  @Get('avatars/:filename')
  async getAvatar(@Param('filename') filename: string, @Res() res: Response): Promise<void> {
    // Guard against path traversal — only a bare filename inside avatars/.
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new NotFoundException('Not found');
    }
    let file: Buffer;
    try {
      file = await this.storage.get(`avatars/${filename}`);
    } catch {
      throw new NotFoundException('Avatar not found');
    }
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(file);
  }

  @Public()
  @Get('reports/:filename')
  async getReport(@Param('filename') filename: string, @Res() res: Response): Promise<void> {
    // Guard against path traversal — only a bare filename inside reports/.
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new NotFoundException('Not found');
    }
    let file: Buffer;
    try {
      file = await this.storage.get(`reports/${filename}`);
    } catch {
      throw new NotFoundException('Report not found');
    }
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    let contentType = 'application/octet-stream';
    if (ext === 'csv') contentType = 'text/csv';
    else if (ext === 'xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (ext === 'pdf') contentType = 'application/pdf';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(file);
  }
}
