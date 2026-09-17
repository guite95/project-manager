import { createHash } from "node:crypto";
import { interpretMessage, INTERPRETATION_VERSION } from "./interpretation.mjs";
export const CHUNK_VERSION = "conversation-1";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
// Title participates in the embedding input, so it participates in the cache key.
export const contentHash = (title, content) =>
  digest(JSON.stringify([title, content]));
export function searchPolicy(type, content = "") {
  if (["USAGE", "CACHE", "SYSTEM", "TOOL_CALL"].includes(type))
    return { contentType: type, searchable: type === "TOOL_CALL", embeddingEnabled: false, importance: type === "TOOL_CALL" ? 0.2 : 0 };
  const tool = ["COMMAND_OUTPUT", "BUILD_LOG", "TOOL_RESULT", "GIT_DIFF"].includes(type);
  const blocks = interpretMessage({ role: type, body: tool ? `[external_agent_tool_result]\n${content}` : content });
  return blocks.find(b => b.contentType === "ERROR_CONTEXT") ?? blocks[0] ??
    { contentType: "CONVERSATION", searchable: false, embeddingEnabled: false, importance: 0 };
}
export function bytePrefix(text, maxBytes) {
  let bytes = 0,
    end = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char);
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += char.length;
  }
  return text.slice(0, end);
}
export function chunkMessage(message) {
  const body = message.body ?? "", chunks = [];
  for (const block of interpretMessage(message)) {
    let start = block.start;
    while (start < block.end) {
      const prefix = bytePrefix(body.slice(start, block.end), 6000);
      let end = start + prefix.length;
      if (end < block.end) {
        const paragraph = prefix.lastIndexOf("\n\n"), line = prefix.lastIndexOf("\n");
        end = start + (paragraph > prefix.length / 2 ? paragraph + 2 : line > prefix.length / 2 ? line + 1 : prefix.length);
      }
      chunks.push({ ...block, content: body.slice(start, end), start, end, index: chunks.length });
      start = end;
    }
  }
  return chunks;
}
export function buildDocuments(session, messages) {
  const docs = [];
  let title = "none";
  const add = (kind, messageId, index, content, policy, metadata) => {
    docs.push({
      id: digest(
        JSON.stringify([session.id, CHUNK_VERSION, kind, messageId, index]),
      ),
      sessionId: session.id,
      messageId,
      kind,
      index,
      title,
      content,
      contentHash: contentHash(title, content),
      chars: content.length,
      sourceRevision: String(session.search_revision),
      chunkVersion: CHUNK_VERSION,
      ...policy,
      metadata,
    });
  };
  let question = null;
  for (const m of messages) {
    const chunks = chunkMessage(m);
    if (m.role === "USER") {
      const first = chunks.find(c => c.searchable && c.contentType !== "TEMPLATE");
      if (first) question = { messageId: m.id, role: m.role, start: first.start,
        end: first.start + bytePrefix(first.content, 1000).length,
        content: bytePrefix(first.content.trim(), 512) };
    }
    // A local question gives short answers context without borrowing a session's last title.
    title = m.role === "ASSISTANT" && question ? question.content : "none";
    for (const c of chunks)
      add("CHUNK", m.id, c.index, c.content, c, {
        start: c.start, end: c.end, role: m.role,
        interpretation: { version: INTERPRETATION_VERSION, reason: c.reason, evidence: c.evidence },
        conversationId: question?.messageId ?? m.id,
        contextSources: m.role === "ASSISTANT" && question ? [{ messageId: question.messageId,
          role: question.role, start: question.start, end: question.end }] : [],
      });
  }
  title = "none";
  const eligible = docs.filter((d) => d.embeddingEnabled && d.importance >= 0.6);
  const summaries = [];
  for (let i = 0; i < eligible.length; i += 12) {
    const group = eligible.slice(i, i + 12);
    const content = bytePrefix(
      group
        .map((d) => `${d.metadata.role}: ${bytePrefix(d.content, 380)}`)
        .join("\n"),
      5500,
    );
    summaries.push(content);
    add(
      "TOPIC_SUMMARY",
      null,
      i / 12,
      content,
      {
        contentType: "EXTRACTIVE_SUMMARY",
        searchable: true,
        embeddingEnabled: true,
        importance: 0.9,
      },
      {
        method: "extractive",
        messageIds: [...new Set(group.map((d) => d.messageId))],
        documentIds: group.map((d) => d.id),
      },
    );
  }
  const sample =
    summaries.length <= 8
      ? summaries
      : Array.from(
          { length: 8 },
          (_, i) => summaries[Math.round((i * (summaries.length - 1)) / 7)],
        );
  const summary = bytePrefix(
    sample.map((s) => bytePrefix(s, 650)).join("\n"),
    5500,
  );
  add(
    "SESSION_SUMMARY",
    null,
    0,
    summary,
    {
      contentType: "EXTRACTIVE_SUMMARY",
      searchable: true,
      embeddingEnabled: !!summary,
      importance: 1,
    },
    { method: "extractive", topicCount: summaries.length },
  );
  return docs;
}
