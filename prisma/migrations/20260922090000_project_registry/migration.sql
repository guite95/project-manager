-- 메뉴와 접근권한은 같은 프로젝트 메타데이터를 사용한다.
ALTER TABLE flow_project ADD COLUMN scope TEXT NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN personal_group TEXT,
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

UPDATE flow_project SET scope = 'PERSONAL', personal_group = CASE
  WHEN slug IN ('personal-project-management', 'personal-youtube-sync') THEN 'TOY' ELSE 'PORTFOLIO' END
WHERE slug IN ('personal-flight-app', 'personal-ilchul', 'personal-project-management',
  'personal-youtube-sync', 'personal-conkiri', 'personal-memonogi');

-- 기존 사용자 분류가 기본값보다 우선한다. 원본 설정은 이관 근거로 보존한다.
UPDATE flow_project p SET personal_group = upper(s.value->>p.slug)
FROM app_setting s WHERE s.key = 'ui:personal-project-groups' AND p.scope = 'PERSONAL'
  AND s.value->>p.slug IN ('portfolio', 'toy');

ALTER TABLE flow_project ADD CONSTRAINT flow_project_scope_check CHECK (
  (scope = 'COMPANY' AND personal_group IS NULL) OR
  (scope = 'PERSONAL' AND personal_group IS NOT NULL AND personal_group IN ('PORTFOLIO', 'TOY'))
);
ALTER TABLE flow_project ADD CONSTRAINT flow_project_revision_check CHECK (revision >= 0);

CREATE TABLE project_repository (
  workspace TEXT NOT NULL,
  path TEXT NOT NULL,
  project_slug TEXT NOT NULL REFERENCES flow_project(slug) ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY (workspace, path),
  CONSTRAINT project_repository_workspace_check CHECK (workspace IN ('UK', 'PROJECTS')),
  CONSTRAINT project_repository_path_check CHECK (
    length(path) BETWEEN 1 AND 300 AND path !~ '(^/|/$|//|\\|(^|/)[.]{1,2}(/|$))'
  )
);
CREATE INDEX project_repository_project_slug_idx ON project_repository(project_slug);
INSERT INTO project_repository (workspace,path,project_slug)
SELECT 'UK', v.path, v.slug FROM (VALUES
 ('flight-app','personal-flight-app'), ('ilchul','personal-ilchul'),
 ('project-management','personal-project-management'), ('youtube-sync','personal-youtube-sync'),
 ('conkiri/infra','personal-conkiri'), ('conkiri/frontend','personal-conkiri'), ('conkiri/backend','personal-conkiri'),
 ('memonogi/devnogi-auth-server','personal-memonogi'), ('memonogi/devnogi-infra-prod','personal-memonogi')
) AS v(path,slug) JOIN flow_project p ON p.slug = v.slug AND p.scope = 'PERSONAL';
