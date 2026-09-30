"use client";

import type { CSSProperties, ReactNode } from "react";
import { cx } from "../lib/class-names";
import { CloseIcon } from "./icons";
import { Modal } from "./modal";
import { Tabs, type TabItem } from "./tabs";

/**
 * 상세 모달 탭. 아이콘과 라벨만 사용하고 건수 배지(`meta`)는 쓰지 않는다 —
 * 상세 모달의 탭은 뷰 전환 수단이고 건수는 본문 stats·표에서 읽는다.
 */
export type SplitModalTab<TabKey extends string = string> = Omit<TabItem<TabKey>, "meta">;

/**
 * 좌측 레일의 라벨-값 한 줄. 값은 우측 정렬하고 한 줄로 말줄임한다.
 * `title`을 주지 않아도 문자열 값이면 잘린 값의 툴팁으로 그대로 쓴다.
 * `tone: "accent"`는 상태·잔여처럼 그룹에서 한눈에 읽혀야 하는 값에만 쓴다.
 */
export type SplitModalFact = {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  title?: string;
  tone?: "default" | "accent";
};

/** 레일 facts를 묶는 카테고리. 그룹 라벨은 낮은 높이의 흐린 머리말로 렌더된다. */
export type SplitModalFactGroup = { label: ReactNode; facts: readonly SplitModalFact[] };

/** 탭 콘텐츠 최상단에 고정으로 깔리는 요약 지표. */
export type SplitModalStat = { icon?: ReactNode; label: ReactNode; value: ReactNode; note?: ReactNode };

/** 레일 머리말. 아바타나 설명 문단 없이 눈썹 문구와 제목만 둔다. */
export type SplitModalProfile = { eyebrow?: ReactNode; title: ReactNode };

export type SplitModalLayoutProps<TabKey extends string> = {
  onClose: () => void;
  /** 닫기 버튼의 접근성 이름 */
  closeLabel?: string;
  profile?: SplitModalProfile;
  /** 카테고리 없이 나열하는 레일 행 */
  facts?: readonly SplitModalFact[];
  /** 카테고리로 묶은 레일 행. `facts`와 함께 주면 flat facts가 먼저, 그룹이 그 아래에 온다 */
  factGroups?: readonly SplitModalFactGroup[];
  /** facts 아래 자유 영역 — SplitModalRow 등으로 구성한다 */
  rail?: ReactNode;
  /** 레일 하단 액션 버튼 그리드 */
  railActions?: ReactNode;
  /** 레일 맨 아래 고정 요약 영역 */
  railFooter?: ReactNode;
  tabs: readonly SplitModalTab<TabKey>[];
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  tabsAriaLabel: string;
  /** 탭 바에서 닫기 버튼 앞에 놓을 보조 영역 */
  tabbarExtra?: ReactNode;
  stats?: readonly SplitModalStat[];
  statsColumns?: number;
  layoutClassName?: string;
  children: ReactNode;
};

export type SplitModalProps<TabKey extends string> = SplitModalLayoutProps<TabKey> & {
  open: boolean;
  ariaLabel: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  /** 좌측 레일 폭 (기본 238px) */
  railWidth?: CSSProperties["width"];
  /**
   * 포털 루트(backdrop)에 붙는 클래스. Modal은 `document.body`로 포털하므로 앱의
   * 토큰 스코프 밖에서 렌더된다. `--pds-*`를 앱 토큰으로 덮어쓰는 스코프 클래스를 여기로 넘긴다.
   */
  rootClassName?: string;
  /** 다이얼로그 패널에 붙는 클래스 */
  className?: string;
};

/** 레일 facts 목록. 값은 우측 정렬·한 줄 말줄임이며 문자열 값은 그대로 툴팁이 된다. */
function SplitModalFactList({ facts }: { facts: readonly SplitModalFact[] }) {
  return (
    <dl className="pds-split-modal__facts">
      {facts.map((fact, index) => (
        <div key={index}>
          <dt>{fact.icon}<span>{fact.label}</span></dt>
          <dd
            className={fact.tone === "accent" ? "is-accent" : undefined}
            title={fact.title ?? (typeof fact.value === "string" ? fact.value : undefined)}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 레일 자유 영역에서 쓰는 라벨-값 한 줄. */
export function SplitModalRow({ label, value, title }: { label: ReactNode; value: ReactNode; title?: string }) {
  return (
    <div className="pds-split-modal__row">
      <span>{label}</span>
      <strong title={title}>{value}</strong>
    </div>
  );
}

export type SplitModalSectionProps = {
  icon?: ReactNode;
  title: ReactNode;
  /** 제목 옆 보조 설명 (기준·근거 등) */
  note?: ReactNode;
  /** 헤더 우측 액션 영역 */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * 탭 콘텐츠 섹션. 헤더는 낮은 높이·회색 배경·아이콘으로 통일해
 * 한 탭 안에 여러 섹션이 쌓여도 본문과 구분되게 한다.
 */
export function SplitModalSection({ icon, title, note, actions, className, children }: SplitModalSectionProps) {
  return (
    <section className={cx("pds-split-modal-section", className)}>
      <header>
        <div>
          {icon ? <span className="pds-split-modal-section__icon">{icon}</span> : null}
          <b>{title}</b>
          {note != null ? <span className="pds-split-modal-section__note">{note}</span> : null}
        </div>
        {actions ? <div className="pds-split-modal-section__actions">{actions}</div> : null}
      </header>
      <div className="pds-split-modal-section__body">{children}</div>
    </section>
  );
}

/**
 * 모달 껍데기 없이 좌측 레일 + 우측 탭 분할 레이아웃만 렌더한다.
 * 같은 구조를 전체 화면이나 다른 오버레이 안에서 재사용할 때 쓴다.
 */
export function SplitModalLayout<TabKey extends string>({
  onClose,
  closeLabel = "닫기",
  profile,
  facts,
  factGroups,
  rail,
  railActions,
  railFooter,
  tabs,
  tab,
  onTabChange,
  tabsAriaLabel,
  tabbarExtra,
  stats,
  statsColumns = 3,
  layoutClassName,
  children
}: SplitModalLayoutProps<TabKey>) {
  // 상세 모달 탭에는 건수 배지를 두지 않는다. 타입으로 막았지만 런타임에서도 meta를 넘기지 않는다.
  const tabItems: TabItem<TabKey>[] = tabs.map(({ key, label, icon, align, disabled }) => ({ key, label, icon, align, disabled }));
  const hasRail = Boolean(profile || facts?.length || factGroups?.length || rail || railActions || railFooter);

  return (
    <div className={cx("pds", "pds-split-modal__layout", !hasRail && "is-railless", layoutClassName)}>
      {hasRail ? (
        <aside className="pds-split-modal__rail">
          {profile ? (
            <div className="pds-split-modal__profile">
              {profile.eyebrow != null ? <span>{profile.eyebrow}</span> : null}
              <h2>{profile.title}</h2>
            </div>
          ) : null}
          {facts?.length ? <SplitModalFactList facts={facts} /> : null}
          {factGroups?.length ? (
            <div className="pds-split-modal__fact-groups">
              {factGroups.map((group, index) => (
                <section className="pds-split-modal__fact-group" key={index}>
                  <h3 className="pds-split-modal__fact-group-label">{group.label}</h3>
                  <SplitModalFactList facts={group.facts} />
                </section>
              ))}
            </div>
          ) : null}
          {rail ? <div className="pds-split-modal__rail-body">{rail}</div> : null}
          {railActions ? <div className="pds-split-modal__actions">{railActions}</div> : null}
          {railFooter ? <div className="pds-split-modal__rail-footer">{railFooter}</div> : null}
        </aside>
      ) : null}
      <section className="pds-split-modal__main">
        <div className="pds-split-modal__tabbar">
          <Tabs
            items={tabItems}
            value={tab}
            onChange={onTabChange}
            variant="underline"
            size="small"
            bordered
            ariaLabel={tabsAriaLabel}
            className="pds-split-modal__tabs"
          />
          <div className="pds-split-modal__tabbar-side">
            {tabbarExtra}
            <button type="button" className="pds-split-modal__close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
              <CloseIcon size={15} />
            </button>
          </div>
        </div>
        <div className="pds-split-modal__scroll">
          {stats?.length ? (
            <section
              className="pds-split-modal__stats"
              style={{ gridTemplateColumns: `repeat(${statsColumns}, minmax(0, 1fr))` }}
            >
              {stats.map((stat, index) => (
                <div key={index}>
                  <span>{stat.icon}{stat.label}</span>
                  <strong>{stat.value}</strong>
                  {stat.note != null ? <small>{stat.note}</small> : null}
                </div>
              ))}
            </section>
          ) : null}
          {children}
        </div>
      </section>
    </div>
  );
}

/**
 * 업무 상세 모달의 표준 셸 — 좌측 요약 레일 + 우측 탭 분할.
 * 별도 메인 헤더 없이 탭 바 오른쪽에 닫기 버튼을 두고, 요약 지표는 탭 콘텐츠 최상단에 고정한다.
 * backdrop·Escape 닫기, 포커스 트랩과 복원, 스크롤 잠금은 `Modal`이 담당한다.
 */
export function SplitModal<TabKey extends string>({
  open,
  ariaLabel,
  closeOnBackdrop,
  closeOnEscape,
  width = "min(1180px, calc(100vw - 40px))",
  height = "min(760px, calc(100dvh - 40px))",
  railWidth,
  rootClassName,
  className,
  ...layoutProps
}: SplitModalProps<TabKey>) {
  const style = {
    width,
    height,
    ...(railWidth === undefined ? null : { ["--pds-split-modal-rail-width" as string]: typeof railWidth === "number" ? `${railWidth}px` : railWidth })
  } as CSSProperties;

  return (
    <Modal
      open={open}
      onClose={layoutProps.onClose}
      ariaLabel={ariaLabel}
      showCloseButton={false}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      className={cx("pds-split-modal-root", rootClassName)}
      contentClassName={cx("pds-split-modal", className)}
      style={style}
    >
      <SplitModalLayout {...layoutProps} />
    </Modal>
  );
}
