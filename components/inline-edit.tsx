"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { HiOutlinePencil } from "react-icons/hi";

/* -------------------------------------------------------------------------
 * 연필을 눌러야 입력칸이 열리는 제자리 편집.
 *
 * 오늘의 할 일 이슈와 명심할 점이 같은 조작법을 쓰도록 여기 한 곳에 둔다.
 * 편집 중인지는 부모가 들고 있는다 — 한 화면에서 한 항목만 열리게 하려면
 * 부모가 판단해야 하기 때문이다.
 * ---------------------------------------------------------------------- */

/** 휴지통 왼쪽에 놓는 연필 버튼. 아이콘 버튼 모양은 이슈·명심할 점이 같다. */
export function EditButton({
  label,
  onClick,
}: {
  /** 스크린리더가 읽을 이름. "<항목 이름> 수정" 형태로 넘긴다. */
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-accent-light)] hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
      onClick={onClick}
      title="수정"
      type="button"
    >
      <HiOutlinePencil aria-hidden size={15} />
    </button>
  );
}

type InlineEditProps = {
  editing: boolean;
  /** 편집을 시작할 때의 값. 입력칸의 초기값이자 되돌릴 값이다. */
  value: string;
  /** 입력칸의 접근성 이름. */
  label: string;
  inputClassName: string;
  placeholder?: string;
  maxLength?: number;
  /**
   * 다듬은 값을 넘긴다. 빈 값이면 부르지 않는다 — 빈 제목은 이슈 추가에서도
   * 막고 있어 규칙을 맞춘다. 부모가 편집 상태를 닫는 것도 여기서 한다.
   */
  onCommit: (next: string) => void;
  onCancel: () => void;
  /** 읽기 상태에서 보여줄 것. 편집 중에는 입력칸으로 바뀐다. */
  children: ReactNode;
};

export function InlineEdit({
  editing,
  value,
  label,
  inputClassName,
  placeholder,
  maxLength,
  onCommit,
  onCancel,
  children,
}: InlineEditProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape 로 닫은 뒤 이어서 오는 blur 가 다시 저장하지 않게 막는다.
  const settledRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settledRef.current = false;
    const input = inputRef.current;
    if (!input) return;
    input.value = value;
    input.focus();
    input.select();
  }, [editing, value]);

  if (!editing) return <>{children}</>;

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const next = inputRef.current?.value.trim() ?? "";
    if (!next || next === value) onCancel();
    else onCommit(next);
  };

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <input
      aria-label={label}
      className={inputClassName}
      defaultValue={value}
      maxLength={maxLength}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      placeholder={placeholder}
      ref={inputRef}
      type="text"
    />
  );
}
