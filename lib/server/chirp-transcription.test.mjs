import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateReference } from './object-storage.mjs';
import { speechConfig, recognitionRequest, parseRecognition, ChirpTranscription } from './chirp-transcription.mjs';
const config = speechConfig({ GOOGLE_CLOUD_PROJECT: 'test-project', GOOGLE_SPEECH_BUCKET: 'private-staging' });
test('전체 파일 BatchRecognize에 화자 구분만 켜고 시간 표시와 힌트를 요청하지 않는다', () => {
  assert.equal(config.location, 'us');
  assert.throws(() => speechConfig({ GOOGLE_CLOUD_PROJECT:'test-project' }));
  const request = recognitionRequest(config, 'gs://private-staging/audio');
  assert.equal(request.config.model, 'chirp_3');
  assert.deepEqual(request.config.languageCodes,['ko-KR']);
  assert.deepEqual(request.recognitionOutputConfig,{inlineResponseConfig:{}});
  assert.deepEqual(request.files,[{uri:'gs://private-staging/audio'}]);
  assert.deepEqual(request.config.features.diarizationConfig,{});
  assert.equal('enableWordTimeOffsets' in request.config.features,false);
  assert.equal('multiChannelMode' in request.config.features,false);
  assert.equal('customPromptConfig' in request.config.features,false);
});
test('시간을 표시하지 않고 연속된 speakerLabel을 화자별 발화로 묶는다', () => {
  const uri = 'gs://bucket/file';
  const result = {results:[
    {languageCode:'ko-KR',alternatives:[{transcript:'안녕하세요. 반갑습니다.',words:[
      {word:'안녕하세요.',speakerLabel:'1'},
      {word:'반갑습니다.',speakerLabel:'1'},
    ]}]},
    {alternatives:[{transcript:'네, 시작하시죠. 설명드리겠습니다.',words:[
      {word:'네,',speakerLabel:'2'},
      {word:'시작하시죠.',speakerLabel:'2'},
      {word:'설명드리겠습니다.',speakerLabel:'1'},
    ]}]},
  ]};
  for (const file of [{inlineResult:{transcript:result}},{transcript:result}]) {
    assert.equal(parseRecognition({done:true,response:{results:{[uri]:file}}}, uri).text,
      '화자 1: 안녕하세요. 반갑습니다.\n화자 2: 네, 시작하시죠.\n화자 1: 설명드리겠습니다.');
  }
  const fallback = {results:[{languageCode:'ko-KR',alternatives:[{transcript:'화자 정보가 없는 발화'}]}]};
  assert.equal(parseRecognition({done:true,response:{results:{[uri]:{transcript:fallback}}}},uri).text,'화자 정보가 없는 발화');
  assert.equal(parseRecognition({done:false},uri),null);
  assert.throws(() => parseRecognition({done:true,error:{code:7}},uri));
  assert.throws(() => parseRecognition({done:true,response:{results:{[uri]:{error:{code:3}}}}},uri));
  assert.throws(() => parseRecognition({done:true,response:{results:{[uri]:{transcript:{results:[]}}}}},uri));
});
test('외부 operation URL·프로젝트와 임의 GCS 경로를 거부하고 제출을 자동 재시도하지 않는다', async () => {
  const calls=[];
  const provider = new ChirpTranscription(config, {request:async value=>{calls.push(value);return {data:{name:'projects/test-project/locations/us/operations/123'}};}});
  const stage=provider.staging({id:'11111111-1111-4111-8111-111111111111',storage:{sha256:'a'.repeat(64)}});
  await provider.start(stage);
  assert.equal(calls[0].retry,false);
  assert.throws(()=>provider.operationUrl('https://evil.example'));
  assert.throws(()=>provider.operationUrl('projects/other/locations/us/operations/id'));
  assert.throws(()=>provider.validateStage({...stage,bucket:'other'}));
  assert.throws(()=>provider.validateStage({...stage,name:'transcription/../../other'}));
});
test('GCS에 이미 있는 임시 사본도 크기·해시를 검증한다', async () => {
  const bytes=Buffer.from('audio');let calls=0;
  const provider=new ChirpTranscription(config,{request:async options=>{
    calls++;
    if(options.method==='POST'){const error=new Error();error.response={status:412};throw error;}
    return {data:{size:String(bytes.length),md5Hash:createHash('md5').update(bytes).digest('base64')}};
  }});
  const stage=provider.staging({id:'11111111-1111-4111-8111-111111111111',storage:{sha256:'a'.repeat(64)}});
  await provider.upload(stage,bytes,'audio/mpeg');assert.equal(calls,2);
  await assert.rejects(()=>provider.upload(stage,Buffer.from('tampered'),'audio/mpeg'),/INTEGRITY/);
});
test('녹음 저장 경로·100MB 상한은 자료의 16MB 상한과 분리된다',()=>{
  const keys=['OCI_STORAGE_REGION','OCI_STORAGE_NAMESPACE','OCI_STORAGE_BUCKET'];
  const previous=keys.map(key=>process.env[key]);
  Object.assign(process.env,{OCI_STORAGE_REGION:'ap-seoul-1',OCI_STORAGE_NAMESPACE:'test',OCI_STORAGE_BUCKET:'test'});
  try {
    const ref={provider:'oci',version:1,region:'ap-seoul-1',namespace:'test',bucket:'test',sha256:'a'.repeat(64),bytes:50*1024*1024,key:`recordings/project/id/${'a'.repeat(64)}`};
    assert.equal(validateReference(ref,'project','id','recordings'),ref);
    assert.throws(()=>validateReference(ref,'other','id','recordings'));
    assert.throws(()=>validateReference(ref,'project','id'));
    assert.throws(()=>validateReference({...ref,bytes:101*1024*1024},'project','id','recordings'));
    assert.throws(()=>validateReference({...ref,key:ref.key.replace('recordings','materials')},'project','id'));
  } finally {keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});}
});
