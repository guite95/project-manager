#!/usr/bin/env bash
set -euo pipefail

die() {
  printf 'image cleanup: %s\n' "$*" >&2
  exit 1
}

is_image_id() {
  [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]
}

parse_spec() {
  local spec=$1
  [[ "$spec" == *=* ]] || die "invalid repository/container mapping: $spec"
  PARSED_REPOSITORY=${spec%%=*}
  PARSED_CONTAINER=${spec#*=}
  [[ "$PARSED_REPOSITORY" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ ]]     || die "invalid image repository: $PARSED_REPOSITORY"
  [[ "$PARSED_CONTAINER" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]     || die "invalid container identifier: $PARSED_CONTAINER"
}

require_running_container() {
  local container=$1
  local running
  running=$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null)     || die "container not found: $container"
  [[ "$running" == "true" ]] || die "container is not running: $container"
}

container_image_id() {
  local container=$1
  local image_id
  image_id=$(docker inspect --format '{{.Image}}' "$container")
  is_image_id "$image_id" || die "invalid image ID for container $container"
  printf '%s\n' "$image_id"
}

array_contains() {
  local needle=$1
  shift
  local value
  for value in "$@"; do
    [[ "$value" == "$needle" ]] && return 0
  done
  return 1
}

replace_tag() {
  local image_id=$1
  local target=$2
  local next="${target}-next"

  printf 'KEEP %s as %s\n' "$image_id" "$target"
  docker image rm "$next" >/dev/null 2>&1 || true
  docker tag "$image_id" "$next"
  docker image rm "$target" >/dev/null 2>&1 || true
  docker tag "$next" "$target"
  docker image rm "$next" >/dev/null
}

snapshot() {
  local state_file=$1
  shift
  [[ $# -gt 0 ]] || die "snapshot requires at least one repository/container mapping"
  [[ ! -L "$state_file" ]] || die "state file must not be a symbolic link: $state_file"

  local tmp_file="${state_file}.tmp.$$"
  local seen_repositories=()
  local spec repository container current_id rollback_id existing

  umask 077
  : > "$tmp_file"

  for spec in "$@"; do
    parse_spec "$spec"
    repository=$PARSED_REPOSITORY
    container=$PARSED_CONTAINER

    if (( ${#seen_repositories[@]} > 0 )); then
      for existing in "${seen_repositories[@]}"; do
        [[ "$existing" != "$repository" ]] || die "duplicate repository mapping: $repository"
      done
    fi
    seen_repositories+=("$repository")

    require_running_container "$container"
    current_id=$(container_image_id "$container")
    rollback_id=$(docker image inspect --format '{{.Id}}' "${repository}:rollback-1" 2>/dev/null || true)
    if [[ -n "$rollback_id" ]]; then
      is_image_id "$rollback_id" || die "invalid rollback image ID for $repository"
    else
      rollback_id=-
    fi

    printf '%s\t%s\t%s\n' "$repository" "$current_id" "$rollback_id" >> "$tmp_file"
  done

  chmod 600 "$tmp_file"
  mv "$tmp_file" "$state_file"
  printf 'Saved deployment image state: %s\n' "$state_file"
}

cleanup() {
  local state_file=$1
  shift
  [[ -f "$state_file" && ! -L "$state_file" ]]     || die "regular deployment image state file is required: $state_file"
  [[ $# -gt 0 ]] || die "cleanup requires at least one repository/container mapping"

  local repositories=()
  local containers=()
  local previous_ids=()
  local rollback_ids=()
  local current_ids=()
  local spec repository container state_line state_repository previous_id rollback_id extra
  local existing count

  count=$(awk 'END { print NR + 0 }' "$state_file")
  [[ "$count" -eq "$#" ]] || die "state mapping count does not match cleanup mappings"

  for spec in "$@"; do
    parse_spec "$spec"
    repository=$PARSED_REPOSITORY
    container=$PARSED_CONTAINER

    if (( ${#repositories[@]} > 0 )); then
      for existing in "${repositories[@]}"; do
        [[ "$existing" != "$repository" ]] || die "duplicate repository mapping: $repository"
      done
    fi

    state_line=$(awk -F '\t' -v repository="$repository" '
      $1 == repository { line = $0; matches += 1 }
      END {
        if (matches != 1) exit 2
        print line
      }
    ' "$state_file") || die "state entry missing or duplicated for $repository"

    IFS=$'\t' read -r state_repository previous_id rollback_id extra <<< "$state_line"
    [[ "$state_repository" == "$repository" && -z "${extra:-}" ]]       || die "invalid state entry for $repository"
    is_image_id "$previous_id" || die "invalid previous image ID for $repository"
    if [[ "$rollback_id" != "-" ]]; then
      is_image_id "$rollback_id" || die "invalid rollback image ID for $repository"
    fi

    require_running_container "$container"
    current_id=$(container_image_id "$container")

    repositories+=("$repository")
    containers+=("$container")
    previous_ids+=("$previous_id")
    rollback_ids+=("$rollback_id")
    current_ids+=("$current_id")
  done

  local protected_ids=()
  local candidate_repositories=()
  local candidate_refs=()
  local candidate_ids=()
  local container_id image_id ref listed_repository
  local container_inventory image_inventory
  local index

  if ! container_inventory=$(docker ps -aq); then
    die "failed to inventory Docker containers"
  fi
  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    image_id=$(container_image_id "$container_id")
    protected_ids+=("$image_id")
  done <<< "$container_inventory"

  for ((index = 0; index < ${#repositories[@]}; index += 1)); do
    repository=${repositories[$index]}
    if ! image_inventory=$(docker image ls --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}' "${repository}:*"); then
      die "failed to inventory images for $repository"
    fi
    while read -r ref image_id extra; do
      [[ -n "${ref:-}" ]] || continue
      [[ -z "${extra:-}" && "$ref" == "${repository}:"* ]]         || die "unexpected image listing for $repository"
      is_image_id "$image_id" || die "invalid listed image ID for $repository"
      listed_repository=${ref%:*}
      [[ "$listed_repository" == "$repository" ]]         || die "image listing escaped repository scope: $ref"
      candidate_repositories+=("$repository")
      candidate_refs+=("$ref")
      candidate_ids+=("$image_id")
    done <<< "$image_inventory"
  done

  local bootstrap_id candidate_index
  for ((index = 0; index < ${#repositories[@]}; index += 1)); do
    repository=${repositories[$index]}
    previous_id=${previous_ids[$index]}
    rollback_id=${rollback_ids[$index]}
    current_id=${current_ids[$index]}

    protected_ids+=("$current_id" "$previous_id")

    if [[ "$rollback_id" != "-" ]]; then
      replace_tag "$rollback_id" "${repository}:rollback-2"
      protected_ids+=("$rollback_id")
    else
      bootstrap_id=
      for ((candidate_index = 0; candidate_index < ${#candidate_ids[@]}; candidate_index += 1)); do
        [[ "${candidate_repositories[$candidate_index]}" == "$repository" ]] || continue
        image_id=${candidate_ids[$candidate_index]}
        [[ "$image_id" != "$current_id" && "$image_id" != "$previous_id" ]] || continue
        if ! array_contains "$image_id" "${protected_ids[@]-}"; then
          bootstrap_id=$image_id
          break
        fi
      done
      if [[ -n "$bootstrap_id" ]]; then
        replace_tag "$bootstrap_id" "${repository}:rollback-2"
        protected_ids+=("$bootstrap_id")
      fi
    fi

    replace_tag "$previous_id" "${repository}:rollback-1"
  done

  local actual_id
  for ((candidate_index = 0; candidate_index < ${#candidate_ids[@]}; candidate_index += 1)); do
    image_id=${candidate_ids[$candidate_index]}
    ref=${candidate_refs[$candidate_index]}

    if array_contains "$image_id" "${protected_ids[@]-}"; then
      printf 'KEEP %s (%s)\n' "$ref" "$image_id"
      continue
    fi

    actual_id=$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null || true)
    if [[ "$actual_id" == "$image_id" ]]; then
      printf 'REMOVE_REF %s (%s)\n' "$ref" "$image_id"
      docker image rm "$ref"
    fi
  done

  rm "$state_file"
  printf 'Deployment image cleanup complete.\n'
}

usage() {
  cat >&2 <<'USAGE'
Usage:
  prune-deployment-images.sh snapshot STATE_FILE REPOSITORY=CONTAINER [...]
  prune-deployment-images.sh cleanup  STATE_FILE REPOSITORY=CONTAINER [...]
USAGE
  exit 64
}

[[ $# -ge 3 ]] || usage
command=$1
state_file=$2
shift 2

case "$command" in
  snapshot)
    snapshot "$state_file" "$@"
    ;;
  cleanup)
    cleanup "$state_file" "$@"
    ;;
  *)
    usage
    ;;
esac
