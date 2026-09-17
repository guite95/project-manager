import { realpath } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { prisma } from "../db.ts";
import { redact } from "../ai-ops/redact.mjs";
import { validWorkDate, WorkSummaryError, type WorkProject, type WorkRepository, type WorkSource } from "../work-summary.ts";

/** 당일 메시지만 읽으며 전문은 작업 이력에 넣지 않고 검토 파일로 분리한다. */
export async function collectAi(
  date: string,
  rootInput: string,
  projects: WorkProject[],
  repositories: WorkRepository[],
  mapping: Record<string, string> = {},
) {
  if (!validWorkDate(date)) throw new WorkSummaryError("유효한 날짜가 필요합니다.");
  const root = await realpath(resolve(rootInput));
  const projectMap = new Map(projects.map(p => [p.key, p]));
  for (const [cwd, slug] of Object.entries(mapping)) {
    if (!isAbsolute(cwd) || !projectMap.has(`app:${slug}`))
      throw new WorkSummaryError("AI 매핑은 절대 cwd 경로: 앱 프로젝트 slug 객체여야 합니다.");
  }
  const start = new Date(`${date}T00:00:00+09:00`);
  const [rows, devices] = await Promise.all([
    prisma.aiOpsMessage.findMany({
      where: { occurredAt: { gte: start, lt: new Date(start.getTime() + 86400000) }, role: { in: ["USER", "ASSISTANT"] } },
      include: { session: true },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: 20001,
    }),
    prisma.aiOpsDevice.findMany({ select: { name: true, lastSyncAt: true, errors: true }, orderBy: { id: "asc" } }),
  ]);
  if (rows.length > 20000) throw new WorkSummaryError("당일 AI 메시지가 20,000건을 초과합니다. 일부만 정리하지 않고 수집을 중단합니다.");
  const roots = [...new Set([root, resolve(rootInput)])];
  const repoPaths = repositories.filter(r => r.projectKey).flatMap(r => roots.map(base => ({
    path: resolve(base, r.path), key: r.projectKey!,
  }))).sort((a, b) => b.path.length - a.path.length);
  const sources: WorkSource[] = [];
  const messages = [];
  const canonicalPaths = new Map<string, string>();
  for (const row of rows) {
    const session = row.session;
    const cwd = session.cwd || "(unknown)";
    if (!canonicalPaths.has(cwd)) canonicalPaths.set(cwd, isAbsolute(cwd) ? await realpath(cwd).catch(() => cwd) : cwd);
    const canonical = canonicalPaths.get(cwd)!;
    const repo = isAbsolute(canonical) ? repoPaths.find(r => canonical === r.path || canonical.startsWith(r.path + sep)) : undefined;
    const projectKey = mapping[cwd] ? `app:${mapping[cwd]}` : repo?.key ?? `ai-cwd:${redact(cwd)}`;
    if (!projectMap.has(projectKey)) projectMap.set(projectKey, { key: projectKey, title: `${redact(cwd)} (AI 프로젝트 미연결)` });
    const source: WorkSource = {
      id: `ai:${row.id}`, kind: "ai", projectKey,
      title: redact(session.title || "제목 없는 세션").slice(0, 500),
      sessionId: session.id, messageId: row.id,
      aiSource: session.source as WorkSource["aiSource"], role: row.role as WorkSource["role"],
      cwd: redact(cwd), occurredAt: row.occurredAt.toISOString(), bodyAvailable: row.body !== null,
    };
    sources.push(source);
    messages.push({ sourceId: source.id, sessionId: session.id, projectKey, role: row.role, occurredAt: source.occurredAt, body: row.body === null ? null : redact(row.body) });
  }
  return {
    projects: [...projectMap.values()], sources,
    status: {
      messages: sources.length, sessions: new Set(sources.map(s => s.sessionId)).size,
      missingBodies: sources.filter(s => !s.bodyAvailable).length,
      devices: devices.map(d => ({ ...d, name: redact(d.name), lastSyncAt: d.lastSyncAt.toISOString() })),
    },
    transcript: { date, timezone: "Asia/Seoul", messages },
  };
}
