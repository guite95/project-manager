import { isInterruptionNotice } from "../search-policy.mjs";
export const INTERPRETATION_VERSION = "content-1";
const injectedTags = new Set(["skill", "skills_instructions", "available_skills", "environment_context", "system-reminder", "permissions", "recommended_plugins", "oai-mem-citation"]);
const errorLine = /^(?:\s*(?:error|fatal|panic|exception|traceback|오류)(?:[:\s])|.*\b(?:ECONNREFUSED|ENOENT|ETIMEDOUT)\b)/i;
function policy(type, reason, evidence, extra = {}) {
  const conversation = ["CONVERSATION", "CODE_EXPLANATION", "ERROR_CONTEXT"].includes(type);
  return { contentType: type, reason, evidence, version: INTERPRETATION_VERSION,
    searchable: conversation, embeddingEnabled: conversation,
    importance: type === "ERROR_CONTEXT" ? 0.65 : conversation ? 1 : 0, ...extra };
}
function describe(content, role, origin) {
  if (isInterruptionNotice(content)) return policy("SYSTEM_NOTICE", "standalone-interruption", "provider-marker");
  if (/^\s*# AGENTS\.md instructions\b/.test(content)) return policy("INSTRUCTION", "agents-envelope", "provider-marker");
  const lines = content.split("\n").filter(s => s.trim());
  const mechanical = lines.filter(l => /^(?:npm (?:http|warn|notice|verbose)|\s*(?:\d{4}-\d\d-\d\d[T ]|\[?(?:INFO|DEBUG|TRACE)\]?\s)|[+\-]{3} |@@ |[+\-].*[;{}]\s*$|(?:added|removed|audited) \d+ packages)/i.test(l)).length;
  if (lines.length >= 8 && mechanical / lines.length > 0.6)
    return policy("MACHINE_OUTPUT", "mechanical-line-majority", "heuristic");
  // A heuristic may lower weight, but must not silently delete uncertain conversation.
  const slots = lines.filter(l => /^\s*[\w /-]+:\s*$/.test(l)).length;
  if (slots >= 5 && slots / lines.length > 0.55)
    return policy("TEMPLATE", "mostly-empty-fields", "heuristic", { searchable: true, embeddingEnabled: true, importance: 0.3 });
  const short = role === "ASSISTANT" && content.trim().length < 80 && !/[`\d]|[A-Za-z]{3,}|[?？]/.test(content);
  return policy(content.includes("```") ? "CODE_EXPLANATION" : "CONVERSATION", short ? "short-context-dependent-answer" : "conversation-default", origin,
    { importance: short ? 0.35 : role === "USER" ? 1 : 0.95 });
}
/** Interpret provider structure outside fenced code; every segment retains raw UTF-16 offsets. */
export function interpretMessage(message) {
  const body = message.body ?? "", metadata = message.source_metadata ?? message.sourceMetadata ?? {};
  const origin = metadata.eventType ? "provider-event" : "legacy-role";
  const blocks = [];
  const add = (start, end, p) => {
    if (end > start && body.slice(start, end).trim()) blocks.push({ start, end, content: body.slice(start, end), ...p });
  };
  if (metadata.synthetic || ["analysis", "summary"].includes(metadata.channel)) {
    add(0, body.length, policy("SYSTEM_NOTICE", "source-event-metadata", "provider-event"));
    return blocks;
  }
  if (/^\s*\[external_agent_tool_result\]\s*(?:\n|$)/.test(body)) {
    add(0, body.length, policy("TOOL_RESULT", "external-tool-envelope", "provider-marker"));
    // Keep only explicit error evidence as separately citable search material.
    let offset = 0;
    const lines = body.split(/(?<=\n)/);
    for (let i = 0; i < lines.length; i++) {
      if (errorLine.test(lines[i])) {
        const end = Math.min(body.length, offset + lines.slice(i, i + 4).join("").length);
        add(offset, end, policy("ERROR_CONTEXT", "explicit-tool-error", "structured-error-line"));
        offset = end;
        i += 3;
      } else offset += lines[i].length;
    }
    return blocks;
  }
  const lines = [...body.matchAll(/[^\n]*(?:\n|$)/g)].filter(m => m[0]);
  let cursor = 0, fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i][0], start = lines[i].index;
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const tag = line.match(/^\s*<([\w-]+)(?:\s[^>]*)?>/);
    if (!tag || !injectedTags.has(tag[1])) continue;
    const close = body.indexOf(`</${tag[1]}>`, start);
    if (close < 0) continue; // An ambiguous/unclosed example is preserved.
    const end = close + tag[1].length + 3;
    add(cursor, start, describe(body.slice(cursor, start), message.role, origin));
    add(start, end, policy("INSTRUCTION", `envelope:${tag[1]}`, "provider-marker"));
    cursor = end;
    while (i + 1 < lines.length && lines[i + 1].index < end) i++;
  }
  add(cursor, body.length, describe(body.slice(cursor), message.role, origin));
  return blocks;
}
export function conversationText(message) {
  return interpretMessage(message).filter(b => b.searchable).map(b => b.content).join("\n");
}
export function queryTerms(query) {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])];
}
export function lexicalEvidence(query, content) {
  const text = content.toLowerCase(), terms = queryTerms(query);
  const matches = terms.filter(t => text.includes(t));
  return { matched: matches.length, total: terms.length, coverage: terms.length ? matches.length / terms.length : 0, exact: text.includes(query.trim().toLowerCase()) };
}
export function searchExcerpt(message, query) {
  const blocks = interpretMessage(message).filter(b => b.searchable);
  return blocks.map(b => ({ ...b, match: lexicalEvidence(query, b.content) }))
    .filter(b => b.match.matched || b.match.exact).sort((a, b) => Number(b.match.exact) - Number(a.match.exact) || b.match.coverage - a.match.coverage || b.importance - a.importance)[0] ?? null;
}
