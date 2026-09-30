"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { cx } from "../lib/class-names";
import { ExternalLinkIcon } from "./icons";

export type DualSidebarNavItem = {
  id?: string;
  label: ReactNode;
  textValue?: string;
  href: string;
  icon?: ReactNode;
  external?: boolean;
  separated?: boolean;
  active?: boolean;
  /** 처리 대기 건수 배지 — 0 또는 미지정이면 그리지 않는다 */
  badgeCount?: number;
};

export type DualSidebarSection = {
  id?: string;
  title?: ReactNode;
  items: readonly DualSidebarNavItem[];
};

export type DualSidebarGroup = {
  id?: string;
  /** 아이콘 레일에 표시할 짧은 이름 */
  railLabel: ReactNode;
  /** 아이콘 레일 아이콘 */
  railIcon?: ReactNode;
  /** 서브 패널 헤더 제목 */
  title: ReactNode;
  /** 서브 패널 헤더 보조 설명 */
  description?: ReactNode;
  /** 소제목 없는 단일 목록 그룹 — `sections`가 있으면 무시된다 */
  items?: readonly DualSidebarNavItem[];
  /** 소제목으로 다시 묶는 그룹 */
  sections?: readonly DualSidebarSection[];
  /**
   * 이 그룹이 소유한 URL 네임스페이스 — 메뉴 항목과 직접 일치하지 않는
   * 하위 경로(상세 페이지 등)에서도 그룹 패널이 열리게 한다. (예: "/sales")
   */
  pathPrefixes?: readonly string[];
};

export type DualSidebarRenderLinkProps = {
  item: DualSidebarNavItem;
  active: boolean;
  className: string;
  children: ReactNode;
  target?: "_blank";
  rel?: "noopener noreferrer";
  ariaCurrent?: "page";
  onClick: (event: MouseEvent<HTMLElement>) => void;
};

export type DualSidebarProps = {
  /** 아이콘 레일 최상단 브랜드 슬롯 — 보통 홈으로 가는 로고 링크를 넣는다 */
  brand?: ReactNode;
  groups: readonly DualSidebarGroup[];
  currentPath?: string;
  isItemActive?: (item: DualSidebarNavItem, currentPath?: string) => boolean;
  /** 레일 버튼 클릭 시 호출 — 보통 `getDualSidebarFirstItem(group)`의 href로 이동시킨다 */
  onGroupSelect?: (group: DualSidebarGroup) => void;
  onItemSelect?: (item: DualSidebarNavItem) => void;
  renderLink?: (props: DualSidebarRenderLinkProps) => ReactNode;
  /** 서브 패널 최하단 슬롯 — 제품명·데모 문구 등 */
  footer?: ReactNode;
  railLabel?: string;
  panelLabel?: string;
  badgeAriaLabel?: (count: number) => string;
  /** 레일 버튼의 그룹 합산 배지 접근성 라벨 — 그룹 내 항목 badgeCount 합계로 자동 표시된다 */
  railBadgeAriaLabel?: (count: number) => string;
  className?: string;
  style?: CSSProperties;
};

function sectionsOf(group: DualSidebarGroup): readonly DualSidebarSection[] {
  if (group.sections) return group.sections;
  if (group.items) return [{ items: group.items }];
  return [];
}

/** 그룹의 첫 이동 가능 메뉴 — 새 창으로 여는 항목은 건너뛴다 */
export function getDualSidebarFirstItem(group: DualSidebarGroup): DualSidebarNavItem | null {
  for (const section of sectionsOf(group)) {
    const found = section.items.find((item) => !item.external);
    if (found) return found;
  }
  return null;
}

function getTextValue(item: DualSidebarNavItem): string | undefined {
  if (item.textValue) return item.textValue;
  return typeof item.label === "string" ? item.label : undefined;
}

function defaultIsItemActive(item: DualSidebarNavItem, currentPath?: string): boolean {
  return item.active ?? currentPath === item.href;
}

export function DualSidebar({
  brand,
  groups,
  currentPath,
  isItemActive = defaultIsItemActive,
  onGroupSelect,
  onItemSelect,
  renderLink,
  footer,
  railLabel = "업무 영역",
  panelLabel = "세부 메뉴",
  badgeAriaLabel = (count) => `대기 ${count}건`,
  railBadgeAriaLabel = (count) => `확인 필요 ${count}건`,
  className,
  style
}: DualSidebarProps) {
  const [manualIndex, setManualIndex] = useState<number | null>(null);

  // 경로가 바뀌면 수동 선택을 해제해 현재 화면이 속한 영역이 열리게 한다
  useEffect(() => {
    setManualIndex(null);
  }, [currentPath]);

  const pathIndex = groups.findIndex((group) =>
    sectionsOf(group).some((section) => section.items.some((item) => isItemActive(item, currentPath)))
  );
  // 항목 일치가 없으면 그룹 pathPrefixes(URL 네임스페이스)로 폴백 — 상세 페이지에서도 소속 그룹이 열린다
  const prefixIndex =
    pathIndex >= 0 || !currentPath
      ? -1
      : groups.findIndex((group) =>
          group.pathPrefixes?.some(
            (prefix) => currentPath === prefix || currentPath.startsWith(`${prefix.replace(/\/$/, "")}/`)
          )
        );
  const activeIndex = manualIndex ?? (pathIndex >= 0 ? pathIndex : prefixIndex >= 0 ? prefixIndex : 0);
  const activeGroup = groups[activeIndex];

  return (
    <div className={cx("pds", "pds-dual-sidebar", className)} style={style}>
      <nav className="pds-dual-sidebar__rail" aria-label={railLabel}>
        {brand ? <div className="pds-dual-sidebar__brand">{brand}</div> : null}
        {groups.map((group, index) => {
          const active = index === activeIndex;
          const title = typeof group.title === "string" ? group.title : undefined;
          // 사람이 확인해야 할 건수는 다른 영역을 보고 있어도 레일에서 보여야 한다
          const pendingCount = sectionsOf(group).reduce(
            (sum, section) => sum + section.items.reduce((acc, item) => acc + (item.badgeCount ?? 0), 0),
            0
          );
          return (
            <button
              key={group.id ?? index}
              type="button"
              className={cx("pds-dual-sidebar__rail-button", active && "is-active")}
              title={title}
              aria-current={active ? "true" : undefined}
              onClick={() => {
                setManualIndex(index);
                onGroupSelect?.(group);
              }}
            >
              {group.railIcon ? (
                <span className="pds-dual-sidebar__rail-icon" aria-hidden="true">
                  {group.railIcon}
                </span>
              ) : null}
              <span className="pds-dual-sidebar__rail-label">{group.railLabel}</span>
              {pendingCount ? (
                <span className="pds-dual-sidebar__rail-badge" aria-label={railBadgeAriaLabel(pendingCount)}>
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="pds-dual-sidebar__panel">
        <header className="pds-dual-sidebar__panel-header">
          <div className="pds-dual-sidebar__panel-title">{activeGroup?.title}</div>
          {activeGroup?.description ? (
            <div className="pds-dual-sidebar__panel-description">{activeGroup.description}</div>
          ) : null}
        </header>

        <nav className="pds-dual-sidebar__panel-nav" aria-label={panelLabel}>
          {activeGroup
            ? sectionsOf(activeGroup).map((section, sectionIndex) => (
                <section className="pds-dual-sidebar__section" key={section.id ?? sectionIndex}>
                  {section.title ? (
                    <div className="pds-dual-sidebar__section-title">{section.title}</div>
                  ) : null}
                  <ul className="pds-dual-sidebar__items">
                    {section.items.map((item, itemIndex) => {
                      const active = isItemActive(item, currentPath);
                      const linkClassName = cx("pds-dual-sidebar__link", active && "is-active");
                      const target = item.external ? ("_blank" as const) : undefined;
                      const rel = item.external ? ("noopener noreferrer" as const) : undefined;
                      const handleClick = (_event: MouseEvent<HTMLElement>) => onItemSelect?.(item);
                      const content = (
                        <>
                          {item.icon ? (
                            <span className="pds-dual-sidebar__link-icon" aria-hidden="true">
                              {item.icon}
                            </span>
                          ) : null}
                          <span className="pds-dual-sidebar__link-label">{item.label}</span>
                          {item.external ? (
                            <ExternalLinkIcon className="pds-dual-sidebar__external-icon" size={13} />
                          ) : null}
                          {item.badgeCount ? (
                            <span className="pds-dual-sidebar__badge" aria-label={badgeAriaLabel(item.badgeCount)}>
                              {item.badgeCount}
                            </span>
                          ) : null}
                        </>
                      );
                      const linkProps: DualSidebarRenderLinkProps = {
                        item,
                        active,
                        className: linkClassName,
                        children: content,
                        target,
                        rel,
                        ariaCurrent: active ? "page" : undefined,
                        onClick: handleClick
                      };

                      return (
                        <li
                          className={cx("pds-dual-sidebar__item", item.separated && "is-separated")}
                          key={item.id ?? item.href ?? itemIndex}
                        >
                          {renderLink ? (
                            renderLink(linkProps)
                          ) : (
                            <a
                              href={item.href}
                              className={linkClassName}
                              target={target}
                              rel={rel}
                              aria-current={linkProps.ariaCurrent}
                              onClick={handleClick}
                            >
                              {content}
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            : null}
        </nav>

        {footer ? <div className="pds-dual-sidebar__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
