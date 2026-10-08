'use client';

import { useState } from 'react';
import { DetailSection } from '@/components/erp/detail-section';
import { GanttChart, type GanttGroup } from '@/components/erp/gantt-chart';
import { scheduleWindow } from '@/lib/task-schedule';

const samples: GanttGroup[] = [{ id: 'sample', title: '예시 프로젝트', tasks: [
  { id: 'sample-plan', title: '요구사항 정리', startDate: '2026-10-05', endDate: '2026-10-07', done: true },
  { id: 'sample-build', title: '기능 구현', startDate: '2026-10-08', endDate: '2026-10-16', done: false },
] }];

export function GanttSection() {
  const [groups, setGroups] = useState(samples);
  const [notice, setNotice] = useState('');
  return <DetailSection title="프로젝트 일정 간트차트">
    <div className="space-y-3 p-4">
      <p className="text-xs text-[var(--bi-muted)]">프로젝트를 펼쳐 기간과 완료 상태를 확인합니다. 예시 조작은 이 화면에서만 반영되며 저장하지 않습니다.</p>
      <GanttChart groups={groups} window={scheduleWindow('2026-10-08', 'month')} today="2026-10-08"
        onEdit={id => setNotice(`${groups[0].tasks.find(task => task.id === id)?.title} 일정 수정 선택`)}
        onToggleDone={id => setGroups(current => current.map(group => ({ ...group, tasks: group.tasks.map(task => task.id === id ? { ...task, done: !task.done } : task) })))} />
      {notice && <p role="status" className="text-xs">{notice}</p>}
    </div>
  </DetailSection>;
}
