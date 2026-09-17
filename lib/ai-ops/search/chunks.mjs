import { createHash } from "node:crypto";
export const CHUNK_VERSION = "paragraph-1";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
// Title participates in the embedding input, so it participates in the cache key.
export const contentHash = (title, content) =>
  digest(JSON.stringify([title, content]));
const machineLine =
  /^(?:npm (?:http|warn|notice|verbose)|\s*(?:\d{4}-\d\d-\d\d[T ]|\[?(?:INFO|DEBUG|TRACE)\]?\s)|[+\-]{3} |@@ |[+\-].*[;{}]\s*$|(?:added|removed|audited) \d+ packages)/i;
const importantError =
  /\b(?:error|exception|fatal|panic|failed|refused|denied|timeout)\b|오류|실패/i;
export function searchPolicy(type, content = "") {
  if (["USAGE", "CACHE", "SYSTEM"].includes(type))
    return {
      contentType: type,
      searchable: false,
      embeddingEnabled: false,
      importance: 0,
    };
  if (type === "TOOL_CALL")
    return {
      contentType: type,
      searchable: true,
      embeddingEnabled: false,
      importance: 0.2,
    };
  const lines = content.split("\n").filter((x) => x.trim());
  const noisy =
    ["COMMAND_OUTPUT", "BUILD_LOG", "TOOL_RESULT", "GIT_DIFF"].includes(type) ||
    (lines.length >= 8 &&
      lines.filter((l) => machineLine.test(l)).length / lines.length > 0.6);
  if (noisy)
    return {
      contentType: importantError.test(content)
        ? "ERROR_CONTEXT"
        : "MACHINE_OUTPUT",
      searchable: true,
      embeddingEnabled: importantError.test(content),
      importance: importantError.test(content) ? 0.5 : 0.1,
    };
  return {
    contentType: content.includes("```") ? "CODE_EXPLANATION" : "CONVERSATION",
    searchable: true,
    embeddingEnabled: !!content.trim(),
    importance: type === "USER" ? 1 : 0.95,
  };
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
  const body = message.body ?? "",
    chunks = [];
  let start = 0;
  while (start < body.length) {
    const prefix = bytePrefix(body.slice(start), 6000);
    let end = start + prefix.length;
    if (end < body.length) {
      const paragraph = prefix.lastIndexOf("\n\n");
      const line = prefix.lastIndexOf("\n");
      const boundary =
        paragraph > prefix.length / 2
          ? paragraph + 2
          : line > prefix.length / 2
            ? line + 1
            : prefix.length;
      end = start + boundary;
    }
    const content = body.slice(start, end);
    chunks.push({
      content,
      start,
      end,
      index: chunks.length,
      ...searchPolicy(message.content_type ?? message.role, content),
    });
    start = end;
  }
  return chunks;
}
export function buildDocuments(session, messages) {
  const docs = [];
  const title = bytePrefix(session.title || "none", 512);
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
  for (const m of messages)
    for (const c of chunkMessage(m))
      add("CHUNK", m.id, c.index, c.content, c, {
        start: c.start,
        end: c.end,
        role: m.role,
      });
  const eligible = docs.filter((d) => d.embeddingEnabled);
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
