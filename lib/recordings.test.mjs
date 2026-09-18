import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingInput, recordingFileType, MAX_RECORDING_BYTES } from './recordings.ts';
import { canProject, routeRequirement, permits } from './access/policy.ts';
import { searchSidebarProjects } from './navigation/sidebar-search.ts';
test('녹음 종류와 자유 입력을 보존하고 잘못된 입력을 거절한다', () => {
  assert.deepEqual(recordingInput({ title: ' 상담 ', kind: 'OTHER', context: '고객 상담' }), { title: '상담', kind: 'OTHER', context: '고객 상담' });
  for (const input of [{title:'',kind:'CALL',context:''},{title:'a',kind:'unknown',context:''},{title:'a',kind:'CALL',context:'x'.repeat(1001)},{title:'a',kind:'CALL',context:'\0'}]) assert.throws(() => recordingInput(input));
});
test('확장자만 바꾼 파일, 경로·헤더 삽입, 빈 파일·초과 크기를 거절한다', () => {
  assert.equal(recordingFileType('회의.m4a', Buffer.from('\0\0\0\x18ftypM4A ')), 'audio/mp4');
  for (const name of ['../voice.mp3', 'a\r\n.mp3', 'a.exe']) assert.throws(() => recordingFileType(name, Buffer.from('ID3abc')));
  assert.throws(() => recordingFileType('a.mp3', Buffer.from('<script>')));
  assert.throws(() => recordingFileType('a.wav', Buffer.alloc(0)));
  assert.throws(() => recordingFileType('a.mp3', new Uint8Array(MAX_RECORDING_BYTES + 1)));
});
test('녹음·전사 API는 프로젝트 권한을 적용하며 조회자는 쓰지 못한다', () => {
  const viewer = { id: 'viewer', role: 'MEMBER', memberships: [{ projectSlug: 'tns', role: 'VIEWER' }] };
  const editor = { ...viewer, memberships: [{ projectSlug: 'tns', role: 'EDITOR' }] };
  for (const path of ['/flows/tns/recordings','/api/flows/tns/recordings','/api/flows/tns/recordings/id/audio','/api/flows/tns/recordings/id/transcript','/api/flows/tns/recordings/id/text']) {
    assert.equal(permits(viewer,routeRequirement(path,'GET')), true);
    assert.equal(permits(viewer,routeRequirement(path.replace('tns','other'),'GET')), false);
    assert.equal(permits(null,routeRequirement(path,'GET')), false);
  }
  for (const path of ['/api/flows/tns/recordings','/api/flows/tns/recordings/id/retry']) {
    assert.equal(permits(viewer,routeRequirement(path,'POST')), false);
    assert.equal(permits(editor,routeRequirement(path,'POST')), true);
    assert.equal(permits(editor,routeRequirement(path,'PUT')), false);
  }
  assert.equal(permits(editor,routeRequirement('/api/flows/tns/recordings/id/audio','POST')), false);
  assert.equal(canProject({...editor,role:'ADMIN'}, 'personal-flight-app', 'read'), false);
});
test('회사 프로젝트에서 녹음 메뉴를 검색하고 개인·공통에서는 제외한다', () => {
  const projects = ['tns', 'common', 'personal-ilchul'].map(slug => ({ slug, title: slug, categories: [] }));
  const found = searchSidebarProjects(projects, '녹음');
  assert.deepEqual(found.map(row => row.project.slug), ['tns']);
  assert.equal(found[0].showRecordings, true);
});
