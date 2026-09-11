import assert from 'node:assert/strict';
import test from 'node:test';

test('실제 FK만 추출하고 복합 키, DB 이름, 선택적 1:1을 보존한다', async () => {
  const { parseSchema } = await import('./schema.mjs');
  const result = parseSchema(`
model Parent {
  id String @id @map("parent_key")
  children Child[]
  @@map("parents")
}
model Child {
  tenant String
  id String
  parentId String? @unique @map("parent_id")
  unrelated_id String?
  parent Parent? @relation(fields: [parentId], references: [id])
  @@id([tenant, id])
}
`);
  assert.equal(result.models[0].table, 'parents');
  assert.deepEqual(result.models[1].primaryKey, ['tenant', 'id']);
  assert.equal(result.relations.length, 1);
  assert.deepEqual(result.relations[0], {
    id: 'Child.parent', source: 'Child', target: 'Parent',
    fields: ['parentId'], references: ['id'], optional: true, unique: true,
  });
  assert.equal(result.models[0].fields[0].column, 'parent_key');
});

test('복합 FK의 일부 컬럼만 unique이면 전체 복합 제약도 일대일을 보장한다', async () => {
  const { parseSchema } = await import('./schema.mjs');
  const result = parseSchema(`
model P {
  a String
  b String
  children C[]
  @@id([a,b])
}
model C {
  id String @id
  a String @unique
  b String
  p P @relation(fields: [a,b], references: [a,b])
}
`);
  assert.equal(result.relations[0].unique, true);
  assert.equal(result.relations[0].optional, false);
});
