import { asc, eq } from 'drizzle-orm';
import { type Db, schema } from '@openrun/db';
import { type Circle, type Stream, trimStream } from '@openrun/domain';
import type { PrivacySettings } from '@openrun/schemas';

export const DEFAULT_PRIVACY: PrivacySettings = {
  defaultVisibility: 'private',
  shareMap: false,
};

export function getPrivacySettings(db: Db, userId: string): PrivacySettings {
  const row = db
    .select()
    .from(schema.privacySettings)
    .where(eq(schema.privacySettings.userId, userId))
    .get();
  return row
    ? { defaultVisibility: row.defaultVisibility, shareMap: row.shareMap }
    : DEFAULT_PRIVACY;
}

export function listZones(db: Db, userId: string) {
  return db
    .select()
    .from(schema.privacyZone)
    .where(eq(schema.privacyZone.userId, userId))
    .orderBy(asc(schema.privacyZone.name))
    .all();
}

/** The randomised circles applied to shared tracks. */
export function trimCircles(db: Db, userId: string): Circle[] {
  return listZones(db, userId).map((z) => ({
    lat: z.trimLat,
    lng: z.trimLng,
    radiusM: z.trimRadiusM,
  }));
}

/**
 * A stream as anyone other than its owner may see it: no positions at all
 * unless the owner shares maps, and never positions inside a privacy zone.
 */
export function sharedStream(db: Db, userId: string, stream: Stream): Stream {
  if (!getPrivacySettings(db, userId).shareMap) {
    const none = stream.t.map(() => null);
    return { ...stream, lat: none, lng: none };
  }
  return trimStream(stream, trimCircles(db, userId));
}
