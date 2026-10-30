import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

// Files kept under DATA_DIR next to the database: original run files in
// files/, club logos in clubs/.

export function writeDataFile(dataDir: string, path: string, data: Uint8Array) {
  const full = safePath(dataDir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
}

export function removeDataFile(dataDir: string, path: string) {
  rmSync(safePath(dataDir, path), { force: true });
}

/** Resolves `path` inside `dataDir`, refusing anything that escapes it. */
export function safePath(dataDir: string, path: string) {
  const root = resolve(dataDir);
  const full = resolve(root, path);
  if (!full.startsWith(root + sep)) throw new Error(`Bad data path: ${path}`);
  return full;
}
