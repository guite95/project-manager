"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Dropdown } from "@/components/erp/dropdown";
import { useSharedPreferences } from "@/components/erp/use-shared-preferences";
import { personalProjectGroup, personalProjectGroups } from "@/lib/personal-projects";

const GroupsContext = createContext<ReturnType<typeof useSharedPreferences> | null>(null);

export function PersonalProjectGroupsProvider({ children }: { children: ReactNode }) {
  const preferences = useSharedPreferences("personal-project-groups");
  return <GroupsContext.Provider value={preferences}>
    {children}
    {preferences.error ? <p role="alert" className="fixed right-3 bottom-14 z-[60] rounded border border-[var(--bi-error)] bg-[var(--bi-card-bg)] px-3 py-2 text-[12px] text-[var(--bi-error)]">{preferences.error}</p> : null}
    <span role="status" className="sr-only">{preferences.saving ? "프로젝트 분류를 저장하는 중입니다." : ""}</span>
  </GroupsContext.Provider>;
}

export function usePersonalProjectGroups() {
  const context = useContext(GroupsContext);
  if (!context) throw new Error("PersonalProjectGroupsProvider가 필요합니다.");
  return context;
}

export function ProjectGroupSelect({ slug, title }: { slug: string; title: string }) {
  const preferences = usePersonalProjectGroups();
  return <Dropdown
    ariaLabel={`${title} 분류 변경`}
    value={personalProjectGroup(slug, preferences.values) ?? ""}
    options={personalProjectGroups.map(group => ({ value: group.id, label: group.title }))}
    disabled={!preferences.ready || preferences.saving}
    onChange={value => preferences.update({ [slug]: value })}
  />;
}
