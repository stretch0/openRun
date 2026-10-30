import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import sharp from 'sharp';
import { schema } from '@openrun/db';
import type { ClubLogo } from '@openrun/schemas';
import type { AuthedEnv } from '../context.js';
import { safePath, writeDataFile } from '../data-files.js';
import { canManage } from './access.js';
import { type Ctx, findClub, forbidden, me, notFound } from './helpers.js';

type ClubRow = typeof schema.club.$inferSelect;

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** Logos are stored as squares this many pixels across. */
export const LOGO_SIZE = 256;
/** Refuse images that decode to more pixels than this (about 6000 × 6000). */
const MAX_INPUT_PIXELS = 36_000_000;

/** What the bytes say the file is, whatever it's called. */
export function sniffImageType(bytes: Uint8Array) {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(1, 4) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

/** Turned upright, cropped to the middle square and shrunk, as WebP. */
export async function squareLogo(bytes: Uint8Array) {
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'cover', withoutEnlargement: false })
    .webp({ quality: 85 })
    .toBuffer();
}

/** Relative to DATA_DIR. */
function logoPath(clubId: string) {
  return join('clubs', clubId, 'logo.webp');
}

/** The versioned URL members fetch the logo from, or null for none. */
export function logoUrl(club: Pick<ClubRow, 'id' | 'logoVersion'>) {
  return club.logoVersion
    ? `/api/clubs/${club.id}/logo?v=${club.logoVersion}`
    : null;
}

/** For the invite page, before someone is a member. */
export function previewLogoUrl(club: ClubRow) {
  return club.logoVersion
    ? `/api/clubs/preview/${club.joinCode}/logo?v=${club.logoVersion}`
    : null;
}

/** Deletes a club's stored files, when the club itself is deleted. */
export function removeClubFiles(dataDir: string, clubId: string) {
  rmSync(safePath(dataDir, join('clubs', clubId)), {
    recursive: true,
    force: true,
  });
}

function sendLogo(c: Ctx, club: ClubRow) {
  const path = safePath(c.get('config').dataDir, logoPath(club.id));
  if (!club.logoVersion || !existsSync(path)) return notFound(c);
  return c.body(readFileSync(path), 200, {
    'content-type': 'image/webp',
    // The URL changes with every upload.
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
}

function setVersion(c: Ctx, clubId: string, logoVersion: number | null) {
  const [updated] = c
    .get('db')
    .update(schema.club)
    .set({ logoVersion })
    .where(eq(schema.club.id, clubId))
    .returning()
    .all();
  const body: ClubLogo = { logoUrl: logoUrl(updated) };
  return c.json(body);
}

export const logoRoutes = new Hono<AuthedEnv>()
  // Anyone who can see the club in their list, pending or not.
  .get('/:id/logo', (c) => {
    const club = findClub(c, c.req.param('id'));
    if (!club || !me(c, club.id)) return notFound(c);
    return sendLogo(c, club);
  })
  // Anyone with the invite link, like the preview itself.
  .get('/preview/:code/logo', (c) => {
    const club = c
      .get('db')
      .select()
      .from(schema.club)
      .where(eq(schema.club.joinCode, c.req.param('code').toUpperCase()))
      .get();
    if (!club) return notFound(c);
    return sendLogo(c, club);
  })
  .put(
    '/:id/logo',
    bodyLimit({
      // Room for the multipart wrapping around the file.
      maxSize: MAX_LOGO_BYTES + 64 * 1024,
      onError: (c) => c.json({ error: 'Logos can be up to 2 MB' }, 413),
    }),
    async (c) => {
      const club = findClub(c, c.req.param('id'));
      const m = club && me(c, club.id);
      if (!club || !m) return notFound(c);
      if (!canManage(m)) return forbidden(c);
      const file = (await c.req.parseBody())['logo'];
      if (!(file instanceof File)) {
        return c.json({ error: 'No image uploaded' }, 400);
      }
      if (file.size > MAX_LOGO_BYTES) {
        return c.json({ error: 'Logos can be up to 2 MB' }, 413);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!sniffImageType(bytes)) {
        return c.json({ error: 'Use a PNG, JPEG or WebP image' }, 415);
      }
      let logo: Uint8Array;
      try {
        logo = await squareLogo(bytes);
      } catch {
        return c.json({ error: 'That image couldn’t be read' }, 400);
      }
      writeDataFile(c.get('config').dataDir, logoPath(club.id), logo);
      // Always newer than the last version, so cached copies are never reused.
      return setVersion(
        c,
        club.id,
        Math.max(Date.now(), (club.logoVersion ?? 0) + 1),
      );
    },
  )
  .delete('/:id/logo', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    removeClubFiles(c.get('config').dataDir, club.id);
    return setVersion(c, club.id, null);
  });
