import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseSchema } from '../lib/erd/schema.mjs';
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/generate-tns-erd.mjs /path/to/tnstrading/apps/web/prisma/schema.prisma');
const schema = await readFile(source, 'utf8');
const data = {source: 'tnstrading/apps/web/prisma/schema.prisma', capturedOn: new Date().toISOString().slice(0, 10), sha256: createHash('sha256').update(schema).digest('hex'), ...parseSchema(schema)};
await writeFile(new URL('../lib/erd/tns-schema.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log(`${data.models.length} tables, ${data.relations.length} foreign keys`);
