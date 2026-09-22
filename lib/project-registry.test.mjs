import test from 'node:test';
import assert from 'node:assert/strict';
import { projectInput } from './project-registry.ts';
import { projectForRepository } from './project-repositories.ts';
test('저장소 경로는 작업 폴더 내부의 상대 경로만 허용한다', () => {
  for(const path of ['/etc/passwd','../other','a/../b','a//b','a/','~/.ssh','a\\b','C:/a','a\u0000b'])
    assert.throws(()=>projectInput({title:'제목',repositories:[{workspace:'UK',path}]}),path);
  assert.throws(()=>projectInput({title:' ',repositories:[]}));
  assert.throws(()=>projectInput({title:'제목',repositories:[{workspace:'UK',path:'a'},{workspace:'UK',path:'a'}]}));
  assert.deepEqual(projectInput({title:' 제목 ',repositories:[{workspace:'UK',path:'conkiri/backend'}]}),{title:'제목',repositories:[{workspace:'UK',path:'conkiri/backend'}]});
});
test('연결된 경로만 같은 프로젝트에 묶으며 개인·회사 모두 DB 메타데이터를 받는다', () => {
  const projects=[{key:'app:dynamic',title:'동적 프로젝트',repositories:[{workspace:'UK',path:'conkiri/backend'},{workspace:'UK',path:'conkiri/frontend'},{workspace:'PROJECTS',path:'customer'}]}];
  const roots={UK:'/work/uk',PROJECTS:'/work/projects'};
  for(const path of ['/work/uk/conkiri/backend','/work/uk/conkiri/frontend','/work/projects/customer']) assert.equal(projectForRepository(path,projects,roots),'app:dynamic');
  for(const path of ['/other/conkiri/backend','/work/uk/conkiri','/work/uk/customer']) assert.equal(projectForRepository(path,projects,roots),undefined);
});
