import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decisions} from './fixtures.mjs';
import {execFileSync} from 'node:child_process';
import {parseInput} from './core.ts';
import {probeCases} from './probe-cases.mjs';
const api=await import('./live-probe.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const request={state:'synthetic',questions:{q:{type:'score',instructions:'grade',criteria:['a','b','c','d','e']}}};
test('실호출 계량기는 파서 실패 비용도 기록하고 다음 호출을 중단한다',async()=>{
  assert.equal(typeof api.createMeteredProvider,'function');
  let calls=0;
  const meter=api.createMeteredProvider(async()=>{calls++;const raw=decisions(request.questions);raw.answers={};return raw;},{maxCalls:5,maxCost:.1});
  await assert.rejects(meter.provider(request),/INVALID_PROVIDER_COVERAGE/);
  assert.equal(meter.snapshot().reportedCost,.001);assert.equal(meter.snapshot().receipts[0].id,'test-request');
  await assert.rejects(meter.provider(request),/PROBE_STOPPED/);assert.equal(calls,1);
});
test('호출 수/비용 예산을 전송 전에 제한하고 네트워크 실패 비용을 0으로 확정하지 않는다',async()=>{
  assert.equal(typeof api.createMeteredProvider,'function');
  const one=api.createMeteredProvider(async()=>decisions(request.questions),{maxCalls:1,maxCost:.1});
  await one.provider(request);await assert.rejects(one.provider(request),/PROBE_CALL_LIMIT/);
  const budget=api.createMeteredProvider(()=>assert.fail('no request'),{maxCalls:2,maxCost:.001});
  await assert.rejects(budget.provider(request),/PROBE_COST_LIMIT/);
  const broken=api.createMeteredProvider(async()=>{throw new Error('secret');},{maxCalls:2,maxCost:.1});
  await assert.rejects(broken.provider(request),e=>!e.message.includes('secret'));
  assert.equal(broken.snapshot().unknownCostCalls,1);assert.equal(broken.snapshot().costComplete,false);
  await assert.rejects(broken.provider(request),/PROBE_STOPPED/);
});
test('실호출 명시 없는 CLI는 키 없이 계획만 출력하고 별도 사례의 입력 계약을 검증한다',()=>{
  const output=execFileSync(process.execPath,['--experimental-strip-types','scripts/career-jev-probe.mjs','--suite','holdout'],{encoding:'utf8',env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'}});
  const plan=JSON.parse(output);assert.equal(plan.mode,'DRY_RUN');assert.equal(plan.cases.length,9);assert.equal(plan.receipts,undefined);
  for(const row of [...probeCases('calibration'),...probeCases('holdout')])assert.doesNotThrow(()=>parseInput(row.input));
  assert.throws(()=>execFileSync(process.execPath,['--experimental-strip-types','scripts/career-jev-probe.mjs','--max-cost','10'],{stdio:'pipe'}));
});
test('재검증 CLI는 지정된 사례만 선택하고 잘못된 이름은 호출 전에 거절한다',()=>{
  const args=['--experimental-strip-types','scripts/career-jev-probe.mjs','--suite','holdout','--case','hold-off-topic,hold-source-conflict'];
  const output=execFileSync(process.execPath,args,{encoding:'utf8',env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'}});
  assert.deepEqual(JSON.parse(output).cases.map(c=>c.id),['hold-off-topic','hold-source-conflict']);
  assert.throws(()=>execFileSync(process.execPath,[...args.slice(0,-1),'typo'],{stdio:'pipe'}));
});
