import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseFlowChart } from './document.ts';

const chart = parseFlowChart(JSON.parse(readFileSync(new URL('../../data/flows/tns-finance-sales.json', import.meta.url), 'utf8')));
const node = id => chart.nodes.find(n => n.id === id);
const edge = (source, target) => chart.edges.find(e => e.source === source && e.target === target);
const text = id => JSON.stringify(node(id).data.sections);

test('확정 규칙의 출고 전제: 계약 생성, 리테일 기본/예외, 프로젝트 분할, OR 이후 AND', () => {
  assert.equal(edge('contract-create', 'order').kind, 'future');
  assert.equal(edge('order', 'contract-create'), undefined);
  assert.match(node('order').data.label, /진행.*확정/);
  for (const id of ['prepay', 'credit', 'installment']) assert(edge('order', id));
  assert.match(node('prepay').data.label, /기본/);
  assert.match(node('credit').data.label, /예외/);
  assert.match(node('installment').data.label, /필수/);
  assert.equal(edge('prepay', 'ship'), undefined);
  assert.equal(edge('installment', 'bank').kind, 'ref');
  assert.match(node('payment-gate').data.label, /OR/);
  assert.match(node('ship-gate').data.label, /AND/);
  assert.deepEqual(chart.edges.filter(e => e.target === 'ship-gate').map(e => e.source).sort(), ['payment-gate', 'procure']);
  assert.deepEqual(chart.edges.filter(e => e.target === 'ship').map(e => e.source).sort(), ['returns', 'ship-gate']);
});

test('원가·매출·수금·취소의 구현된 연결과 목표 트리거를 구분한다', () => {
  for (const [a,b] of [['ship','cogs'],['invoice-sales','ar'],['bank','receipt'],['bank','receipt-reverse'],['returns','cogs']]) {
    assert.equal(edge(a,b).kind, 'impl', `${a} → ${b}`);
  }
  for (const [a,b] of [['ship','revenue'],['revenue','ar'],['revenue','invoice-sales'],['advance','invoice-advance']]) {
    assert.equal(edge(a,b).kind, 'future', `${a} → ${b}`);
  }
  assert.match(text('ship'), /매출원가/);
  assert.match(text('ar'), /부가세예수금/);
  assert.match(text('cogs'), /shipment_lines.unit_cost/);
  assert.match(text('cogs'), /미설계/);
  assert.match(text('invoice-sales'), /중복/);
});

test('반품의 증빙·재고·카드 연결과 현행 수금 취소 경로를 보존한다', () => {
  assert.match(text('returns'), /수정세금계산서/);
  assert.match(text('returns'), /부가세/);
  assert(edge('returns','ship'));
  assert(edge('cardpay','returns'));
  assert.equal(edge('returns','receipt-reverse').kind,'impl');
  assert.match(node('card').data.label, /고객 카드 수취/);
  assert.match(text('card'), /법인카드 지출/);
});

test('모든 노드는 공통 본문·축·회계 유무를 표시하고 로직에는 화면 배너가 없다', () => {
  const allowed = new Set(['화면','기능','회계 처리','확인 사항']);
  for (const n of chart.nodes) {
    const sections = n.data.sections;
    assert(sections.every(s=>allowed.has(s.title)));
    for (const title of ['기능','회계 처리','확인 사항']) assert.equal(sections.filter(s=>s.title===title).length,1);
    assert(sections.find(s=>s.title==='확인 사항').lines.some(line=>line.startsWith('축:')));
    assert(!/^\d+\./.test(n.data.label));
  }
  for (const id of ['contract-create','advance','payment-gate','ship-gate','revenue','cogs','receipt','receipt-reverse']) {
    assert(!node(id).data.sections.some(s=>s.title==='화면'),id);
  }
  const reached = new Set(['contract-create']);
  while (true) {
    const before = reached.size;
    for (const e of chart.edges) if (reached.has(e.source)) reached.add(e.target);
    if (before === reached.size) break;
  }
  assert.equal(reached.size,chart.nodes.length);
});
