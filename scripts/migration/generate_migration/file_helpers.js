import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

export const writeFile = promisify(fs.writeFile);

export function dropExtension(s) {
  const ext = path.extname(s);
  return ext ? s.slice(0, -ext.length) : s;
}

export async function ensureDir(dir) {
  const exists = await promisify(fs.exists)(dir);
  if (!exists) {
    await promisify(fs.mkdir)(dir);
  }
}
