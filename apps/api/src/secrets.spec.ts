import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secrets.js';

const SECRET = 'a-test-secret-that-is-at-least-32-characters';

describe('secrets', () => {
  it('round-trips, with a fresh nonce each time', () => {
    const a = encryptSecret(SECRET, 'my-api-key');
    const b = encryptSecret(SECRET, 'my-api-key');
    expect(a).not.toBe(b);
    expect(a).not.toContain('my-api-key');
    expect(decryptSecret(SECRET, a)).toBe('my-api-key');
  });

  it('returns null for the wrong secret or tampered data', () => {
    const sealed = encryptSecret(SECRET, 'my-api-key');
    expect(decryptSecret(`${SECRET}-changed`, sealed)).toBeNull();
    const [v, iv, tag, data] = sealed.split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;
    expect(
      decryptSecret(SECRET, [v, iv, tag, flipped.toString('base64')].join(':')),
    ).toBeNull();
    expect(decryptSecret(SECRET, 'nonsense')).toBeNull();
  });
});
