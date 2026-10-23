// Runs every *.test.mjs in this folder in sequence and fails if any of them fails.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
const failed = [];
for (const f of files) {
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
}
console.log(failed.length ? `\nFEHLGESCHLAGEN: ${failed.join(', ')}` : `\nAlle ${files.length} Testdateien bestanden`);
process.exit(failed.length ? 1 : 0);
