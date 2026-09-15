import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, realpath, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  WorkSummaryError,
  validWorkDate,
  type WorkProject,
  type WorkRepository,
  type WorkSource,
} from "../work-summary.ts";
const exec = promisify(execFile);
const ignored = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "venv",
  "coverage",
]);
async function git(path: string, args: string[]) {
  return (
    await exec("git", ["-C", path, ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
      },
    })
  ).stdout.trimEnd();
}
export async function collectGit(
  rootInput: string,
  date: string,
  appProjects: WorkProject[],
  mapping: Record<string, string>,
  authors: string[] = [],
) {
  if (!validWorkDate(date))
    throw new WorkSummaryError("유효한 날짜가 필요합니다.");
  const root = await realpath(resolve(rootInput));
  if (!(await stat(root)).isDirectory())
    throw new WorkSummaryError("프로젝트 루트 폴더가 필요합니다.");
  const paths: string[] = [];
  const repositories: WorkRepository[] = [];
  const sources: WorkSource[] = [];
  async function walk(path: string) {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      repositories.push({
        path: relative(root, path) || ".",
        status: "error",
        authorEmails: [],
        reason: "폴더를 읽을 수 없습니다.",
      });
      return;
    }
    if (entries.some((e) => e.name === ".git")) paths.push(path);
    // 중첩 저장소도 수집한다. 심볼릭 링크는 순환·루트 밖 탐색을 막기 위해 따라가지 않는다.
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)))
      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        !ignored.has(entry.name)
      )
        await walk(join(path, entry.name));
  }
  await walk(root);
  const projectMap = new Map(appProjects.map((p) => [p.key, p]));
  for (const [path, slug] of Object.entries(mapping))
    if (
      !paths.some((p) => (relative(root, p) || ".") === path) ||
      !projectMap.has(`app:${slug}`)
    )
      throw new WorkSummaryError(`저장소 매핑을 확인하세요: ${path}`);
  // 워크트리 별칭에 지정한 매핑도 공통 저장소에 적용한다.
  const mappingByCommon = new Map<string, string>();
  for (const [repo, slug] of Object.entries(mapping)) {
    const path = resolve(root, repo);
    const common = await realpath(
      resolve(path, await git(path, ["rev-parse", "--git-common-dir"])),
    );
    const previous = mappingByCommon.get(common);
    if (previous && previous !== slug)
      throw new WorkSummaryError(
        "같은 저장소의 워크트리에 서로 다른 프로젝트를 연결할 수 없습니다.",
      );
    mappingByCommon.set(common, slug);
  }
  const seen = new Set<string>();
  const start = Date.parse(`${date}T00:00:00+09:00`);
  const end = start + 86400000;
  for (const path of paths) {
    const repo = relative(root, path) || ".";
    let authorEmails = authors;
    try {
      const common = await realpath(
        resolve(path, await git(path, ["rev-parse", "--git-common-dir"])),
      );
      if (seen.has(common)) {
        repositories.push({
          path: repo,
          status: "skipped",
          authorEmails: [],
          reason: "같은 Git 저장소의 추가 워크트리입니다.",
        });
        continue;
      }
      seen.add(common);
      if (!authorEmails.length) {
        const email = await git(path, ["config", "--get", "user.email"]).catch(
          () => "",
        );
        authorEmails = email ? [email] : [];
      }
      if (!authorEmails.length) {
        repositories.push({
          path: repo,
          status: "skipped",
          authorEmails: [],
          reason: "작성자 이메일이 없습니다. --authors로 지정하세요.",
        });
        continue;
      }
      const matches = appProjects.filter((p) =>
        repo.split("/").includes(p.key.replace(/^app:/, "")),
      );
      const explicitSlug = mappingByCommon.get(common);
      const projectKey = explicitSlug
        ? `app:${explicitSlug}`
        : matches.length === 1
          ? matches[0].key
          : `repo:${repo}`;
      if (!projectMap.has(projectKey))
        projectMap.set(projectKey, {
          key: projectKey,
          title: `${repo} (프로젝트 미연결)`,
        });
      // HEAD가 없는 초기 저장소는 작업 0건이다. 다른 Git 오류는 아래에서 별도로 표시한다.
      const head = await git(path, ["rev-parse", "--verify", "HEAD"]).catch(
        () => "",
      );
      const refs = await git(path, ["for-each-ref", "--format=%(refname)"]);
      if (!head && !refs) {
        repositories.push({ path: repo, status: "ok", authorEmails });
        continue;
      }
      const raw = await git(path, [
        "log",
        "--all",
        ...(head ? ["HEAD"] : []),
        "--no-use-mailmap",
        `--since-as-filter=${new Date(start).toISOString()}`,
        `--until=${new Date(end).toISOString()}`,
        "--format=%H%x00%ae%x00%aI%x00%cI%x00%P%x00%s%x00",
      ]);
      const parts = raw.split("\0");
      const hashes = new Set<string>();
      for (let i = 0; i + 6 < parts.length; i += 6) {
        const [hashRaw, email, authoredAt, committedAt, parents, title] =
          parts.slice(i, i + 6);
        const hash = hashRaw.trim();
        const time = Date.parse(committedAt);
        if (
          hashes.has(hash) ||
          time < start ||
          time >= end ||
          !authorEmails.some((a) => a.toLowerCase() === email.toLowerCase())
        )
          continue;
        hashes.add(hash);
        sources.push({
          id: `git:${repo}:${hash}`,
          kind: "git",
          projectKey,
          title: title || "(커밋 제목 없음)",
          repository: repo,
          commit: hash,
          authorEmail: email,
          authoredAt,
          committedAt,
          merge: parents.trim().split(/\s+/).length > 1,
        });
      }
      repositories.push({ path: repo, status: "ok", authorEmails });
    } catch {
      repositories.push({
        path: repo,
        status: "error",
        authorEmails,
        reason:
          "Git 이력을 읽지 못했습니다. 접근 권한·Git 버전·로그 크기를 확인하세요.",
      });
    }
  }
  return { projects: [...projectMap.values()], repositories, sources };
}
