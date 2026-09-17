export type AiSource = "CODEX" | "CLAUDE_CODE";
export interface AiFilters {
  from?: string;
  to?: string;
  source?: AiSource | "";
  model?: string;
  device?: string;
  cursor?: string;
  limit?: number;
}
export interface AiTokens {
  inputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  records: number;
  missingRecords: number;
}
export interface AiSession {
  id: string;
  deviceId: string;
  deviceName: string;
  source: AiSource;
  externalId: string;
  cwd: string;
  title: string;
  startedAt: string;
  lastActiveAt: string;
}
export interface AiMessage {
  id: string;
  sessionId: string;
  role: "USER" | "ASSISTANT";
  model: string | null;
  occurredAt: string;
  body: string | null;
  expired: boolean;
  chars: number;
}
export interface AiDevice {
  id: string;
  name: string;
  lastSyncAt: string;
  rootCount: number;
  files: number;
  errors: number;
}
export interface AiOverview {
  summary: AiTokens & {
    sessions: number;
    messages: number;
    prompts: number;
    responses: number;
    promptChars: number;
    responseChars: number;
  };
  sessions: AiSession[];
  nextCursor: string | null;
  options: { models: string[]; sources: AiSource[] };
  devices: AiDevice[];
  byModel: (AiTokens & { model: string | null })[];
  byDay: (AiTokens & { day: string })[];
}
export interface AiSessionDetail {
  session: AiSession;
  messages: AiMessage[];
  nextCursor: string | null;
}
export interface AiSearchResult {
  mode?: "hybrid" | "keyword";
  fallbackReason?: string | null;
  profileId?: string;
  selectionVersion?: string;
  candidateSessions?: string[];
  context?: {
    sessionId: string;
    messageId: string;
    documentId: string | null;
    content: string;
    start: number;
    end: number;
  }[];
  messages: (AiMessage & {
    title: string;
    cwd: string;
    source: AiSource;
    deviceName: string;
    snippet?: string;
    score?: number;
    occurrences?: { messageId: string; occurredAt: string }[];
    question?: { messageId: string; content: string; start: number; end: number; occurredAt: string };
  })[];
  nextCursor: string | null;
}
