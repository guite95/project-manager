import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseFlowChart } from './document.ts';
import { validateProjectContent, sandboxedDocument } from './content.ts';

const project = JSON.parse(await readFile(new URL('../../data/imports/focus-ai-2026-09-14.json', import.meta.url), 'utf8'));
const charts = project.categories.flatMap(c => c.charts);

test('원본 24개 콘텐츠와 빈 회의록을 빠짐없이 검증한다', () => {
  assert.equal(charts.length, 25);
  assert.equal(project.categories.length, 9);
  charts.forEach(parseFlowChart);
  assert.equal(charts.filter(c => !c.content).length, 20);
  const schedule = charts.find(c => c.content?.kind === 'schedule').content;
  const items = schedule.phases.flatMap(p => p.groups.flatMap(g => g.items));
  assert.equal(items.length, 111);
  assert.equal(items.filter(i => i.completed).length, 26);
  const erd = charts.find(c => c.content?.kind === 'erd').content;
  assert.equal(erd.tables.length, 38);
  assert.equal(erd.relations.length, 114);
  const slides = charts.find(c => c.content?.kind === 'slides').content;
  assert.equal(slides.slides.length, 14);
  assert.equal(slides.slides.filter(s => s.html.includes('src="data:image/')).length, 2);
  assert.ok(!slides.slides.some(s => /srcset=|src="https?:|<script/i.test(s.html)));
});

test('ERD의 잘못된 FK와 일정의 중복 항목을 거부한다', () => {
  const erd = structuredClone(charts.find(c => c.content?.kind === 'erd').content);
  erd.relations[0].toColumn = 'does-not-exist';
  assert.throws(() => validateProjectContent(erd));
  const schedule = structuredClone(charts.find(c => c.content?.kind === 'schedule').content);
  schedule.phases[0].groups[0].items.push(schedule.phases[0].groups[0].items[0]);
  assert.throws(() => validateProjectContent(schedule));
  assert.throws(() => parseFlowChart({ ...charts[0], content: { kind: 'unknown' } }));
});

test('문서의 CSP는 원문보다 앞에 배치되어 외부 요청과 스크립트를 제한한다', () => {
  const result = sandboxedDocument('<script>alert(1)</script>');
  assert.ok(result.indexOf('Content-Security-Policy') < result.indexOf('<script>'));
  assert.ok(result.includes("default-src 'none'"));
  assert.ok(result.includes("base-uri 'none'"));
});
