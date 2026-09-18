import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from './test-db.mjs';
import { createRecording, listRecordings, getRecording, claimRecording, renewRecording, completeRecording, retryRecording } from './recordings-store.ts';
import { processRecording, cleanupRecordingStages } from './recording-worker.ts';
const projects=['test-recording-a','test-recording-b'];
const bytes=Buffer.from('ID3test-audio');
const store=async (data, project, id) => ({provider:'oci',version:1,sha256:'a'.repeat(64),bytes:data.length,key:`recordings/${project}/${id}/${'a'.repeat(64)}`});
const add=()=>createRecording(projects[0],{title:'통화',kind:'CALL',context:'제품 설명'},'통화.mp3',bytes,store);
async function clear(){
  await prisma.recordingTranscript.deleteMany({where:{recording:{projectSlug:{in:projects}}}});
  await prisma.projectRecording.deleteMany({where:{projectSlug:{in:projects}}});
  await prisma.flowProject.deleteMany({where:{slug:{in:projects}}});
}
before(async()=>{await clear();await prisma.flowProject.createMany({data:projects.map(slug=>({slug,title:slug,position:999}))});});
after(async()=>{await clear();await prisma.$disconnect();});
test('녹음과 전사는 별도 저장되고 프로젝트별 목록에는 원본·전사 본문이 없다',async()=>{
  const a=await add(); const b=await add(); assert.notEqual(a.id,b.id);
  assert.equal(await getRecording(projects[1],a.id),null);
  assert.deepEqual(await listRecordings(projects[1]),[]);
  const list=await listRecordings(projects[0]);
  assert.equal(list.length,2); assert.equal(list[0].hasTranscript,false);
  assert.equal(JSON.stringify(list).includes('storage'),false);
  assert.equal(await createRecording('common',{title:'a',kind:'CALL',context:''},'a.mp3',bytes,store),null);
  const claims=await Promise.all([claimRecording(),claimRecording()]);
  assert.equal(claims.filter(Boolean).length,1);
  const job=claims.find(Boolean);
  assert.equal(await completeRecording(job.id,'wrong-token',{text:'oops',language:'ko-KR',result:{}}),false);
  assert.equal(await renewRecording(job.id,job.leaseToken),true);
  assert.equal(await completeRecording(job.id,job.leaseToken,{text:'별도의 전사 원문',language:'ko-KR',result:{results:[]}}),true);
  assert.equal(await completeRecording(job.id,job.leaseToken,{text:'overwrite',language:'ko-KR',result:{}}),false);
  assert.equal((await listRecordings(projects[0])).find(r=>r.id===job.id).hasTranscript,true);
  assert.equal(JSON.stringify(await listRecordings(projects[0])).includes('별도의 전사 원문'),false);
  assert.equal(await retryRecording(projects[0],job.id),false);
  // 남은 대기 작업은 이 테스트에서 명시적으로 완료한다.
  const next=await claimRecording();
  await completeRecording(next.id,next.leaseToken,{text:'다음 전사',language:'ko-KR',result:{}});
});
test('만료 lease는 회수하고 기존 Google operation을 재사용한다',async()=>{
  const {id}=await add(); const original=await claimRecording();
  const stage={bucket:'private',name:'audio',uri:'gs://private/audio'};
  await prisma.projectRecording.update({where:{id},data:{operation:'existing',staging:stage,leaseUntil:new Date(0)}});
  const resumed=await claimRecording(); assert.notEqual(resumed.leaseToken,original.leaseToken);
  assert.equal(await renewRecording(id,original.leaseToken),false);
  let starts=0;
  const provider={start:async()=>{starts++;},poll:async name=>{assert.equal(name,'existing');return {done:true,response:{results:{[stage.uri]:{inlineResult:{transcript:{results:[{alternatives:[{transcript:'복구된 전사'}]}]}}}}}};}};
  await processRecording(resumed,provider,new AbortController().signal,async()=>{throw new Error('원본 재업로드 금지');});
  assert.equal(starts,0); assert.equal((await getRecording(projects[0],id)).status,'DONE');
  assert.equal((await prisma.recordingTranscript.findUnique({where:{recordingId:id}})).text,'복구된 전사');
  let deletes=0;
  await cleanupRecordingStages({remove:async()=>{deletes++;throw new Error('temporary');}});
  assert.equal(deletes,1); assert.ok((await getRecording(projects[0],id)).staging);
  await cleanupRecordingStages({remove:async()=>{}});
  assert.equal((await getRecording(projects[0],id)).staging,null);
});
test('접수 응답이 불명확한 작업은 자동 재전송하지 않고 프로젝트 내에서만 재시도한다',async()=>{
  const {id}=await add(); const job=await claimRecording();
  await prisma.projectRecording.update({where:{id},data:{operation:'SUBMITTING'}});
  await processRecording({...job,operation:'SUBMITTING'},{},new AbortController().signal);
  assert.equal((await getRecording(projects[0],id)).status,'FAILED');
  assert.match((await getRecording(projects[0],id)).error,/중복 과금/);
  assert.equal(await retryRecording(projects[1],id),false);
  assert.equal(await retryRecording(projects[0],id),true);
  assert.equal(await retryRecording(projects[0],id),false);
  await prisma.projectRecording.update({where:{id},data:{status:'FAILED'}});
});
test('네트워크 오류는 operation을 유지하고 완료되지 않은 전사를 만들지 않는다',async()=>{
  const {id}=await add(); const job=await claimRecording();
  const staging={bucket:'private',name:'audio',uri:'gs://private/audio'};
  await prisma.projectRecording.update({where:{id},data:{operation:'keep-operation',staging}});
  const provider={poll:async()=>{const error=new Error('temporary');error.response={status:503};throw error;}};
  await processRecording({...job,operation:'keep-operation',staging},provider,new AbortController().signal);
  const row=await getRecording(projects[0],id);
  assert.equal(row.status,'PENDING');assert.equal(row.operation,'keep-operation');
  assert.equal(await prisma.recordingTranscript.count({where:{recordingId:id}}),0);
  await prisma.projectRecording.update({where:{id},data:{status:'FAILED'}});
  assert.equal(await retryRecording(projects[0],id),true);
  assert.equal((await getRecording(projects[0],id)).operation,'keep-operation');
  await prisma.projectRecording.update({where:{id},data:{status:'FAILED'}});
});
test('원본을 전사용 모노 FLAC으로 바꾸고 전사본과 원본 참조를 각각 보존한다',async()=>{
  const {id}=await add(); const job=await claimRecording();
  const staging={bucket:'private',name:'audio',uri:'gs://private/audio'};
  const mono=Buffer.from('fLaC-normalized-mono');
  const calls=[];
  const provider={
    staging:()=>staging,
    upload:async(_stage,audio,contentType)=>{assert.deepEqual(audio,mono);assert.equal(contentType,'audio/flac');calls.push('upload');},
    start:async()=>{calls.push('start');return 'operation-created';},
    poll:async name=>{assert.equal(name,'operation-created');calls.push('poll');return {done:true,response:{results:{[staging.uri]:{transcript:{results:[{alternatives:[{transcript:'제품 설명입니다.'}]}]}}}}};},
  };
  await processRecording(job,provider,new AbortController().signal,async()=>bytes,undefined,async audio=>{
    assert.deepEqual(audio,bytes);
    return mono;
  });
  assert.deepEqual(calls,['upload','start','poll']);
  const saved=await getRecording(projects[0],id);
  assert.equal(saved.status,'DONE');assert.deepEqual(saved.storage,job.storage);
  assert.equal((await prisma.recordingTranscript.findUnique({where:{recordingId:id}})).text,'제품 설명입니다.');
});
