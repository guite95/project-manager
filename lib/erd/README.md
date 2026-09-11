# 티앤에스 ERD

`tns-schema.json`은 TNS Trading의 로컬 Prisma 스키마 스냅샷이다. 운영 DB를 조회하지 않으며 실제 레코드나 컬럼 기본값은 복사하지 않는다. 캡처 날짜와 스키마 SHA-256으로 기준을 확인한다.

재생성:

```sh
node scripts/generate-tns-erd.mjs /path/to/tnstrading/apps/web/prisma/schema.prisma
node --test lib/erd/*.test.mjs
pnpm typecheck
```

`tns.ts`의 업무 영역 분류로 ERD를 구성한다. 각 영역은 소속 테이블에서 나가는 모든 FK와 참조 대상 테이블을 표시한다. 테이블 집중 보기는 들어오는 FK도 포함한다. 화면에는 PK·FK 컬럼을 표시하며 전체 컬럼과 복합 PK/UQ 제약은 상세 표에서 확인한다.

`schema.mjs`는 현재 TNS 스키마의 단일 행 필드·관계 선언을 읽는 제한된 파서다. Prisma 전체 문법을 지원하는 범용 파서가 아니다. 스키마 문법이 바뀌면 파서와 검증을 함께 갱신한다. Prisma 명시적 FK만 포함하며 JSON/ID 문자열의 논리 관계, SQL 전용 제약, 실제 운영 DB와의 차이는 포함하지 않는다.

현재 웹 화면은 DB `app_setting`의 `erd:tns` 스냅샷을 읽는다. 이 디렉터리의 JSON은 최초 이관·테스트용 원본이다. 재생성만으로 배포 데이터가 바뀌지 않으며, 갱신 시 스냅샷과 `flow_document`의 ERD 차트를 함께 검증해 저장해야 한다.
