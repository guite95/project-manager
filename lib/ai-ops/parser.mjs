import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
import { redact } from "./redact.mjs";
import { sourceDescriptor } from "./provenance.mjs";
import { interpretMessage } from "./search/interpretation.mjs";
export const hash = (...values) =>
  createHash("sha256").update(values.join("\0")).digest("hex");
export const known = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;
export function inside(path, root) {
  if (typeof path !== "string" || !isAbsolute(path)) return false;
  const r = relative(resolve(root), resolve(path));
  return r === "" || (r !== ".." && !r.startsWith("../") && !isAbsolute(r));
}
const difference = (a, b) =>
  a === null || b === null ? null : Math.max(0, a - b);
/** 차트의 각 구성요소는 서로 겹치지 않는다. 미제공은 null을 유지한다. */
export function normalizeUsage(raw, source) {
  const input = known(raw.input_tokens),
    output = known(raw.output_tokens);
  const cacheReadTokens = known(
    raw.cached_input_tokens ?? raw.cache_read_input_tokens,
  );
  const cacheWriteTokens = known(
    raw.cache_write_input_tokens ?? raw.cache_creation_input_tokens,
  );
  const reasoningTokens = known(raw.reasoning_output_tokens);
  const inputTokens =
    source === "CODEX"
      ? cacheReadTokens === null
        ? input
        : difference(input, cacheReadTokens)
      : input;
  const outputTokens =
    source === "CODEX" && reasoningTokens !== null
      ? difference(output, reasoningTokens)
      : output;
  const totalTokens =
    known(raw.total_tokens) ??
    (input !== null && output !== null
      ? source === "CODEX"
        ? input + output
        : input + output + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0)
      : null);
  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  };
}
function cleanText(value) {
  // 자동으로 삽입한 XML 블록을 제거해 뒤따르는 실제 사용자 문장은 보존한다.
  let text = String(value)
    .replace(
      /<(environment_context|system-reminder|recommended_plugins|available_skills|skills_instructions|turn_aborted|local-command-caveat|local-command-stdout|command-name|command-message|command-args|permissions)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g,
      "",
    )
    .trim();
  if (
    /^\s*(?:# AGENTS\.md instructions|<environment_context>|<permissions instructions>|<turn_aborted>|<local-command|<command-name>|<system-reminder>|<recommended_plugins>|This session is being continued from a previous conversation)/.test(
      text,
    )
  )
    return "";
  return text;
}
function textContent(content, stripContext = true) {
  const clean = stripContext ? cleanText : (value) => String(value);
  if (typeof content === "string") return clean(content);
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (x) =>
        ["text", "input_text", "output_text"].includes(x?.type) &&
        typeof x.text === "string",
    )
    .map((x) => clean(x.text))
    .filter(Boolean)
    .join("\n")
    .trim();
}
export function parseEntry(entry, state, context) {
  const { source, deviceId, allowedCwd, fileKey, offset } = context;
  const p = entry.payload ?? {};
  if (source === "CODEX") {
    if (entry.type === "session_meta") {
      state.externalId = p.id ?? p.session_id;
      state.cwd = p.cwd;
    }
    if (entry.type === "turn_context") {
      state.cwd = p.cwd ?? state.cwd;
      state.model = p.model ?? state.model;
      state.turnId = p.turn_id;
    }
    if (p.type === "task_started") state.turnId = p.turn_id ?? state.turnId;
  } else {
    state.externalId = entry.sessionId ?? state.externalId;
    state.cwd = entry.cwd ?? state.cwd;
    state.model = entry.message?.model ?? state.model;
  }
  if (!Number.isFinite(Date.parse(entry.timestamp))) return {};
  const timestamp = new Date(entry.timestamp).toISOString();
  let usage = null,
    usageKey = null,
    message = null;
  if (source === "CODEX") {
    if (
      entry.type === "response_item" &&
      p.type === "message" &&
      ["user", "assistant"].includes(p.role)
    ) {
      state.eventMessages = false;
      if (
        !["analysis", "summary"].includes(p.channel) &&
        !p.recipient &&
        !entry.isSynthetic
      ) {
        const body = textContent(p.content, p.role === "user");
        if (body) {
          const role = p.role === "user" ? "USER" : "ASSISTANT";
          const mirrored = state.legacyMessages?.find(
            (m) =>
              m.digest === hash(role, body) &&
              Math.abs(Date.parse(timestamp) - Date.parse(m.at)) < 10_000,
          );
          message = {
            role,
            body,
            key: mirrored?.key ?? p.id ?? `ordinal:${entry.ordinal ?? offset}`,
          };
          if (mirrored)
            state.legacyMessages = state.legacyMessages.filter(
              (m) => m !== mirrored,
            );
        }
      }
    }
    // response_item이 없는 이전 형식만 event_msg 텍스트를 사용한다.
    if (
      state.eventMessages &&
      entry.type === "event_msg" &&
      ["user_message", "agent_message"].includes(p.type)
    ) {
      const body = textContent(p.message, p.type === "user_message");
      if (body) {
        const role = p.type === "user_message" ? "USER" : "ASSISTANT",
          key = `event:${entry.ordinal ?? offset}`;
        message = { role, body, key };
        state.legacyMessages = [
          ...(state.legacyMessages ?? []),
          { digest: hash(role, body), key, at: timestamp },
        ].slice(-20);
      }
    }
    if (entry.type === "token_usage_record" && p.usage) {
      state.hasTokenRecords = true;
      usage = p.usage;
      usageKey = p.response_id ?? `record:${entry.ordinal ?? offset}`;
      state.total = p.thread_token_usage ?? state.total;
    } else if (
      entry.type === "event_msg" &&
      p.type === "token_count" &&
      p.info &&
      !state.hasTokenRecords
    ) {
      const cumulative = p.info.total_token_usage;
      if (cumulative && known(cumulative.total_tokens) !== null) {
        const previous = state.total;
        if (!previous || cumulative.total_tokens !== previous.total_tokens) {
          const reset =
            previous && cumulative.total_tokens < previous.total_tokens;
          usage = Object.fromEntries(
            Object.entries(cumulative).map(([k, v]) => [
              k,
              known(v) === null
                ? null
                : reset || !previous
                  ? v
                  : Math.max(0, v - (known(previous[k]) ?? 0)),
            ]),
          );
          usageKey = `total:${state.turnId ?? ""}:${hash(JSON.stringify(cumulative))}`;
        }
        state.total = cumulative;
      } else if (p.info.last_token_usage) {
        usage = p.info.last_token_usage;
        usageKey = `last:${state.turnId ?? ""}:${hash(JSON.stringify(usage))}`;
      }
    }
  } else {
    const m = entry.message;
    if (
      m &&
      ["user", "assistant"].includes(entry.type) &&
      m.role === entry.type &&
      !entry.isMeta &&
      !entry.isCompactSummary
    ) {
      const body = textContent(m.content, entry.type === "user");
      if (body)
        message = {
          role: entry.type === "user" ? "USER" : "ASSISTANT",
          body,
          key: entry.uuid ?? m.id ?? `offset:${offset}`,
        };
      if (entry.type === "assistant" && m.usage) {
        usage = m.usage;
        usageKey = m.id ?? entry.uuid ?? `offset:${offset}`;
      }
    }
  }
  if (
    !state.externalId ||
    (allowedCwd !== null && !inside(state.cwd, allowedCwd)) ||
    (!message && !usage)
  )
    return {};
  const sessionId = hash(deviceId, source, state.externalId);
  const model =
    typeof state.model === "string" ? state.model.slice(0, 200) : null;
  const session = {
    id: sessionId,
    source,
    externalId: String(state.externalId),
    cwd: typeof state.cwd === "string" && state.cwd ? state.cwd : "(unknown)",
    title: "",
    startedAt: timestamp,
    lastActiveAt: timestamp,
  };
  const result = { session };
  if (message) {
    // PostgreSQL 텍스트에 저장할 수 없는 NUL은 눈에 보이는 표기로 전송한다.
    // Provider wrappers can be carried inside text blocks. Do not upload their raw payloads.
    const publicBody = interpretMessage({ role: message.role, body: message.body })
      .filter(b => !["INSTRUCTION", "TOOL_RESULT", "ERROR_CONTEXT"].includes(b.contentType))
      .map(b => b.content).join("\n").trim();
    if (!publicBody) message = null;
    const body = redact(publicBody).replace(/\0/g, "\\u0000").slice(0, 100_000);
    if (message) result.message = {
      id: hash(sessionId, "message", message.key),
      sessionId,
      role: message.role,
      model,
      occurredAt: timestamp,
      body,
      chars: body.length,
      sourceMetadata: sourceDescriptor(entry, source === "CODEX" ? (p.content ?? p.message) : entry.message?.content, p.channel),
    };
    if (message?.role === "USER")
      session.title = body.replace(/\s+/g, " ").slice(0, 160);
  }
  if (usage)
    result.usage = {
      id: hash(sessionId, "usage", usageKey ?? fileKey),
      sessionId,
      model,
      occurredAt: timestamp,
      ...normalizeUsage(usage, source),
    };
  return result.message || result.usage ? result : {};
}
