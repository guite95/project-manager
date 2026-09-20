#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TARGET_SCRIPT=${TARGET_SCRIPT:-"$ROOT_DIR/scripts/prune-deployment-images.sh"}
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/bin"

cat > "$TMP_DIR/bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_DOCKER_LOG:?}"

CURRENT_ID="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
PREVIOUS_ID="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
ROLLBACK_ID="sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
EXPIRED_ID="sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
OTHER_ID="sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

if [[ "${FAKE_DOCKER_FAIL_PS:-0}" == "1" && "$*" == "ps -aq" ]]; then
  exit 91
fi
if [[ "${FAKE_DOCKER_FAIL_IMAGES:-0}" == "1" && "$*" == "image ls --no-trunc --format {{.Repository}}:{{.Tag}} {{.ID}} example/app:*" ]]; then
  exit 92
fi

case "$*" in
  "inspect --format {{.State.Running}} old-container"|"inspect --format {{.State.Running}} new-container")
    printf 'true\n'
    ;;
  "inspect --format {{.State.Running}} stopped-container")
    printf 'false\n'
    ;;
  "inspect --format {{.Image}} old-container")
    printf '%s\n' "$PREVIOUS_ID"
    ;;
  "inspect --format {{.Image}} new-container")
    printf '%s\n' "$CURRENT_ID"
    ;;
  "inspect --format {{.Image}} unrelated-container")
    printf '%s\n' "$OTHER_ID"
    ;;
  "image inspect --format {{.Id}} example/app:rollback-1")
    printf '%s\n' "$ROLLBACK_ID"
    ;;
  "image inspect --format {{.Id}} example/app:expired")
    printf '%s\n' "$EXPIRED_ID"
    ;;
  "image ls --no-trunc --format {{.Repository}}:{{.Tag}} {{.ID}} example/app:*")
    printf '%s\n'       "example/app:new $CURRENT_ID"       "example/app:previous $PREVIOUS_ID"       "example/app:rollback-1 $ROLLBACK_ID"       "example/app:expired $EXPIRED_ID"       "example/app:shared $OTHER_ID"
    ;;
  "ps -aq")
    printf '%s\n' new-container unrelated-container
    ;;
  "image inspect --format {{json .RepoTags}} $EXPIRED_ID")
    printf '[]\n'
    ;;
  image\ rm\ *|tag\ *)
    ;;
  *)
    printf 'Unexpected fake docker invocation: %s\n' "$*" >&2
    exit 90
    ;;
esac
FAKE_DOCKER
chmod +x "$TMP_DIR/bin/docker"

export PATH="$TMP_DIR/bin:$PATH"
export FAKE_DOCKER_LOG="$TMP_DIR/docker.log"
STATE_FILE="$TMP_DIR/deployment-images.tsv"

"$TARGET_SCRIPT" snapshot "$STATE_FILE" example/app=old-container
EXPECTED_STATE=$'example/app\tsha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\tsha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
[[ $(<"$STATE_FILE") == "$EXPECTED_STATE" ]]

"$TARGET_SCRIPT" cleanup "$STATE_FILE" example/app=new-container

grep -Fqx 'tag sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc example/app:rollback-2-next' "$FAKE_DOCKER_LOG"
grep -Fqx 'tag example/app:rollback-2-next example/app:rollback-2' "$FAKE_DOCKER_LOG"
grep -Fqx 'tag sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb example/app:rollback-1-next' "$FAKE_DOCKER_LOG"
grep -Fqx 'tag example/app:rollback-1-next example/app:rollback-1' "$FAKE_DOCKER_LOG"
grep -Fqx 'image rm example/app:expired' "$FAKE_DOCKER_LOG"
! grep -Fqx 'image rm sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd' "$FAKE_DOCKER_LOG"
! grep -Fqx 'image rm example/app:shared' "$FAKE_DOCKER_LOG"
! grep -Fq 'example/other' "$FAKE_DOCKER_LOG"
! grep -Eq '(^| )(system|image|builder) prune( |$)' "$FAKE_DOCKER_LOG"
[[ ! -e "$STATE_FILE" ]]

write_state() {
  printf '%s\t%s\t%s\n' \
    example/app \
    sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc \
    > "$STATE_FILE"
}

: > "$FAKE_DOCKER_LOG"
write_state
if FAKE_DOCKER_FAIL_PS=1 "$TARGET_SCRIPT" cleanup "$STATE_FILE" example/app=new-container; then
  echo 'cleanup unexpectedly ignored a container inventory failure' >&2
  exit 1
fi
! grep -Eq '^(tag|image rm) ' "$FAKE_DOCKER_LOG"
[[ -e "$STATE_FILE" ]]

: > "$FAKE_DOCKER_LOG"
write_state
if FAKE_DOCKER_FAIL_IMAGES=1 "$TARGET_SCRIPT" cleanup "$STATE_FILE" example/app=new-container; then
  echo 'cleanup unexpectedly ignored an image inventory failure' >&2
  exit 1
fi
! grep -Eq '^(tag|image rm) ' "$FAKE_DOCKER_LOG"
[[ -e "$STATE_FILE" ]]

: > "$FAKE_DOCKER_LOG"
write_state

if "$TARGET_SCRIPT" cleanup "$STATE_FILE" example/app=stopped-container; then
  echo 'cleanup unexpectedly accepted a stopped current container' >&2
  exit 1
fi
! grep -Fq 'image rm' "$FAKE_DOCKER_LOG"
[[ -e "$STATE_FILE" ]]

printf 'PASS prune-deployment-images\n'
