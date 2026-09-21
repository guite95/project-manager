# 운영 녹음 전사 활성화

기준: origin/main `c088cfb133a77975fc7f110c2173c5f543286570`.
사용자가 최신 main 기준 운영 활성화 및 제안한 설계를 승인했다.

- [x] 현재 운영 Vault 파일 / OCI broker / Google 단기 token 경계와 Speech 설정 누락 확인.
- [x] Vault 전용 recordings Compose, root 소유 활성화 marker, systemd worker 준비.
- [x] 배포 시 marker를 읽고 worker를 같은 immutable 앱 이미지로 교체하는 경로 구현.
- [ ] 로컬 회귀, 실제 서버 Compose 병합, typecheck/build 검증.
- [ ] 기존 Google 프로젝트의 us 비공개 staging 버킷 및 버킷 단위 최소 권한 설정.
- [ ] main 반영, 호스트 코드 준비 및 활성화 marker/비밀 아닌 버킷 설정, 정상 Actions 배포.
- [ ] 짧은 합성 M4A로 실제 전사, DB 저장, OCI 원본 검증, GCS 정리 확인.

worker는 migration 자격증명이나 WIF 개인키를 받지 않는다. 웹과 같은 runtime 전용
Vault 세대를 읽으며 systemd가 IMDS guard/호스트 신원/Secret 준비 뒤 실행한다.
전사 요청의 operation/lease 및 접수 불명확 시 자동 재전송 금지를 유지한다.
기존 업무 데이터/인증 세션은 테스트에 사용하지 않는다. 새 장기 키와 공개 포트는 없다.
