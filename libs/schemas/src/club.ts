import { z } from 'zod';

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
});
export type CreateSeries = z.infer<typeof createSeriesSchema>;

/** Edits apply to runs that haven't happened yet; past runs keep their details. */
export const updateSeriesSchema = createSeriesSchema
  .omit({ startsOn: true })
  .partial()
  .extend({ ended: z.boolean().optional() });
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
});
export type Club = z.infer<typeof clubSchema>;

export const createClubSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullish(),
  timezone: timeZoneSchema,
  requireApproval: z.boolean().default(false),
});
export type CreateClub = z.infer<typeof createClubSchema>;

export const updateClubSchema = createClubSchema.partial();
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
  shareLevel: shareLevelSchema,
});

export const myRsvpSchema = z.object({
  status: rsvpStatusSchema,
});
export type MyRsvp = z.infer<typeof myRsvpSchema>;

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
});
export type ClubRun = z.infer<typeof clubRunSchema>;

export const attendeeSchema = z.object({
  userId: z.string(),
  name: z.string(),
  status: rsvpStatusSchema.exclude(['not_going']),
});
export type Attendee = z.infer<typeof attendeeSchema>;

export const clubRunDetailSchema = clubRunSchema.extend({
  clubName: z.string(),
  timezone: z.string(),
  canManage: z.boolean(),
  attendees: z.array(attendeeSchema),
});
export type ClubRunDetail = z.infer<typeof clubRunDetailSchema>;

export const createClubRunSchema = z.object({
  title: z.string().trim().min(1).max(100),
  startsAt: z.iso.datetime({ offset: true }),
  locationId: z.string().nullish(),
  notes: z.string().trim().max(1000).nullish(),
});
export type CreateClubRun = z.infer<typeof createClubRunSchema>;

export const updateClubRunSchema = createClubRunSchema.partial().extend({
  status: z.enum(['scheduled', 'cancelled']).optional(),
  cancelledReason: z.string().trim().max(500).nullish(),
});
export type UpdateClubRun = z.infer<typeof updateClubRunSchema>;

export const rsvpInputSchema = z.object({
  status: rsvpStatusSchema,
});
export type RsvpInput = z.infer<typeof rsvpInputSchema>;
