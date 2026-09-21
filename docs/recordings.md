# 프로젝트 녹음·전사

회사 프로젝트의 **녹음·전사** 메뉴에서 종류(통화/오프라인 회의/온라인 미팅/기타), 제목, 선택적인 상황 설명을 입력하고 업로드한다. 공통·개인 프로젝트에는 제공하지 않는다. 원본 다운로드는 저장 직후, 전사본 보기와 UTF-8 TXT 다운로드는 완료 후 제공한다. 기존 회의록의 `content.transcript`와 독립적이며 자동으로 회의록·결정·태스크를 만들지 않는다.

## 데이터와 처리

- `project_recording`: 프로젝트 FK, 원본 파일명/크기/형식, 종류/설명, 서버 소유 OCI 참조, 전사 상태와 lease, Google operation 및 임시 GCS 경로.
- `recording_transcript`: 녹음 ID를 FK/PK로 사용한 별도 레코드. 전사 텍스트, 언어, provider/model, 인식 결과 JSON과 생성 시각. TXT 다운로드는 이 텍스트만 반환한다.
- OCI 비공개 버킷의 `recordings/<project>/<id>/<sha256>`에 원본 바이트를 그대로 보존한다. 업로드/다운로드 시 크기와 SHA-256을 검증한다. 기존 자료실의 `materials/` 경로 및 16MB 객체 제한은 그대로다.
- 녹음은 100MiB까지 허용한다. M4A(AAC), MP3, WAV, FLAC, OGG(Opus), WebM(Opus). 파일명/확장자/시그니처/실제 바이트 상한을 검사한다. 지원하지 않는 내부 코덱은 Google 작업 실패로 표시한다.
- 원본과 전사본은 자동 만료하지 않는다. GET은 조회만 한다. 목록에는 원본 저장소 참조와 전사문을 포함하지 않는다.
- VIEWER는 조회/다운로드, EDITOR는 업로드/재시도할 수 있다. 각 API에서 DB 세션과 프로젝트 권한을 검사한다. multipart 업로드와 재시도에 same-origin 검사를 적용한다.

## Chirp 3

신원 분리 후에는 앱/worker가 `GOOGLE_ACCESS_TOKEN_FILE`로 호스트 발행 단기 토큰을 읽는다.
파일을 명시하면 잘못된 파일/만료 시 ADC로 돌아가지 않는다. 404/412 상태 처리와
불명확한 BatchRecognize 자동 재제출 금지를 유지한다. worker는 이 변경으로 자동 활성화되지 않으며,
아래 기존 WIF 배포 절차 대신 worker 전용 경계 override가 필요하다.
[설치·전환 조건](../ops/oci-runtime/README.md#녹음-worker)을 먼저 확인한다.

`google-auth-library` ADC로 임베딩과 동일한 `GOOGLE_APPLICATION_CREDENTIALS` 또는 런타임 WIF를 사용한다. 별도 API key나 서비스 계정 키를 만들지 않는다. 임베딩의 `GOOGLE_CLOUD_LOCATION=global`과 전사 리전은 독립적이다.

```text
GOOGLE_CLOUD_PROJECT=<기존 임베딩 프로젝트>
GOOGLE_SPEECH_LOCATION=us
GOOGLE_SPEECH_BUCKET=<비공개 전사 임시 버킷>
```

작업자는 OCI 원본을 검증하고 전체 파일을 16kHz 모노 FLAC으로 정규화한 뒤 GCS에 임시 사본을 올린다. 원본 파일 자체는 바꾸지 않는다. `chirp_3`, `ko-KR`, 단일 파일 `BatchRecognize`를 사용하고 파일을 구간으로 나누지 않는다. `diarizationConfig`로 화자 구분을 켜고 word time offset은 요청하지 않는다. 응답의 연속된 `speakerLabel`을 `화자 N:` 발화로 묶되 시간은 전사문에 표시하지 않는다. GCS 사본의 바이트 크기와 MD5도 검증하고 inline JSON 결과를 전사 전용 테이블에 저장한다.

종류/설명은 프로젝트에서 녹음을 찾고 이해하기 위한 메타데이터로만 보관한다. 품질 비교 조건과 동일하게 Chirp 요청에는 custom prompt, 용어 힌트, 사용자 프롬프트를 보내지 않는다. 화자 이름도 추측하지 않는다.

공식 근거:
- [Chirp 3 모델·리전·한국어·화자 구분](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3)
- [BatchRecognize: GCS 입력, 단일 파일 inline 출력](https://docs.cloud.google.com/speech-to-text/docs/reference/rest/v2/projects.locations.recognizers/batchRecognize)
- [REST v2 discovery: customPromptConfig 및 응답 필드](https://speech.googleapis.com/$discovery/rest?version=v2)

## 작업자와 장애 복구

업로드 HTTP 요청에서 전사를 실행하지 않는다. 작업자는 DB advisory lock과 DB 시각 기준 3분 lease로 한 번에 하나씩 처리한다. 10초 간격으로 operation을 조회하며 lease를 갱신한다. 브라우저는 10초마다 상태를 읽는다. 작업자가 중단돼도 저장된 operation을 이어서 조회한다. 접수 직전 `SUBMITTING`을 저장하고 응답이 불명확하면 자동 재전송하지 않는다. 이 실패는 중복 과금 가능성을 표시하며 수동 재시도만 허용한다.

완료 상태와 전사본은 하나의 DB 트랜잭션으로 저장한다. lease token이 바뀐 오래된 작업자는 결과를 쓸 수 없다. 결과 저장 실패 시 operation을 보존한다. 완료 후 GCS 임시 사본을 삭제한다. 삭제 실패는 `staging` 참조를 보존해 다음 실행에서 재시도한다. 실패/접수 불명확 상태의 임시 사본은 작업 확인·복구를 위해 유지하며, 성공한 재시도 후 정리한다. OCI 원본과 DB 전사본에는 영향을 주지 않는다.

개발 시 별도 터미널:

```sh
pnpm db:shared -- pnpm recordings:worker
pnpm db:shared -- pnpm recordings:worker --once
```

기존 dev 터널을 종료하지 않는다. 필요한 경우 별도의 `SHARED_DB_LOCAL_PORT`를 지정한다. 로컬 전용 DB는 `pnpm recordings:worker`를 사용한다. 공유 DB worker 실행은 유료 전사 및 DB 쓰기이므로 운영 활성화 범위에서만 수행한다.

## 운영 활성화

코드 반영과 별도로 다음 운영 변경이 필요하다. 신규 장기 키나 public DB/GCS 접근은 필요 없다.

1. 기존 서비스 계정에 프로젝트 범위 `roles/speech.client` 등 필요한 `speech.recognizers.recognize`, `speech.operations.get` 권한을 부여하고 Speech-to-Text API 활성화를 확인한다.
2. 같은 프로젝트의 `us` 멀티 리전에 전용 비공개 staging 버킷을 만든다. uniform bucket-level access와 public access prevention을 켠다. 기존 서비스 계정에 해당 버킷의 객체 생성/조회/삭제 권한만 부여한다. Speech 서비스 에이전트도 입력 객체를 읽을 수 있어야 한다. 기존 보관 버킷에 만료 규칙을 추가하지 않는다.
3. 공유 DB를 읽기 전용으로 검사·백업한 뒤 `20260918120000_project_recordings`를 `prisma migrate deploy`로 적용한다. 새 테이블만 추가하며 기존 데이터 변환은 없다.
4. 이미지와 앱 환경을 반영하고 기존 WIF override에 `docker-compose.recordings.yml`을 함께 적용한다. 앱과 worker는 같은 이미지, worker는 기존 `/run/project-management-wif` read-only mount를 사용한다. worker는 포트를 열지 않는다.
5. Nginx의 이 앱 location에 `client_max_body_size 101m`과 업로드에 충분한 timeout을 적용한다. Next proxy는 101MB, 업로드 API는 100MiB + 64KiB multipart 상한이다.
6. 짧은 승인된 녹음으로 인증된 업로드 → 완료 → 두 다운로드를 확인한다. OCI SHA-256, TXT 내용, GCS 임시 객체 정리, 프로젝트/VIEWER 권한도 별도 확인한다.

```sh
docker compose -f docker-compose.yml -f docker-compose.wif.yml -f docker-compose.recordings.yml up -d
```

2026-09-18 최초 구현 시 로컬 ADC 검사에서는 Speech 호출 권한과 staging 버킷이 없었다. 후속 로컬 검증에서 사용자 승인 후 기존 서비스 계정에 `roles/speech.client`를 추가했고, `speech.recognizers.recognize` 및 `speech.operations.get`을 재확인했다. 새 키 발급·GCS 버킷 생성·공유 DB migration·배포는 수행하지 않았다.

## 로컬 품질 검증 결과 (2026-09-18)

실제 재무회계 녹음 전체를 16kHz 모노 FLAC으로 변환해 `us`의 `chirp_3` / `ko-KR` BatchRecognize를 검증했다. 시간 표시와 힌트·사용자 프롬프트를 끄고 화자 구분만 켠 전체 파일 결과는 1,486단어와 파일 전체 범위의 화자 라벨 3개를 반환했다. 같은 설정의 분할본보다 구간 경계의 고유명사와 화자 흐름을 더 잘 보존했다. 정답 원문을 새로 작성한 비교는 아니므로 정확도 수치로 일반화하지 않는다.

`asia-northeast1`은 같은 서비스 계정에서 모델/locale 접근 거부를 반환했다. Location API와 문서는 해당 조합을 GA로 표시했으나 실제 요청은 실패했다. 현재 프로젝트에서는 `GOOGLE_SPEECH_LOCATION=us`를 명시해 사용한다. 다른 프로젝트/계정에서도 같은 결과라고 일반화하지 않는다.

```sh
GOOGLE_SPEECH_LOCATION=us node --experimental-strip-types --env-file=.env scripts/check-chirp.mjs \
  --file '/absolute/path/to/recording.m4a' --start 300 --seconds 55
```

이 스크립트는 최대 55초를 직접 전송하며 DB·OCI·GCS를 쓰지 않는다. 기존 ADC를 사용하고 샘플·TXT·JSON·실행 정보를 권한 0700 임시 디렉터리에 0600으로 저장한다. 기본 리전은 실제 성공한 `us`다. 각 실행은 유료 API 1회이며 실패를 자동 재전송하지 않는다. 짧은 동기 호출 성공은 긴 녹음의 BatchRecognize·GCS 저장소·worker·화자 구분 품질을 검증한 것이 아니다.
