'use client';

import { useState } from 'react';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { ganttBar, type GanttWindow } from '../../lib/task-schedule';

export type GanttTask = { id: string; title: string; done: boolean; startDate: string; endDate: string };
export type GanttGroup = { id: string; title: string; tasks: GanttTask[] };
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export function GanttChart({ groups, window, today, onEdit, onToggleDone, busy = false }: {
  groups: GanttGroup[];
  window: GanttWindow;
  today: string;
  onEdit: (id: string) => void;
  onToggleDone: (id: string) => void;
  busy?: boolean;
}) {
  // 프로젝트 펼침은 저장하지 않고, 매번 모두 접힌 상태에서 하나만 연다.
  const [expanded, setExpanded] = useState<string | null>(null);
  const columns = { gridTemplateColumns: 'var(--gantt-label-width) minmax(0, 1fr)' };
  const labelClass = 'sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-b border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3';
  const background = <>
    {window.days.map((day, index) => (weekday(day) === 0 || weekday(day) === 6 || day === today) && <span key={day} aria-hidden
      className={`pointer-events-none absolute inset-y-0 ${day === today ? 'border-x border-[var(--bi-accent)]/25 bg-[var(--bi-accent-light)]' : 'bg-[var(--bi-surface-subtle)]'}`}
      style={{ left: `${index / window.days.length * 100}%`, width: `${100 / window.days.length}%` }} />)}
  </>;
  const timelineStyle = {
    backgroundImage: 'linear-gradient(to right, var(--bi-border) 1px, transparent 1px)',
    backgroundSize: `${100 / window.days.length}% 100%`,
  };

  return <div className="max-h-[65vh] overflow-auto rounded-[var(--bi-radius-panel)] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] [--gantt-label-width:180px] sm:[--gantt-label-width:280px]"
    tabIndex={0} aria-label="프로젝트 일정 간트차트. 가로로 스크롤할 수 있습니다.">
    <div role="table" aria-label={`${window.start}부터 ${window.end}까지 프로젝트 일정`} style={{ minWidth: `calc(var(--gantt-label-width) + ${window.days.length * (window.days.length === 7 ? 72 : 32)}px)` }}>
      <div role="row" className="sticky top-0 z-20 grid bg-[var(--bi-table-header)]" style={columns}>
        <div role="columnheader" className={`${labelClass} min-h-14 font-semibold`}>프로젝트 / 할 일</div>
        <div role="columnheader" aria-label={`${window.start} ~ ${window.end}`} className="grid border-b border-[var(--bi-border)]" style={{ gridTemplateColumns: `repeat(${window.days.length}, minmax(0, 1fr))` }}>
          {window.days.map(day => <div key={day} className={`flex flex-col items-center justify-center border-l border-[var(--bi-border)] py-2 text-xs ${day === today ? 'bg-[var(--bi-accent)] text-white' : weekday(day) === 0 || weekday(day) === 6 ? 'text-[var(--bi-muted)]' : ''}`}>
            <span>{Number(day.slice(8)) === 1 ? shortDate(day) : Number(day.slice(8))}</span><span className="mt-1 text-[10px]">{'일월화수목금토'[weekday(day)]}</span>
          </div>)}
        </div>
      </div>
      {groups.map(group => {
        const open = expanded === group.id;
        const startDate = group.tasks.map(task => task.startDate).sort()[0];
        const endDate = group.tasks.map(task => task.endDate).sort().at(-1)!;
        const summary = ganttBar({ startDate, endDate }, window);
        return <div role="rowgroup" key={group.id}>
          <div role="row" className="grid" style={columns}>
            <div role="cell" className={labelClass}>
              <Button variant="ghost" className="min-h-11 w-full min-w-0 justify-start px-0 text-left" aria-expanded={open} onClick={() => setExpanded(open ? null : group.id)}>
                <span aria-hidden>{open ? '▾' : '▸'}</span><span className="truncate">{group.title}</span>
                <span className="ml-auto shrink-0 text-xs font-normal text-[var(--bi-muted)]">{group.tasks.filter(task => task.done).length}/{group.tasks.length}</span>
              </Button>
            </div>
            <div role="cell" className="relative min-h-11 border-b border-[var(--bi-border)]" style={timelineStyle}>
              {background}
              {summary && <span role="img" aria-label={`${group.title} 전체 기간 ${startDate} ~ ${endDate}`} className="absolute top-[18px] h-2 rounded-sm bg-[var(--bi-accent)]/65" style={{ left: `${summary.left}%`, width: `${summary.width}%` }} />}
            </div>
          </div>
          {open && group.tasks.map(task => {
            const bar = ganttBar(task, window);
            const overdue = !task.done && task.endDate < today;
            const status = task.done ? '완료' : overdue ? '지연' : '미완료';
            return <div role="row" key={task.id} className="grid" style={columns}>
              <div role="cell" className={`${labelClass} pl-5`}>
                <Checkbox id={`gantt-done-${task.id}`} ariaLabel={`${task.title} 완료`} checked={task.done} disabled={busy} onChange={() => onToggleDone(task.id)} />
                <Button variant="subtle" disabled={busy} className="min-h-11 min-w-0 flex-1 justify-start px-0 text-left font-normal" aria-label={`${task.title} 일정 수정`} onClick={() => onEdit(task.id)}><span className="truncate">{task.title}</span></Button>
              </div>
              <div role="cell" className="relative min-h-11 border-b border-[var(--bi-border)]" style={timelineStyle}>
                {background}
                {bar && <Button size="sm" disabled={busy} onClick={() => onEdit(task.id)}
                  aria-label={`${task.title}, ${task.startDate}부터 ${task.endDate}까지, ${status}. 일정 수정`}
                  className="absolute top-1 min-w-0 overflow-hidden px-1 text-white"
                  style={{ left: `calc(${bar.left}% + 2px)`, width: `calc(${bar.width}% - 4px)`, backgroundColor: task.done ? 'var(--bi-success)' : overdue ? 'var(--bi-error)' : 'var(--bi-accent)' }}>
                  <span className="truncate text-[11px]">{status} {shortDate(task.startDate)}–{shortDate(task.endDate)}</span>
                </Button>}
              </div>
            </div>;
          })}
        </div>;
      })}
    </div>
  </div>;
}
