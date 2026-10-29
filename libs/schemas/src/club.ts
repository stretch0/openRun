import { z } from 'zod';
import { editSchema } from './patch.js';
import { menuItemSchema, runCoffeeSchema, usualSchema } from './coffee.js';

export const clubRoleSchema = z.enum(['owner', 'organiser', 'member']);
export type ClubRole = z.infer<typeof clubRoleSchema>;

export const memberStatusSchema = z.enum(['active', 'pending']);

/** What a member shares with a club. See docs/PRIVACY.md. */
export const shareLevelSchema = z.enum(['attendance', 'summaries', 'full']);
export type ShareLevel = z.infer<typeof shareLevelSchema>;

export const rsvpStatusSchema = z.enum(['going', 'maybe', 'not_going']);
export type RsvpStatus = z.infer<typeof rsvpStatusSchema>;

export const weekdaySchema = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);

const timeZoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Unknown time zone' },
);

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, e.g. 08:00');
const daySchema = z.iso.date();
/** Minutes before the start that coffee orders lock. */
const cutoffSchema = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);

export const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  notes: z.string().nullable(),
});
export type ClubLocation = z.infer<typeof locationSchema>;

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  notes: z.string().trim().max(500).nullish(),
});
export type CreateLocation = z.infer<typeof createLocationSchema>;

export const seriesSchema = z.object({
  id: z.string(),
  title: z.string(),
  days: z.array(weekdaySchema),
  interval: z.number(),
  /** e.g. "Every Saturday". */
  summary: z.string(),
  startsOn: z.string(),
  startTime: z.string(),
  locationId: z.string().nullable(),
  notes: z.string().nullable(),
  orderCutoffMin: z.number(),
  ended: z.boolean(),
});
export type Series = z.infer<typeof seriesSchema>;

export const createSeriesSchema = z.object({
  title: z.string().trim().min(1).max(100),
  days: z.array(weekdaySchema).min(1),
  interval: z.number().int().min(1).max(4).default(1),
  startsOn: daySchema,
  startTime: timeSchema,
  locationId: z.string().nullish(),
  notes: z.string().trim().max(1000).nullish(),
  orderCutoffMin: cutoffSchema.default(0),
});
export type CreateSeries = z.infer<typeof createSeriesSchema>;

/** Edits apply to runs that haven't happened yet; past runs keep their details. */
export const updateSeriesSchema = editSchema(
  createSeriesSchema.omit({ startsOn: true }),
).extend({ ended: z.boolean().optional() });
export type UpdateSeries = z.infer<typeof updateSeriesSchema>;

export const memberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: clubRoleSchema,
  status: memberStatusSchema,
});
export type Member = z.infer<typeof memberSchema>;

const nextRunSchema = z.object({
  id: z.string(),
  title: z.string(),
  startsAt: z.iso.datetime(),
});

export const clubSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  timezone: z.string(),
  role: clubRoleSchema,
  status: memberStatusSchema,
  shareLevel: shareLevelSchema,
  muted: z.boolean(),
  /** Whether I appear by name in the club's highlights. */
  highlights: z.boolean(),
  memberCount: z.number(),
  nextRun: nextRunSchema.nullable(),
});
export type ClubSummary = z.infer<typeof clubSummarySchema>;

export const clubSchema = clubSummarySchema.extend({
  requireApproval: z.boolean(),
  /** Only organisers and the owner see the code. */
  joinCode: z.string().nullable(),
  locations: z.array(locationSchema),
  series: z.array(seriesSchema),
  /** Pending members are only listed for organisers. */
  members: z.array(memberSchema),
  /** The café menu. Organisers also see hidden items. */
  menu: z.array(menuItemSchema),
  myUsual: usualSchema.nullable(),
});
export type Club = z.infer<typeof clubSchema>;

export const createClubSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullish(),
  timezone: timeZoneSchema,
  requireApproval: z.boolean().default(false),
});
export type CreateClub = z.infer<typeof createClubSchema>;

export const updateClubSchema = editSchema(createClubSchema);
export type UpdateClub = z.infer<typeof updateClubSchema>;

/** What someone sees before joining from an invite link. */
export const clubPreviewSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number(),
  requireApproval: z.boolean(),
  /** Their membership if they already have one. */
  status: memberStatusSchema.nullable(),
});
export type ClubPreview = z.infer<typeof clubPreviewSchema>;

export const joinClubSchema = z.object({ code: z.string().trim().min(1) });

export const updateMemberSchema = z.object({
  role: clubRoleSchema.exclude(['owner']).optional(),
  status: z.literal('active').optional(),
});
export type UpdateMember = z.infer<typeof updateMemberSchema>;

export const updateMyMembershipSchema = z.object({
  shareLevel: shareLevelSchema.optional(),
  /** No notifications from this club. */
  muted: z.boolean().optional(),
  highlights: z.boolean().optional(),
});

export const myRsvpSchema = z.object({
  status: rsvpStatusSchema,
});
export type MyRsvp = z.infer<typeof myRsvpSchema>;

/** The forecast for a run's start. See libs/domain/weather. */
export const runWeatherSchema = z.object({
  code: z.number(),
  temperatureC: z.number(),
  precipitationChance: z.number(),
  windKmh: z.number(),
});

export const clubRunSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  seriesId: z.string().nullable(),
  title: z.string(),
  startsAt: z.iso.datetime(),
  location: locationSchema.nullable(),
  notes: z.string().nullable(),
  status: z.enum(['scheduled', 'cancelled']),
  cancelledReason: z.string().nullable(),
  going: z.number(),
  maybe: z.number(),
  myRsvp: myRsvpSchema.nullable(),
  weather: runWeatherSchema.nullable(),
});
export type ClubRun = z.infer<typeof clubRunSchema>;

export const attendeeSchema = z.object({
  userId: z.string(),
  name: z.string(),
  status: rsvpStatusSchema.exclude(['not_going']),
});
export type Attendee = z.infer<typeof attendeeSchema>;

/** A run a member shared with the club: a copy, not their run log. */
export const clubShareSchema = z.object({
  id: z.string(),
  userId: z.string(),
  memberName: z.string(),
  title: z.string(),
  startedAt: z.iso.datetime(),
  distanceM: z.number(),
  durationS: z.number(),
  /** [lat, lng] with privacy zones as null; null if shared without a map. */
  track: z.array(z.tuple([z.number(), z.number()]).nullable()).nullable(),
});
export type ClubShare = z.infer<typeof clubShareSchema>;

export const clubRunDetailSchema = clubRunSchema.extend({
  clubName: z.string(),
  timezone: z.string(),
  canManage: z.boolean(),
  attendees: z.array(attendeeSchema),
  /** Null when the club has nothing on its menu. */
  coffee: runCoffeeSchema.nullable(),
  /** Runs members shared that started around this run. */
  shares: z.array(clubShareSchema),
});
export type ClubRunDetail = z.infer<typeof clubRunDetailSchema>;

export const createClubRunSchema = z.object({
  title: z.string().trim().min(1).max(100),
  startsAt: z.iso.datetime({ offset: true }),
  locationId: z.string().nullish(),
  notes: z.string().trim().max(1000).nullish(),
  orderCutoffMin: cutoffSchema.default(0),
});
export type CreateClubRun = z.infer<typeof createClubRunSchema>;

export const updateClubRunSchema = editSchema(createClubRunSchema).extend({
  status: z.enum(['scheduled', 'cancelled']).optional(),
  cancelledReason: z.string().trim().max(500).nullish(),
});
export type UpdateClubRun = z.infer<typeof updateClubRunSchema>;

export const rsvpInputSchema = z.object({
  status: rsvpStatusSchema,
});
export type RsvpInput = z.infer<typeof rsvpInputSchema>;

/** Fun, never competitive: see libs/domain/highlights. */
export const clubHighlightsSchema = z.object({
  thisMonth: z.object({
    turnout: z.number(),
    runs: z.number(),
    sharedDistanceM: z.number(),
  }),
  streaks: z.array(
    z.object({ userId: z.string(), name: z.string(), weeks: z.number() }),
  ),
  moments: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      text: z.string(),
      at: z.iso.datetime(),
    }),
  ),
  /** Recently shared runs. */
  recentShares: z.array(clubShareSchema),
});
export type ClubHighlights = z.infer<typeof clubHighlightsSchema>;

/** A club I could share one of my runs with. */
export const shareTargetSchema = z.object({
  clubId: z.string(),
  clubName: z.string(),
  shareLevel: shareLevelSchema,
  shared: z.boolean(),
  /** Whether a share includes the route (level and privacy settings allow). */
  withMap: z.boolean(),
});
export type ShareTarget = z.infer<typeof shareTargetSchema>;
