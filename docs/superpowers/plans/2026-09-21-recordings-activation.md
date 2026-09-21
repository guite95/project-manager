# 운영 녹음 전사 활성화

기준: origin/main `c088cfb133a77975fc7f110c2173c5f543286570`.
사용자가 최신 main 기준 운영 활성화 및 제안한 설계를 승인했다.

- [x] 현재 운영 Vault 파일 / OCI broker / Google 단기 token 경계와 Speech 설정 누락 확인.
- [x] Vault 전용 recordings Compose, root 소유 활성화 marker, systemd worker 준비.
- [x] 배포 시 marker를 읽고 worker를 같은 immutable 앱 이미지로 교체하는 경로 구현.
- [x] 로컬 회귀, 실제 서버 Compose 병합10개, typecheck/build 검증.
- [x] 기존 Google 프로젝트의 us 비공개 staging 버킷 및 버킷 단위 최소 권한 설정.
- [x] main 반영, 호스트 코드 준비 및 활성화 marker/비밀 아닌 버킷 설정, 정상 Actions 배포.
- [x] 짧은 합성 M4A로 실제 전사, DB 저장, OCI 원본 검증, GCS 정리 확인.

worker는 migration 자격증명이나 WIF 개인키를 받지 않는다. 웹과 같은 runtime 전용
Vault 세대를 읽으며 systemd가 IMDS guard/호스트 신원/Secret 준비 뒤 실행한다.
전사 요청의 operation/lease 및 접수 불명확 시 자동 재전송 금지를 유지한다.
기존 업무 데이터/인증 세션은 테스트에 사용하지 않는다. 새 장기 키와 공개 포트는 없다.

## 활성화 준비 확인

- 호스트 릴리스 `4ce39d2cf79c285f463c95a35961eca8b093040f` 준비 및 신원 readiness 성공.
- `pm-recordings-staging-616373009012`: US, uniform access, public access prevention enforced.
  완료 임시본이 삭제 후 추가 보관되지 않도록 이 신규 staging 버킷의 soft delete는0이다.
- 새 custom role은 `storage.objects.create/get/delete` 세 권한이며 해당 버킷에만 부여했다.
  기존 Speech API 및 runtime `roles/speech.client`를 확인하고 Speech 서비스 에이전트에
  버킷 objectViewer를 부여했다. 기존 프로젝트 IAM 역할은 변경하지 않았다.
- root marker 및 비밀 아닌 Speech 설정 준비. 원본 운영 설정 백업:
  `/var/backups/oci-vault-migration/pm-before-recordings-20260921T041816Z.env`.
- 운영 녹음 테이블 조회 시 기존 녹음0건. 배포 및 실제 전사 결과는 후속 검증한다.
- GitHub workflow_dispatch는 현재 CLI 권한으로403 반환. 기존 main push 자동 배포를 사용한다.

## 실제 Google 응답에서 확인한 작업 번호 호환성

첫 운영 배포 Actions35560493648은 성공했다. 16.76초 합성 M4A의 OCI 저장·GCS 업로드와
Google 전사도 성공했으나, Google은 요청의 프로젝트 ID 대신 숫자 프로젝트 번호로
operation을 반환했다. 기존 경로 검증이 이를 거부해 DB에는 SUBMITTING이 남았다.

숫자 번호를 임의 허용하지 않고 운영자가 확인한 `GOOGLE_CLOUD_PROJECT_NUMBER`만
기존 ID와 함께 허용하도록 수정했다. 실제 응답 형태의 회귀 테스트 RED→GREEN,
타 프로젝트 번호·리전·경로 조작 거부 및 기존 제출 재시도 금지를 확인했다.
수정 집중13개/Compose10개/typecheck/build PASS.

원래 Google operation의 metadata에 있는 GCS URI/모델/생성 시각과 성공 결과를 대조한
뒤, 해당 테스트 레코드만 status/operation/updatedAt 조건으로 복구했다. 새 유료 제출은0회다.
수정 배포 Actions35561289819 성공. 앱과 worker가 active이며 worker가 기존 operation을
이어받아 DONE으로 저장했다. lease 해제, DB staging 참조 제거, GCS 객체404를 확인했다.
OCI 원본 SHA-256은 업로드한 합성 M4A와 일치한다. 모델은 chirp_3이며 한국어 전사본이
별도 transcript에 저장됐다. attempts2는 worker 처리 횟수이며 Google 재제출은 아니다.

검증 레코드 `ba4f0215-5ea0-4d2f-82d4-cbc54600461f`는 TNS에 운영 검증 제목으로 남겼다.
실제 서비스 저장 함수를 통한 검증이며 브라우저 업로드/사용자 세션 검증은 수행하지 않았다.
녹음 올리기 입력의 accept와 확장자 검사에 .m4a가 포함되고 안내는 M4A(AAC), 최대100MB다.
