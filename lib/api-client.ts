/* -------------------------------------------------------------------------
 * 화면이 쓰는 fetch 래퍼. 응답이 성공이 아니면 던진다.
 * 화면은 순수 함수로 상태를 먼저 바꾸고 여기 함수를 부른다. 던지면 보드를 다시
 * 받아 덮어쓴다.
 * ---------------------------------------------------------------------- */

import type { ProjectNote } from "@/lib/project-notes";
import type { CustomProject, Issue, TodayBoard } from "@/lib/today-board";

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init?.headers }
      : init?.headers,
  });
  if (!response.ok) {
    // 세션이 끊기면 proxy 가 401 을 준다. 로그인 화면으로 보낸다.
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error(`요청 실패: ${response.status}`);
  }
  return response;
}

export async function fetchBoard(): Promise<TodayBoard> {
  return (await request("/api/board")).json();
}

export async function postIssue(
  projectSlug: string,
  title: string,
): Promise<Issue> {
  const response = await request("/api/issues", {
    method: "POST",
    body: JSON.stringify({ projectSlug, title }),
  });
  return response.json();
}

export async function patchIssue(
  id: string,
  patch: { placement?: "pool" | "today"; done?: boolean },
): Promise<void> {
  await request(`/api/issues/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteIssueRequest(id: string): Promise<void> {
  await request(`/api/issues/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function putIssueOrder(ids: string[]): Promise<void> {
  await request("/api/issues/order", {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}

export async function postProject(title: string): Promise<CustomProject> {
  const response = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return response.json();
}

export async function deleteProjectRequest(slug: string): Promise<void> {
  await request(`/api/projects/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export async function putSettings(settings: {
  projectOrder: string[];
  collapsedProjects: string[];
}): Promise<void> {
  await request("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

/* ---------------------------------------------------------------- 명심할 점 */

export async function fetchNotes(projectSlug: string): Promise<ProjectNote[]> {
  const response = await request(
    `/api/notes/${encodeURIComponent(projectSlug)}`,
  );
  return response.json();
}

export async function postNote(projectSlug: string): Promise<ProjectNote> {
  const response = await request(
    `/api/notes/${encodeURIComponent(projectSlug)}`,
    { method: "POST" },
  );
  return response.json();
}

export async function patchNote(
  id: string,
  patch: { content?: string; priority?: string },
): Promise<void> {
  await request(`/api/notes/item/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteNoteRequest(id: string): Promise<void> {
  await request(`/api/notes/item/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function putNoteOrder(
  projectSlug: string,
  ids: string[],
): Promise<void> {
  await request(`/api/notes/${encodeURIComponent(projectSlug)}/order`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}
