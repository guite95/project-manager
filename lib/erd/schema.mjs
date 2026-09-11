// TNS schema snapshot reader. Fail on unsupported declarations instead of omitting them.
const list = (value = '') => value.split(',').map(v => v.trim()).filter(Boolean);
export function parseSchema(schema) {
  schema = schema.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  if (!blocks.length) throw new Error('No models found');
  const names = new Set(blocks.map(b => b[1]));
  const relations = [];
  const models = blocks.map(([, name, body]) => {
    const primaryKey = list(body.match(/@@id\(\[([^\]]+)\]/)?.[1]);
    const uniqueKeys = [...body.matchAll(/@@unique\(\[([^\]]+)\]/g)].map(m => list(m[1]));
    const fields = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const match = line.match(/^(\w+)\s+(\w+)(\[\]|\?)?(?:\s+(.*))?$/);
      if (!match) throw new Error(`Unsupported field: ${name}: ${line}`);
      const [, field, type, suffix = '', attrs = ''] = match;
      if (names.has(type)) {
        if (attrs.includes('@relation')) {
          const from = attrs.match(/fields:\s*\[([^\]]+)\]/);
          const to = attrs.match(/references:\s*\[([^\]]+)\]/);
          if (from && to) relations.push({id: `${name}.${field}`, source: name, target: type, fields: list(from[1]), references: list(to[1]), optional: suffix === '?', unique: false});
          else if (from || to) throw new Error(`Incomplete relation: ${name}.${field}`);
        }
        continue;
      }
      if (/@id\b/.test(attrs)) primaryKey.push(field);
      if (/@unique\b/.test(attrs)) uniqueKeys.push([field]);
      fields.push({name: field, column: attrs.match(/@map\("([^"]+)"\)/)?.[1] ?? field, type: (attrs.match(/@db\.(\w+(?:\([^)]*\))?)/)?.[1] ?? type) + (suffix === '[]' ? '[]' : ''), optional: suffix === '?'});
    }
    return {name, table: body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name, primaryKey, uniqueKeys, fields};
  });
  for (const r of relations) {
    const model = models.find(m => m.name === r.source);
    const target = models.find(m => m.name === r.target);
    if (r.fields.length !== r.references.length || !r.fields.every(f => model.fields.some(c => c.name === f)) || !r.references.every(f => target.fields.some(c => c.name === f))) throw new Error(`Invalid relation: ${r.id}`);
    r.unique = [model.primaryKey, ...model.uniqueKeys].some(key => key.length && key.every(f => r.fields.includes(f)));
  }
  return {models, relations};
}
