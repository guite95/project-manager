# OCI 자료 저장소

PDF·HTML 업로드와 가져온 HTML·슬라이드의 원본을 private Standard 버킷에 저장한다.
파일명·종류·크기·제목 등 목록 정보와 프로젝트 관계는 기존 flow 테이블에 유지한다.
AI 세션 본문은 전체 본문 검색을 위해 PostgreSQL에 보관하며 영구 보관한다.

## 데이터 계약

- `document.content.storage`: provider/version/region/namespace/bucket/key/sha256/bytes.
- 객체 경로: `materials/<project>/<slug>/<sha256>`. 업로드는 조건부 생성으로 기존 객체를 덮어쓰지 않는다.
- PDF·HTML은 원본 바이트, 가져온 슬라이드는 styles/slides JSON으로 저장한다.
- GET은 설정된 버킷·리전·namespace와 프로젝트/slug 경로를 검사하고 크기 및 SHA-256 검증 후 기존 콘텐츠 형식으로 복원한다. 목록은 본문을 내려받지 않는다.
- 앱 로그인 및 HTML sandbox/CSP를 유지한다. 공개 버킷이나 영구 공개 URL을 만들지 않는다.
- 자료 업로드의 10MB 제한은 동일하다. 내부 객체 상한은 16MB이다.
- OCI 자료는 일반 차트 PUT으로 변경하지 않는다. 자료 메뉴의 삭제/업로드를 사용한다.

## 인증과 설정

`OCI_STORAGE_REGION`, `OCI_STORAGE_NAMESPACE`, `OCI_STORAGE_BUCKET`은 비밀이 아닌 연결 메타데이터다.
셋을 모두 비우면 기존 DB 저장 방식을 사용한다. 일부만 설정하면 오류로 중단한다.
로컬 `OCI_STORAGE_AUTH=config_file`은 기존 개인 `~/.oci/config`를 사용한다.
운영에서는 `instance_principal`만 허용하며 개인 API 키를 컨테이너에 복사하지 않는다.

운영 준비 시 앱 인스턴스 하나를 대상으로 dynamic group을 지정하고 해당 버킷의 객체만 허용한다.
정책은 `target.bucket.name='project-management-materials'` 조건과
`OBJECT_READ`, `OBJECT_CREATE`, `OBJECT_OVERWRITE`, `OBJECT_DELETE` 권한으로 제한한다.
이 권한은 인스턴스 단위이므로 같은 VM에서 metadata endpoint에 접근할 수 있는 다른 프로세스도 사용 가능하다.
버킷은 `NoPublicAccess`, `Standard`, versioning disabled로 만들고 수명주기 자동 삭제를 설정하지 않는다.
실제 IAM 구성과 인스턴스 인증 검증은 배포 전 수행한다. OCI의 무료 사용량은 계정 내 다른 버킷과 공유한다.

현재 운영 반영 대상은 춘천의 `dev-uk` 인스턴스다. 새 dynamic group과 policy 이름은
`project-management-materials-app`으로 하고, 기존 그룹·정책은 수정하지 않는다.
matching rule은 해당 인스턴스 하나의 `instance.id`만 지정한다. 같은 이름이 이미 있으면
내용을 비교하고 불일치 시 덮어쓰지 않는다. 앱 서버의 기존 환경파일에는 로컬과 동일한
namespace 및 `OCI_STORAGE_REGION=ap-chuncheon-1`, `OCI_STORAGE_BUCKET=project-management-materials`만 추가한다.
Compose는 `OCI_STORAGE_AUTH=instance_principal`을 강제한다. 인증키 추가는 없다.

## 기존 자료 이전

공유 DB 명령은 기존 터널 래퍼를 사용한다. 포트가 점유되었으면 다른 로컬 포트를 지정한다.
아래 `BACKUP`은 저장소 밖의 사용자 전용 절대 경로다. prepare는 0600 원본 스냅샷을 생성·재독하고 SHA-256을 출력한다.

```bash
pnpm db:shared -- node --experimental-strip-types scripts/material-storage.mjs inspect
pnpm db:shared -- node --experimental-strip-types scripts/material-storage.mjs prepare --backup BACKUP
pnpm db:shared -- node --experimental-strip-types scripts/material-storage.mjs copy --backup BACKUP --sha256 HASH
pnpm db:shared -- node --experimental-strip-types scripts/material-storage.mjs verify
```

copy는 기존 자료 전체를 객체로 저장하고 재다운로드 검증 후, 트랜잭션에서 자료를 잠그고 스냅샷/revision을 재검증하여 참조를 추가한다.
**copy 단계는 DB 본문을 유지하므로 구버전 운영 앱과 호환된다.** 중간 실패 시 원본은 보존되고 조건부 업로드로 재시도한다.
새 업로드의 객체 저장 후 DB 저장 실패처럼 커밋 결과가 불명확한 경우 객체는 보존한다. 고아 객체는 참조 확인 후 별도로 정리한다.

OCI 호환 앱 배포, instance principal 읽기/쓰기, 실제 자료 API 검증이 완료된 후 새 prepare 백업을 만든다.
그 백업과 해시로 compact를 실행해야 DB 원본이 제거된다. 이후 구버전 앱으로 바로 롤백할 수 없으며 원본 백업 복원이 먼저 필요하다.

```bash
pnpm db:shared -- node --experimental-strip-types scripts/material-storage.mjs compact --backup NEW_BACKUP --sha256 NEW_HASH --compatible-app-deployed
pnpm db:shared -- node --experimental-strip-types scripts/material-storage.mjs verify
```

이전 중 새 자료가 생기거나 revision이 바뀌면 재검사한다. 기존 백업은 덮어쓰지 않는다.
공유 DB의 스키마 변경은 없다. 브라우저 검증은 사용자 요청 시에만 수행한다.

## 삭제와 재시도

자료 삭제 트랜잭션은 `app_setting`의 `storage:delete:materials:<uuid>`에 객체 정리 작업을 남긴다.
커밋 후 객체를 삭제하고 성공한 작업만 제거한다. OCI 장애 시 DB 작업이 되돌려지거나 원본 참조가 다시 생기지 않는다.
업로드/삭제 시 최대 20개를 재시도한다. 유휴 서비스에서는 다음 쓰기 작업까지 정리가 지연될 수 있다.
버킷/경로를 검증할 수 없는 작업은 삭제하지 않고 남긴다. 운영자는 설정과 잔여 작업 수를 확인한다.

## 2026-09-17 이전 기록

- 춘천 리전 `project-management-materials` private Standard 버킷 생성.
- 자료 4개(업로드 2, 가져온 HTML 1, 슬라이드 1), 원본 총 532,624바이트를 복사하고 재다운로드 SHA-256 및 콘텐츠 동일성 검증 완료.
- 공유 DB에 4개 참조를 revision 검사 후 추가. 구버전 앱 호환을 위해 DB 원본 4개는 보존 중이다.
- 백업: `~/.local/share/project-management/backups/materials-before-oci-20260917.json` (권한 0600).
- 백업 SHA-256: `a65c84f84355d5d43c02aeed51671d0190f33f74f687348f6190c08c43dbfaa2`.
- 개인 인증으로 업로드·조건부 재시도·조회·삭제·반복 삭제 검증 완료. 검증용 객체 삭제 완료.
- 운영 컨테이너의 instance metadata 접근 확인. 사용자 승인 후 `project-management-materials-app` dynamic group/policy를 생성하고 서버 환경파일을 백업한 뒤 저장소 연결 정보만 추가했다. 앱 배포 후 실제 인스턴스 인증 및 자료 API를 검증하고, 새 백업으로 compact를 수행한다.
