import {
  updateActivitySchema,
  updateClubSchema,
  updateSeriesSchema,
  updateShoeSchema,
} from './index.js';

describe('edit schemas', () => {
  it('leave out fields that were not sent, rather than resetting them', () => {
    expect(updateClubSchema.parse({ name: 'Renamed' })).toEqual({
      name: 'Renamed',
    });
    expect(updateSeriesSchema.parse({ title: 'Renamed' })).toEqual({
      title: 'Renamed',
    });
    expect(updateShoeSchema.parse({ retired: true })).toEqual({
      retired: true,
    });
    expect(updateActivitySchema.parse({ name: 'Renamed' })).toEqual({
      name: 'Renamed',
    });
  });

  it('still validate the fields that were sent', () => {
    expect(updateSeriesSchema.safeParse({ interval: 9 }).success).toBe(false);
  });
});
