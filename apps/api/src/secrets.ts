import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

// Credentials for other services (API keys, tokens) are encrypted with a key
// derived from BETTER_AUTH_SECRET. This protects a leaked database or backup;
// it can't protect against whoever runs the server, who holds the secret too.

const VERSION = 'v1';

function keyFor(secret: string) {
  return Buffer.from(
    hkdfSync('sha256', secret, 'openrun', 'integration-credentials', 32),
  );
}

export function encryptSecret(secret: string, plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
    .join(':');
}

/** Null if it can't be decrypted, e.g. after BETTER_AUTH_SECRET changed. */
export function decryptSecret(secret: string, sealed: string): string | null {
  const [version, iv, tag, data] = sealed.split(':');
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFor(secret),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
