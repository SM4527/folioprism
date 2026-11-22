import fs from 'node:fs';
import path from 'node:path';

/** True only when LOCAL_OVERLAY=on (the personal stack and tests); off everywhere else. */
export function overlayOn(): boolean {
  return process.env.LOCAL_OVERLAY === 'on';
}

/** A JSON object from the gitignored local data directory, or {} when the overlay is off or the file is absent. */
export function readLocal(name: string): Record<string, unknown> {
  if (!overlayOn()) return {};
  const dir = process.env.LOCAL_DATA_DIR ?? path.join(process.cwd(), 'data', 'local');
  const file = path.join(/*turbopackIgnore: true*/ dir, name);
  return fs.existsSync(/*turbopackIgnore: true*/ file) ? JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf8')) : {};
}
