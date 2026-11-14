// Entry point so that `node --test tests/` works on Node versions that resolve a directory
// argument as a module path: it simply loads every *.test.mjs file in this folder.
import { readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  await import(new URL(f, dir).href);
}
