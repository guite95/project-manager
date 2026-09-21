# 운영 녹음 전사 활성화

기준: origin/main `c088cfb133a77975fc7f110c2173c5f543286570`.
사용자가 최신 main 기준 운영 활성화 및 제안한 설계를 승인했다.

- [x] 현재 운영 Vault 파일 / OCI broker / Google 단기 token 경계와 Speech 설정 누락 확인.
- [x] Vault 전용 recordings Compose, root 소유 활성화 marker, systemd worker 준비.
- [x] 배포 시 marker를 읽고 worker를 같은 immutable 앱 이미지로 교체하는 경로 구현.
- [x] 로컬 회귀, 실제 서버 Compose 병합10개, typecheck/build 검증.
- [x] 기존 Google 프로젝트의 us 비공개 staging 버킷 및 버킷 단위 최소 권한 설정.
- [ ] main 반영, 호스트 코드 준비 및 활성화 marker/비밀 아닌 버킷 설정, 정상 Actions 배포.
- [ ] 짧은 합성 M4A로 실제 전사, DB 저장, OCI 원본 검증, GCS 정리 확인.

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
