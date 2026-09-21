#!/bin/bash
# Host-only runtime installation; never replaces an existing target.
# Verification follows https://github.com/nodejs/node#verifying-binaries
set -euo pipefail
test "$(id -u)" = 0
test "$(uname -m)" = aarch64
test ! -e /opt/node24 && test ! -L /opt/node24
version=v24.21.0
archive="node-${version}-linux-arm64.tar.xz"
expected=6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2
stage=$(mktemp -d /var/tmp/pm-node24-verify.XXXXXXXX)
# Stage has only public distribution files. Preserve on failure for inspection.
cd "$stage"
curl --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 120 \
  -o "$archive" "https://nodejs.org/dist/${version}/${archive}"
curl --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 30 \
  -o SHASUMS256.txt.asc "https://nodejs.org/dist/${version}/SHASUMS256.txt.asc"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-time 30 \
  -o nodejs-keyring.kbx https://github.com/nodejs/release-keys/raw/HEAD/gpg/pubring.kbx
gpgv --keyring "$stage/nodejs-keyring.kbx" --output SHASUMS256.txt < SHASUMS256.txt.asc
printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status
awk -v file="$archive" -v sum="$expected" '$2 == file && $1 == sum {found=1} END {exit !found}' SHASUMS256.txt
tar --extract --xz --file "$archive" --no-same-owner
test "$("$stage/node-${version}-linux-arm64/bin/node" --version)" = "$version"
chown -R root:root "$stage/node-${version}-linux-arm64"
chmod -R go-w "$stage/node-${version}-linux-arm64"
mv -- "$stage/node-${version}-linux-arm64" /opt/node24
printf 'NODE24_INSTALLED=%s\nVERIFICATION_STAGE=%s\n' "$version" "$stage"
