import test from "node:test";
import assert from "node:assert/strict";
import { parseEntry, normalizeUsage, inside } from "./parser.mjs";
import { redact } from "./redact.mjs";
const context = {
  source: "CODEX",
  deviceId: "d",
  allowedCwd: "/home/me/uk",
  fileKey: "f",
  offset: 0,
};
const when = "2026-09-16T08:00:00Z";
const entry = (type, payload) => ({ timestamp: when, type, payload });
const state = () => ({
  externalId: "session",
  cwd: "/home/me/uk/project",
  model: "model",
});
test("cwd boundary and nonstandard log location are independent", () => {
  assert.equal(inside("/home/me/uk/project", "/home/me/uk"), true);
  assert.equal(inside("/home/me/uk-else", "/home/me/uk"), false);
  assert.equal(inside("/home/me/uk/../private", "/home/me/uk"), false);
  const msg = entry("response_item", {
    type: "message",
    role: "user",
    id: "m",
    content: [{ type: "input_text", text: "hello" }],
  });
  assert.ok(
    parseEntry(msg, state(), {
      ...context,
      fileKey: "/home/me/.uk-private/.codex/sessions/file",
    }).message,
  );
  assert.deepEqual(
    parseEntry(msg, { ...state(), cwd: "/home/me/other" }, context),
    {},
  );
});
test("Codex public conversation ignores tool/system/reasoning and mirrored event messages", () => {
  const s = state();
  for (const p of [
    { type: "message", role: "system", content: "secret" },
    { type: "message", role: "developer", content: "secret" },
    { type: "function_call_output", output: "secret" },
    { type: "reasoning", summary: "secret" },
    {
      type: "message",
      role: "assistant",
      channel: "analysis",
      content: "secret",
    },
  ])
    assert.equal(
      parseEntry(entry("response_item", p), s, context).message,
      undefined,
    );
  assert.equal(
    parseEntry(
      entry("event_msg", { type: "user_message", message: "duplicate" }),
      s,
      context,
    ).message,
    undefined,
  );
  const r = parseEntry(
    entry("response_item", {
      type: "message",
      role: "user",
      id: "1",
      content: [
        {
          type: "input_text",
          text: "# AGENTS.md instructions private instructions",
        },
        { type: "input_text", text: "real prompt" },
      ],
    }),
    s,
    context,
  );
  assert.equal(r.message.body, "real prompt");
});
test("canonical Codex usage excludes cache/reasoning overlap and skips mirrored counts", () => {
  const raw = {
    input_tokens: 100,
    cached_input_tokens: 60,
    output_tokens: 30,
    reasoning_output_tokens: 10,
    total_tokens: 130,
  };
  assert.deepEqual(normalizeUsage(raw, "CODEX"), {
    inputTokens: 40,
    cacheReadTokens: 60,
    cacheWriteTokens: null,
    outputTokens: 20,
    reasoningTokens: 10,
    totalTokens: 130,
  });
  const s = state();
  assert.equal(
    parseEntry(
      entry("token_usage_record", { response_id: "resp", usage: raw }),
      s,
      context,
    ).usage.totalTokens,
    130,
  );
  assert.equal(
    parseEntry(
      entry("event_msg", {
        type: "token_count",
        info: { total_token_usage: raw },
      }),
      s,
      context,
    ).usage,
    undefined,
  );
});
test("legacy cumulative usage produces deltas; repeated counters do not inflate totals", () => {
  const s = state(),
    event = (n) =>
      entry("event_msg", {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: n,
            output_tokens: 10,
            total_tokens: n + 10,
          },
        },
      });
  assert.equal(parseEntry(event(100), s, context).usage.totalTokens, 110);
  assert.equal(parseEntry(event(100), s, context).usage, undefined);
  assert.equal(parseEntry(event(140), s, context).usage.totalTokens, 40);
  assert.equal(normalizeUsage({}, "CODEX").totalTokens, null);
  assert.equal(
    normalizeUsage({ input_tokens: 0, output_tokens: 0 }, "CODEX").totalTokens,
    0,
  );
});
test("Claude tool results/thinking excluded while usage counted and IDs stable across copy", () => {
  const e = {
    timestamp: when,
    type: "assistant",
    sessionId: "c",
    cwd: "/home/me/uk/p",
    uuid: "u",
    message: {
      role: "assistant",
      id: "id",
      model: "claude",
      content: [
        { type: "thinking", thinking: "hidden" },
        { type: "tool_use", input: "secret" },
        { type: "text", text: "answer" },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 5,
      },
    },
  };
  const r = parseEntry(e, {}, { ...context, source: "CLAUDE_CODE" });
  assert.equal(r.message.body, "answer");
  assert.equal(r.usage.totalTokens, 65);
  assert.equal(
    parseEntry(
      e,
      {},
      { ...context, source: "CLAUDE_CODE", fileKey: "copy", offset: 999 },
    ).message.id,
    r.message.id,
  );
  const tool = {
    ...e,
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", content: "secret" }],
    },
  };
  assert.equal(
    parseEntry(tool, {}, { ...context, source: "CLAUDE_CODE" }).message,
    undefined,
  );
});
test("redaction before transport masks credentials, JWT, keys and private keys", () => {
  for (const input of [
    "PW : test1234",
    'API_KEY="abc123"',
    "password: secret123",
    "Bearer abc.def.ghi",
    "postgresql://app:secret@localhost/db",
    "sk-proj-12345678901234567890123",
    "-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----",
  ]) {
    const output = redact(input);
    assert.match(output, /REDACTED/);
    assert.doesNotMatch(
      output,
      /test1234|abc123|secret123|abc\.def\.ghi|:secret@|\nprivate\n/,
    );
  }
  assert.equal(redact("normal text"), "normal text");
});
test("a file observed before first message switches dialect without duplicate mirror IDs", () => {
  const s = { ...state(), eventMessages: true };
  const legacy = parseEntry(
    entry("event_msg", { type: "user_message", message: "same prompt" }),
    s,
    context,
  );
  const canonical = parseEntry(
    entry("response_item", {
      type: "message",
      role: "user",
      id: "canonical-id",
      content: "same prompt",
    }),
    s,
    { ...context, offset: 100 },
  );
  assert.equal(legacy.message.id, canonical.message.id);
  assert.equal(s.eventMessages, false);
  assert.equal(
    parseEntry(
      entry("event_msg", { type: "user_message", message: "same prompt" }),
      s,
      { ...context, offset: 200 },
    ).message,
    undefined,
  );
});
test("string and array injected blocks are removed but following genuine prompt survives", () => {
  const content =
    "<system-reminder>private context</system-reminder>\n<recommended_plugins>private plugins</recommended_plugins>\nreal question";
  for (const c of [content, [{ type: "input_text", text: content }]]) {
    const r = parseEntry(
      entry("response_item", {
        type: "message",
        role: "user",
        id: "m",
        content: c,
      }),
      state(),
      context,
    );
    assert.equal(r.message.body, "real question");
  }
  const r = parseEntry(
    {
      timestamp: when,
      type: "user",
      sessionId: "c",
      cwd: "/home/me/uk/p",
      uuid: "u",
      message: {
        role: "user",
        content: "<system-reminder>private</system-reminder>",
      },
    },
    {},
    { ...context, source: "CLAUDE_CODE" },
  );
  assert.equal(r.message, undefined);
});
test("assistant explanations retain literal XML examples", () => {
  const body = "Example: <system-reminder>hello</system-reminder>";
  const r = parseEntry(
    entry("response_item", {
      type: "message",
      role: "assistant",
      id: "m",
      content: body,
    }),
    state(),
    context,
  );
  assert.equal(r.message.body, body);
});
