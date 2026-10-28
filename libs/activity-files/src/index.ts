import { gunzipSync } from 'node:zlib';
import { parseFit } from './fit.js';
import { parseGpx } from './gpx.js';
import { ActivityFileError, type ParsedActivity } from './types.js';

export * from './types.js';

/**
 * Reads a FIT or GPX file, optionally gzipped (as in Strava and Garmin
 * exports). The format is detected from the content, not the file name.
 */
export async function parseActivityFile(
  data: Uint8Array,
): Promise<ParsedActivity> {
  const bytes = isGzip(data) ? unzip(data) : data;
  if (isFit(bytes)) return parseFit(bytes);
  if (looksLikeXml(bytes)) return parseGpx(bytes);
  throw new ActivityFileError('Unsupported file type; use FIT or GPX');
}

function isGzip(data: Uint8Array) {
  return data[0] === 0x1f && data[1] === 0x8b;
}

function unzip(data: Uint8Array) {
  try {
    return new Uint8Array(gunzipSync(data));
  } catch {
    throw new ActivityFileError('Could not decompress the file');
  }
}

/** FIT files have ".FIT" at byte 8 of the header. */
function isFit(data: Uint8Array) {
  return (
    data.length > 12 &&
    String.fromCharCode(data[8], data[9], data[10], data[11]) === '.FIT'
  );
}

function looksLikeXml(data: Uint8Array) {
  const head = new TextDecoder()
    .decode(data.subarray(0, 512))
    .replace(/^\uFEFF/, '')
    .trimStart();
  return head.startsWith('<');
}
