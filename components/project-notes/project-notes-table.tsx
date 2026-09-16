"use client";

import { useCallback, useEffect, useState } from "react";
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePlus,
  HiOutlineSelector,
  HiOutlineTrash,
} from "react-icons/hi";
import { isPersonalProject } from "@/lib/personal-projects";
import { Dropdown } from "@/components/erp/dropdown";
import { Button } from "@/components/erp/button";
import { EditButton, InlineEdit } from "@/components/inline-edit";
import {
  deleteNoteRequest,
  fetchNotes,
  patchNote,
  postNote,
  putNoteOrder,
} from "@/lib/api-client";
import {
  moveProjectNote,
  PROJECT_NOTE_DRAG_TYPE,
  PROJECT_NOTE_PRIORITIES,
  updateProjectNote,
  type ProjectNote,
  type ProjectNotePriority,
} from "@/lib/project-notes";

const PRIORITY_STYLES: Record<
  ProjectNotePriority,
  { row: string; select: string }
> = {
  urgent: {
    row: "border-l-[3px] border-l-[var(--bi-priority-urgent-line)] bg-[var(--bi-priority-urgent-bg)]",
    select:
      "border-[var(--bi-priority-urgent-line)] bg-[var(--bi-priority-urgent-bg)] text-[var(--bi-priority-urgent-line)]",
  },
  high: {
    row: "border-l-[3px] border-l-[var(--bi-priority-high-line)] bg-[var(--bi-priority-high-bg)]",
    select:
      "border-[var(--bi-priority-high-line)] bg-[var(--bi-priority-high-bg)] text-[var(--bi-priority-high-line)]",
  },
  normal: {
    row: "border-l-[3px] border-l-[var(--bi-priority-normal-line)] bg-[var(--bi-priority-normal-bg)]",
    select:
      "border-[var(--bi-priority-normal-line)] bg-[var(--bi-priority-normal-bg)] text-[var(--bi-priority-normal-line)]",
  },
  low: {
    row: "border-l-[3px] border-l-[var(--bi-priority-low-line)] bg-[var(--bi-priority-low-bg)]",
    select:
      "border-[var(--bi-priority-low-line)] bg-[var(--bi-priority-low-bg)] text-[var(--bi-priority-low-line)]",
  },
};

/** 빈 행도 말이 되게 부른다. 삭제 확인과 순서 변경 안내가 같이 쓴다. */
function noteLabel(note: ProjectNote): string {
  const content = note.content.trim();
  if (!content) return "빈 행";
  return `${content.slice(0, 40)}${content.length > 40 ? "…" : ""}`;
}

/** 커서가 행의 위 절반이면 그 행 앞, 아래 절반이면 뒤에 놓는다. */
function edgeFor(event: {
  clientY: number;
  currentTarget: HTMLElement;
}): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function ProjectNotesTable({ projectSlug }: { projectSlug: string }) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // 핸들을 잡았을 때만 행이 끌린다. 안 그러면 셀 안 입력칸의 텍스트 선택이 막힌다.
  const [handleHeldId, setHandleHeldId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropEdge, setDropEdge] = useState<{
    id: string;
    edge: "before" | "after";
  } | null>(null);
  // 한 번에 한 항목만 편집한다. 새 행은 열린 채로 시작한다.
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setNotes(await fetchNotes(projectSlug));
      setStorageError(null);
    } catch {
      setStorageError("서버에서 내용을 불러오지 못했습니다.");
    } finally {
      setLoaded(true);
    }
  }, [projectSlug]);

  useEffect(() => {
    setLoaded(false);
    void reload();
  }, [reload]);

  /**
   * 화면 상태를 먼저 바꾸고 서버에 반영한다. 실패하면 서버 상태를 다시 받아
   * 덮어써서 화면과 서버가 어긋난 채로 남지 않게 한다.
   */
  const sync = useCallback(
    async (call: () => Promise<unknown>) => {
      try {
        await call();
        setStorageError(null);
      } catch {
        setStorageError(
          "서버에 저장하지 못했습니다. 최신 내용을 다시 불러옵니다.",
        );
        await reload();
      }
    },
    [reload],
  );

  const addNote = () => {
    void sync(async () => {
      const note = await postNote(projectSlug);
      setNotes((current) => [note, ...current]);
      // 새 행은 비어 있다. 추가하자마자 타이핑하는 흐름이 끊기지 않게 연다.
      setEditingId(note.id);
    });
  };

  const editNote = (
    id: string,
    patch: Partial<Pick<ProjectNote, "content" | "priority">>,
  ) => {
    setNotes((current) =>
      updateProjectNote(current, id, patch, new Date().toISOString()),
    );
    if (patch.content !== undefined) {
      const content = patch.content;
      void sync(() => patchNote(id, { content }));
    }
    if (patch.priority !== undefined) {
      const priority = patch.priority;
      void sync(() => patchNote(id, { priority }));
    }
  };

  const removeNote = (note: ProjectNote) => {
    if (!window.confirm(`“${noteLabel(note)}” 항목을 삭제할까요?`)) return;
    if (editingId === note.id) setEditingId(null);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    void sync(() => deleteNoteRequest(note.id));
  };

  /** 드래그와 위/아래 버튼이 함께 쓰는 자리 옮기기. 순서만 바꾸고 수정 시각은 그대로 둔다. */
  const moveNote = (
    id: string,
    targetId: string,
    position: "before" | "after",
  ) => {
    const next = moveProjectNote(notes, id, targetId, position);
    if (next === notes) return;
    setNotes(next);
    void sync(() =>
      putNoteOrder(
        projectSlug,
        next.map((item) => item.id),
      ),
    );
    const moved = next.find((note) => note.id === id);
    if (moved) {
      setAnnouncement(
        `${noteLabel(moved)} 항목을 ${
          next.findIndex((note) => note.id === id) + 1
        }번째로 옮겼습니다.`,
      );
    }
  };

  /** 위/아래 버튼 — 한 칸 옮기기를 이웃 기준 이동으로 옮겨 적는다. */
  const stepNote = (id: string, delta: -1 | 1) => {
    const from = notes.findIndex((note) => note.id === id);
    const neighbour = notes[from + delta];
    if (from === -1 || !neighbour) return;
    moveNote(id, neighbour.id, delta === -1 ? "before" : "after");
  };

  return (
    <section className="overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bi-border)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2" aria-label="우선순위 색상 안내">
          {PROJECT_NOTE_PRIORITIES.map((priority, index) => (
            <span
              className={`inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLES[priority.value].select}`}
              key={priority.value}
            >
              <span aria-hidden>{index + 1}</span>
              {priority.label}
            </span>
          ))}
        </div>
        <Button onClick={addNote} size="sm">
          <HiOutlinePlus aria-hidden size={14} />
          행 추가
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[784px] table-fixed border-collapse text-[12px]">
          <caption className="sr-only">{isPersonalProject(projectSlug) ? "프로젝트 기록" : "프로젝트 진행 시 명심할 점"}</caption>
          <colgroup>
            <col className="w-[64px]" />
            <col className="w-[140px]" />
            <col />
            <col className="w-[150px]" />
            <col className="w-[64px]" />
          </colgroup>
          <thead className="bg-[var(--bi-table-header)] text-[var(--bi-muted)]">
            <tr>
              <th className="border-b border-[var(--bi-border)] px-3 py-3 text-left text-[11px] font-semibold" scope="col">
                <span className="sr-only">순서</span>
              </th>
              <th className="border-b border-[var(--bi-border)] px-4 py-3 text-left text-[11px] font-semibold" scope="col">
                우선순위
              </th>
              <th className="border-b border-[var(--bi-border)] px-4 py-3 text-left text-[11px] font-semibold" scope="col">
                {isPersonalProject(projectSlug) ? "기록" : "명심할 점"}
              </th>
              <th className="border-b border-[var(--bi-border)] px-4 py-3 text-left text-[11px] font-semibold" scope="col">
                수정 시각
              </th>
              <th className="border-b border-[var(--bi-border)] px-4 py-3 text-right text-[11px] font-semibold" scope="col">
                <span className="sr-only">행 작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!loaded ? (
              <tr>
                <td className="px-4 py-10 text-center text-[var(--bi-muted)]" colSpan={5}>
                  저장된 내용을 불러오는 중입니다.
                </td>
              </tr>
            ) : notes.length === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center" colSpan={5}>
                  <p className="m-0 text-[12px] font-medium text-[var(--bi-fg)]">
                    아직 적어둔 내용이 없습니다.
                  </p>
                  <p className="mt-1 mb-3 text-[11px] text-[var(--bi-muted)]">
                    프로젝트 진행 중 놓치면 안 되는 기준을 한 줄씩 추가하세요.
                  </p>
                  <Button onClick={addNote} size="sm" variant="secondary">
                    <HiOutlinePlus aria-hidden size={14} />
                    첫 행 추가
                  </Button>
                </td>
              </tr>
            ) : (
              notes.map((note, index) => (
                <tr
                  className={`${PRIORITY_STYLES[note.priority].row} ${
                    draggingId === note.id ? "opacity-40" : ""
                  } ${
                    dropEdge?.id === note.id
                      ? dropEdge.edge === "before"
                        ? "border-t-2 border-t-[var(--bi-accent)]"
                        : "border-b-2 border-b-[var(--bi-accent)]"
                      : ""
                  }`}
                  draggable={handleHeldId === note.id}
                  key={note.id}
                  onDragEnd={() => {
                    setHandleHeldId(null);
                    setDraggingId(null);
                    setDropEdge(null);
                  }}
                  onDragLeave={(event) => {
                    // 셀 사이를 지날 때도 dragleave 가 뜬다. 행 밖으로 나간 것만 센다.
                    if (event.currentTarget.contains(event.relatedTarget as Node)) {
                      return;
                    }
                    setDropEdge(null);
                  }}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes(PROJECT_NOTE_DRAG_TYPE)) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropEdge({ id: note.id, edge: edgeFor(event) });
                  }}
                  onDragStart={(event) => {
                    // 입력칸 안 텍스트 드래그가 여기까지 버블링된다. 행 자신이
                    // 시작한 드래그가 아니면 손대지 않는다.
                    if (event.target !== event.currentTarget) return;
                    event.dataTransfer.setData(PROJECT_NOTE_DRAG_TYPE, note.id);
                    // text/plain 도 함께 넣는다. 표준 타입이 없으면 드래그 이미지를
                    // 만들지 않는 브라우저가 있다.
                    event.dataTransfer.setData("text/plain", noteLabel(note));
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingId(note.id);
                  }}
                  onDrop={(event) => {
                    if (!event.dataTransfer.types.includes(PROJECT_NOTE_DRAG_TYPE)) {
                      return;
                    }
                    event.preventDefault();
                    const edge = edgeFor(event);
                    setDropEdge(null);
                    const draggedId = event.dataTransfer.getData(
                      PROJECT_NOTE_DRAG_TYPE,
                    );
                    if (draggedId) moveNote(draggedId, note.id, edge);
                  }}
                >
                  <td className="border-b border-[var(--bi-border)] px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <span
                        aria-hidden
                        className="shrink-0 cursor-grab text-[var(--bi-muted)] active:cursor-grabbing"
                        onMouseDown={() => {
                          setHandleHeldId(note.id);
                          // 드래그가 시작되지 않은 채 핸들 밖에서 손을 떼도 잠금이
                          // 풀려야 한다. 안 그러면 그 행은 계속 draggable 로 남아
                          // 셀 안 입력칸의 텍스트 선택이 막힌다.
                          window.addEventListener(
                            "mouseup",
                            () => setHandleHeldId(null),
                            { once: true },
                          );
                        }}
                        title="끌어서 순서 변경"
                      >
                        <HiOutlineSelector size={14} />
                      </span>
                      <span className="flex shrink-0 flex-col">
                        <button
                          aria-label={`${index + 1}번째 항목 위로 옮기기`}
                          className="inline-flex h-3.5 w-4 items-center justify-center rounded-[2px] text-[var(--bi-muted)] outline-none transition hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)] disabled:opacity-30 disabled:hover:text-[var(--bi-muted)]"
                          disabled={index === 0}
                          onClick={() => stepNote(note.id, -1)}
                          type="button"
                        >
                          <HiOutlineChevronUp aria-hidden size={11} />
                        </button>
                        <button
                          aria-label={`${index + 1}번째 항목 아래로 옮기기`}
                          className="inline-flex h-3.5 w-4 items-center justify-center rounded-[2px] text-[var(--bi-muted)] outline-none transition hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)] disabled:opacity-30 disabled:hover:text-[var(--bi-muted)]"
                          disabled={index === notes.length - 1}
                          onClick={() => stepNote(note.id, 1)}
                          type="button"
                        >
                          <HiOutlineChevronDown aria-hidden size={11} />
                        </button>
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-[var(--bi-border)] px-4 py-2.5">
                    <Dropdown ariaLabel={`${index + 1}번째 항목 우선순위`} searchable
                      triggerClassName={`font-semibold ${PRIORITY_STYLES[note.priority].select}`}
                      value={note.priority} options={PROJECT_NOTE_PRIORITIES}
                      onChange={value => editNote(note.id, { priority: value as ProjectNotePriority })} />
                  </td>
                  <td className="border-b border-[var(--bi-border)] px-4 py-2.5">
                    <InlineEdit
                      editing={editingId === note.id}
                      inputClassName="h-[30px] w-full rounded-[4px] border border-[var(--bi-accent)] bg-[var(--bi-card-bg)] px-2 text-[12px] text-[var(--bi-fg)] outline-none placeholder:text-[var(--bi-muted)]"
                      label={`${index + 1}번째 ${isPersonalProject(projectSlug) ? "기록" : "명심할 점"}`}
                      maxLength={500}
                      onCancel={() => setEditingId(null)}
                      onCommit={(next) => {
                        setEditingId(null);
                        editNote(note.id, { content: next });
                      }}
                      placeholder="예: 고객 확인 전 범위를 확정하지 않기"
                      value={note.content}
                    >
                      <span
                        className={`block truncate text-[12px] ${
                          note.content
                            ? "text-[var(--bi-fg)]"
                            : "text-[var(--bi-muted)]"
                        }`}
                      >
                        {note.content || "내용 없음"}
                      </span>
                    </InlineEdit>
                  </td>
                  <td className="whitespace-nowrap border-b border-[var(--bi-border)] px-4 py-2.5 text-[11px] text-[var(--bi-muted)]">
                    {formatUpdatedAt(note.updatedAt)}
                  </td>
                  <td className="whitespace-nowrap border-b border-[var(--bi-border)] px-4 py-2.5 text-right">
                    <EditButton
                      label={`${index + 1}번째 항목 수정`}
                      onClick={() => setEditingId(note.id)}
                    />
                    <button
                      aria-label={`${index + 1}번째 항목 삭제`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none hover:bg-[var(--bi-error)]/10 hover:text-[var(--bi-error)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
                      onClick={() => removeNote(note)}
                      title="삭제"
                      type="button"
                    >
                      <HiOutlineTrash aria-hidden size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="flex min-h-9 items-center justify-between gap-3 border-t border-[var(--bi-border)] px-4 py-2 text-[11px] text-[var(--bi-muted)]">
        <span>연필을 눌러 고칩니다. 바뀐 내용은 서버에 자동 저장됩니다.</span>
        <span aria-live="polite" className={storageError ? "text-[var(--bi-error)]" : ""}>
          {storageError ?? (loaded ? `${notes.length}개 항목 저장됨` : "불러오는 중")}
        </span>
      </div>
    </section>
  );
}
