import { updateMeSchema } from './user.js';
import { createInviteSchema } from './invite.js';

describe('schemas', () => {
  it('rejects unknown units', () => {
    expect(updateMeSchema.safeParse({ units: 'furlongs' }).success).toBe(false);
  });

  it('defaults invite expiry to 14 days', () => {
    expect(createInviteSchema.parse({})).toEqual({ expiresInDays: 14 });
  });
});
