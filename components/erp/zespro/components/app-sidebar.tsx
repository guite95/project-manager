"use client";

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { cx } from "../lib/class-names";
import { ChevronDoubleIcon, ExternalLinkIcon } from "./icons";

export type AppSidebarNavItem = {
  id?: string;
  label: ReactNode;
  textValue?: string;
  href: string;
  icon?: ReactNode;
  external?: boolean;
  separated?: boolean;
  active?: boolean;
};

export type AppSidebarNavGroup = {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  items: readonly AppSidebarNavItem[];
};

export type AppSidebarRenderLinkProps = {
  item: AppSidebarNavItem;
  active: boolean;
  collapsed: boolean;
  className: string;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
  ariaCurrent?: "page";
  onClick: (event: MouseEvent<HTMLElement>) => void;
};

export type AppSidebarProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  groups: readonly AppSidebarNavGroup[];
  currentPath?: string;
  isItemActive?: (item: AppSidebarNavItem, currentPath?: string) => boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onItemSelect?: (item: AppSidebarNavItem) => void;
  renderLink?: (props: AppSidebarRenderLinkProps) => ReactNode;
  navigationLabel?: string;
  collapseLabel?: string;
  expandLabel?: string;
  className?: string;
  style?: CSSProperties;
};

function getTextValue(item: AppSidebarNavItem): string | undefined {
  if (item.textValue) return item.textValue;
  return typeof item.label === "string" ? item.label : undefined;
}

function defaultIsItemActive(item: AppSidebarNavItem, currentPath?: string): boolean {
  return item.active ?? currentPath === item.href;
}

export function AppSidebar({
  title,
  subtitle,
  groups,
  currentPath,
  isItemActive = defaultIsItemActive,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  onItemSelect,
  renderLink,
  navigationLabel = "주요 메뉴",
  collapseLabel = "사이드바 접기",
  expandLabel = "사이드바 펼치기",
  className,
  style
}: AppSidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? internalCollapsed;

  const toggle = () => {
    const next = !isCollapsed;
    setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  return (
    <aside
      className={cx("pds", "pds-app-sidebar", isCollapsed && "is-collapsed", className)}
      style={style}
    >
      <header className="pds-app-sidebar__header">
        {!isCollapsed ? (
          <div className="pds-app-sidebar__identity">
            <div className="pds-app-sidebar__title">{title}</div>
            {subtitle ? <div className="pds-app-sidebar__subtitle">{subtitle}</div> : null}
          </div>
        ) : null}
        <button
          type="button"
          className="pds-app-sidebar__toggle"
          onClick={toggle}
          aria-label={isCollapsed ? expandLabel : collapseLabel}
          title={isCollapsed ? expandLabel : collapseLabel}
          aria-expanded={!isCollapsed}
        >
          <ChevronDoubleIcon direction={isCollapsed ? "right" : "left"} size={15} />
        </button>
      </header>

      <nav className="pds-app-sidebar__nav" aria-label={navigationLabel}>
        {groups.map((group, groupIndex) => (
          <section className="pds-app-sidebar__group" key={group.id ?? groupIndex}>
            {!isCollapsed ? (
              <header className="pds-app-sidebar__group-header">
                <div className="pds-app-sidebar__group-title">{group.title}</div>
                {group.description ? (
                  <div className="pds-app-sidebar__group-description">{group.description}</div>
                ) : null}
              </header>
            ) : null}
            <ul className="pds-app-sidebar__items">
              {group.items.map((item, itemIndex) => {
                const active = isItemActive(item, currentPath);
                const textValue = getTextValue(item);
                const linkClassName = cx("pds-app-sidebar__link", active && "is-active");
                const target = item.external ? "_blank" as const : undefined;
                const rel = item.external ? "noopener noreferrer" as const : undefined;
                const handleClick = (_event: MouseEvent<HTMLElement>) => onItemSelect?.(item);
                const content = (
                  <>
                    {item.icon ? <span className="pds-app-sidebar__item-icon">{item.icon}</span> : null}
                    {!isCollapsed ? (
                      <>
                        <span className="pds-app-sidebar__item-label">{item.label}</span>
                        {item.external ? (
                          <ExternalLinkIcon className="pds-app-sidebar__external-icon" size={13} />
                        ) : null}
                      </>
                    ) : null}
                  </>
                );
                const linkProps: AppSidebarRenderLinkProps = {
                  item,
                  active,
                  collapsed: isCollapsed,
                  className: linkClassName,
                  children: content,
                  title: isCollapsed ? textValue : undefined,
                  ariaLabel: isCollapsed ? textValue : undefined,
                  target,
                  rel,
                  ariaCurrent: active ? "page" : undefined,
                  onClick: handleClick
                };

                return (
                  <li className={cx("pds-app-sidebar__item", item.separated && "is-separated")} key={item.id ?? item.href ?? itemIndex}>
                    {item.separated ? <span className="pds-app-sidebar__separator" aria-hidden="true" /> : null}
                    {renderLink ? renderLink(linkProps) : (
                      <a
                        href={item.href}
                        className={linkClassName}
                        title={linkProps.title}
                        aria-label={linkProps.ariaLabel}
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
        ))}
      </nav>
    </aside>
  );
}
