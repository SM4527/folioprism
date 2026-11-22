import fs from 'node:fs';
import path from 'node:path';

/** Gitignored personal data; LOCAL_DATA_DIR points tests at data/local.example. */
const dir = process.env.LOCAL_DATA_DIR ?? path.join(process.cwd(), 'data', 'local');

/** A JSON object from the local data directory, or {} when the file is absent; read at runtime, never traced. */
export function readLocal(name: string): Record<string, unknown> {
  const file = path.join(/*turbopackIgnore: true*/ dir, name);
  return fs.existsSync(/*turbopackIgnore: true*/ file) ? JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf8')) : {};
}
