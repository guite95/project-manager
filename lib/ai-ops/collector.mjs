import { open, readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { hash, parseEntry } from "./parser.mjs";
const MAX_LINE = 16 * 1024 * 1024;
const CHUNK = 512 * 1024;
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const pending = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(pending, JSON.stringify(value), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(pending, path);
  } finally {
    await rm(pending, { force: true });
  }
}
export async function loadState(path) {
  try {
    const s = JSON.parse(await readFile(path, "utf8"));
    if (s.version !== 1 || !s.files) throw new Error();
    return s;
  } catch (e) {
    if (e.code === "ENOENT") return { version: 1, files: {} };
    throw new Error("수집 상태 파일이 손상되었습니다. 보관 후 재수집하세요.");
  }
}
/** 줄 끝까지 완성된 바이트만 소비한다. 부분 JSON/UTF-8은 다음 실행에서 재독한다. */
export async function readChunk(file, previous, context) {
  const handle = await open(file.path, "r");
  try {
    const head = Buffer.alloc(Math.min(4096, file.size));
    await handle.read(head, 0, head.length, 0);
    // 첫 완성 라인은 append에 영향받지 않는다.
    const first = head.indexOf(10),
      fingerprint = hash(
        head
          .subarray(0, first < 0 ? Math.min(256, head.length) : first)
          .toString("utf8"),
      );
    let state = structuredClone(previous ?? {});
    if (
      state.identity !== file.identity ||
      state.offset > file.size ||
      state.fingerprint !== fingerprint
    )
      state = {};
    if (!state.parser) {
      state = {
        offset: 0,
        parser: { eventMessages: true },
        identity: file.identity,
        fingerprint,
      };
    }
    const start = state.offset;
    let buffer = Buffer.alloc(Math.min(CHUNK, file.size - start));
    let { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    let end = buffer.subarray(0, bytesRead).lastIndexOf(10);
    // 큰 줄만 추가로 읽고 일반 증분은 512KiB에서 멈춘다.
    while (end < 0 && bytesRead < file.size - start && bytesRead <= MAX_LINE) {
      const extra = Buffer.alloc(
        Math.min(CHUNK, file.size - start - bytesRead),
      );
      const read = await handle.read(extra, 0, extra.length, start + bytesRead);
      if (!read.bytesRead) break;
      buffer = Buffer.concat([
        buffer.subarray(0, bytesRead),
        extra.subarray(0, read.bytesRead),
      ]);
      bytesRead += read.bytesRead;
      end = buffer.indexOf(10);
    }
    const result = {
      sessions: [],
      messages: [],
      usage: [],
      errors: 0,
      errorKinds: { invalidJson: 0, oversizedLine: 0, invalidRecord: 0 },
      state,
      complete: false,
    };
    if (end < 0) {
      if (bytesRead > MAX_LINE) {
        state.offset += bytesRead;
        state.skipping = true;
        result.errors++;
        result.errorKinds.oversizedLine++;
      }
      return result;
    }
    const sessions = new Map();
    let begin = 0;
    for (let i = 0; i <= end; i++) {
      if (buffer[i] !== 10) continue;
      const pos = start + begin,
        line = buffer.subarray(begin, i);
      begin = i + 1;
      if (state.skipping) {
        state.skipping = false;
        continue;
      }
      if (!line.length) continue;
      if (line.length > MAX_LINE) {
        result.errors++;
        result.errorKinds.oversizedLine++;
        continue;
      }
      let e;
      try {
        e = JSON.parse(line.toString("utf8"));
      } catch {
        result.errors++;
        result.errorKinds.invalidJson++;
        continue;
      }
      try {
        const parsed = parseEntry(e, state.parser, {
          ...context,
          source: file.source,
          fileKey: hash(file.path),
          offset: pos,
        });
        if (parsed.session) {
          const old = sessions.get(parsed.session.id),
            s = parsed.session;
          if (old) {
            old.lastActiveAt =
              old.lastActiveAt > s.lastActiveAt
                ? old.lastActiveAt
                : s.lastActiveAt;
            old.startedAt =
              old.startedAt < s.startedAt ? old.startedAt : s.startedAt;
            if (!old.title) old.title = s.title;
          } else sessions.set(s.id, s);
        }
        if (parsed.message) result.messages.push(parsed.message);
        if (parsed.usage) result.usage.push(parsed.usage);
      } catch {
        result.errors++;
        result.errorKinds.invalidRecord++;
      }
    }
    state.offset = start + end + 1;
    state.mtimeMs = file.mtimeMs;
    result.complete = state.offset >= file.size;
    result.sessions = [...sessions.values()];
    return result;
  } finally {
    await handle.close();
  }
}
/** 수신 한도보다 작은 묶음으로 나누되 모든 ACK 전에는 파일 위치를 저장하지 않는다. */
export function splitBatch(batch) {
  const sessions = new Map(batch.sessions.map((s) => [s.id, s]));
  const result = [];
  let current = { ...batch, sessions: [], messages: [], usage: [] };
  let used = new Set(),
    bytes = 0,
    count = 0;
  for (const [kind, rows] of [
    ["messages", batch.messages],
    ["usage", batch.usage],
  ]) {
    for (const row of rows) {
      const size =
        Buffer.byteLength(JSON.stringify(row)) +
        Buffer.byteLength(JSON.stringify(sessions.get(row.sessionId) ?? {}));
      if (count && (count >= 500 || bytes + size > 2 * 1024 * 1024)) {
        result.push(current);
        current = { ...batch, sessions: [], messages: [], usage: [] };
        used = new Set();
        bytes = 0;
        count = 0;
      }
      if (!used.has(row.sessionId)) {
        current.sessions.push(sessions.get(row.sessionId));
        used.add(row.sessionId);
      }
      current[kind].push(row);
      bytes += size;
      count++;
    }
  }
  if (count) result.push(current);
  return result;
}
export async function collect({
  discovery,
  state,
  device,
  allowedCwd,
  send,
  save,
  maxChunks = 1000,
}) {
  if (!Number.isSafeInteger(maxChunks) || maxChunks < 1 || maxChunks > 100000)
    throw new Error("maxChunks must be between 1 and 100000");
  // 범위가 확대되면 이전에 제외한 기록도 재독한다. 이벤트 ID는 유지된다.
  const scopeKey = allowedCwd === null ? "ALL" : `WORKSPACE:${allowedCwd}`;
  if (state.scopeKey !== scopeKey) {
    state.files = {};
    state.scopeKey = scopeKey;
    await save(state);
  }
  let chunks = 0,
    messages = 0,
    usage = 0,
    errors = discovery.errors,
    changed = 0;
  const errorKinds = {
    discovery: discovery.errors,
    invalidJson: 0,
    oversizedLine: 0,
    invalidRecord: 0,
  };
  for (const file of discovery.files) {
    if (chunks >= maxChunks) break;
    const key = hash(file.path);
    let previous = state.files[key];
    if (
      previous?.offset === file.size &&
      previous?.mtimeMs === file.mtimeMs &&
      previous?.identity === file.identity
    )
      continue;
    while (chunks < maxChunks) {
      const r = await readChunk(file, previous, {
        deviceId: device.id,
        allowedCwd,
      });
      chunks++;
      errors += r.errors;
      for (const [key, count] of Object.entries(r.errorKinds))
        errorKinds[key] += count;
      if (r.state.offset === previous?.offset && !r.complete) break;
      const batch = {
        version: 1,
        device,
        sessions: r.sessions,
        messages: r.messages,
        usage: r.usage,
        sync: {
          roots: discovery.roots.map((r) => r.path),
          files: discovery.files.length,
          errors,
        },
      };
      for (const part of splitBatch(batch)) await send(part); // ACK 전에 checkpoint를 진행하지 않는다.
      state.files[key] = r.state;
      await save(state);
      previous = r.state;
      changed++;
      messages += r.messages.length;
      usage += r.usage.length;
      if (r.complete || r.state.offset >= file.size) break;
      if (!r.state.offset) break;
    }
  }
  await send({
    version: 1,
    device,
    sessions: [],
    messages: [],
    usage: [],
    sync: {
      roots: discovery.roots.map((r) => r.path),
      files: discovery.files.length,
      errors,
    },
  });
  return {
    files: discovery.files.length,
    changed,
    chunks,
    messages,
    usage,
    errors,
    errorKinds,
    limited: chunks >= maxChunks,
  };
}
