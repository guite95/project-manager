"use client";

import { HiOutlineChevronDoubleLeft, HiOutlineChevronDoubleRight } from "react-icons/hi";
import { Button } from "./button";

export function SidebarPanelToggle({ collapsed, panelId, onClick, disabled, label = "사이드바" }: {
  collapsed: boolean;
  panelId: string;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const action = `${label} ${collapsed ? "펼치기" : "접기"}`;
  return <Button variant="subtle" size="icon-sm" onClick={onClick} disabled={disabled}
    aria-label={action} title={action} aria-controls={panelId} aria-expanded={!collapsed}>
    {collapsed ? <HiOutlineChevronDoubleRight size={16} aria-hidden /> : <HiOutlineChevronDoubleLeft size={16} aria-hidden />}
  </Button>;
}
