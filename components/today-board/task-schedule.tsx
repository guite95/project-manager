'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/erp/button';
import { DateField, SelectField, TextField, TextInput } from '@/components/erp/form-field';
import { GanttChart, type GanttGroup } from '@/components/erp/gantt-chart';
import { FormModal } from '@/components/erp/zespro';
import { fetchScheduleTasks, patchIssue, patchIssueSchedule, postIssue } from '@/lib/api-client';
import { todayInSeoul } from '@/lib/format/date-time';
import { groupIssuesByProject, type CustomProject } from '@/lib/today-board';
import { ganttBar, moveScheduleWindow, parseIssueSchedule, scheduleWindow, type GanttScale, type ScheduleTask } from '@/lib/task-schedule';

type Project = { slug: string; title: string; scope?: string; showInTasks?: boolean };
type Editor = { task: ScheduleTask | null; projectSlug: string; title: string; startDate: string; endDate: string };

export function TaskSchedule({ projects, customProjects, projectOrder, onChange }: {
  projects: Project[];
  customProjects: CustomProject[];
  projectOrder: string[];
  onChange: () => Promise<void>;
}) {
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState(() => todayInSeoul());
  const [scale, setScale] = useState<GanttScale>('month');
  const [project, setProject] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const mutating = useRef(false);
  const version = useRef(0);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const today = todayInSeoul();
  const window = useMemo(() => scheduleWindow(anchor, scale), [anchor, scale]);

  const load = useCallback(async () => {
    if (mutating.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++version.current;
    try {
      const next = await fetchScheduleTasks(controller.signal);
      if (!mounted.current || controller.signal.aborted || current !== version.current) return;
      setTasks(next); setLoadError('');
    } catch (error) {
      if (mounted.current && !controller.signal.aborted && current === version.current) setLoadError(error instanceof Error ? error.message : '일정을 불러오지 못했습니다.');
    } finally {
      if (mounted.current && current === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => { if (!document.hidden) void load(); };
    void load();
    const timer = globalThis.setInterval(refresh, 15000);
    globalThis.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      mounted.current = false; ++version.current; request.current?.abort();
      globalThis.clearInterval(timer); globalThis.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  const groups = useMemo(() => groupIssuesByProject(tasks, projects, customProjects, projectOrder), [tasks, projects, customProjects, projectOrder]);
  const taskMap = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const selectedGroups = groups.filter(group => !project || (group.slug ?? '__ungrouped__') === project);
  const matches = (task: ScheduleTask) => (!status || (status === 'done' ? task.done : !task.done)) && task.title.toLowerCase().includes(search.trim().toLowerCase());
  const visible = selectedGroups.flatMap(group => group.issues.map(issue => ({ task: taskMap.get(issue.id)!, projectTitle: group.title }))).filter(({ task }) => matches(task));
  const unscheduled = visible.filter(({ task }) => !task.schedule.startDate);
  const chartGroups: GanttGroup[] = selectedGroups.map(group => ({
    id: group.slug ?? '__ungrouped__', title: group.title,
    tasks: group.issues.map(issue => taskMap.get(issue.id)!).filter(task => matches(task) && ganttBar(task.schedule, window)).map(task => ({
      id: task.id, title: task.title, done: task.done, startDate: task.schedule.startDate!, endDate: task.schedule.endDate!,
    })),
  })).filter(group => group.tasks.length > 0);
  const projectOptions = groups.filter(group => group.canAdd && group.slug).map(group => ({ value: group.slug!, label: group.title }));

  const edit = (id: string) => {
    const task = taskMap.get(id);
    if (!task || mutating.current) return;
    setActionError('');
    setEditor({ task, projectSlug: task.projectSlug, title: task.title, startDate: task.schedule.startDate ?? '', endDate: task.schedule.endDate ?? '' });
  };

  const mutate = async (action: () => Promise<unknown>, message: string) => {
    if (mutating.current) return;
    mutating.current = true; ++version.current; request.current?.abort();
    setBusy(true); setActionError(''); setNotice('');
    try {
      await action();
      if (mounted.current) { setEditor(null); setNotice(message); }
      await onChange();
    } catch (error) {
      if (mounted.current) setActionError(error instanceof Error ? error.message : '일정을 저장하지 못했습니다.');
    } finally {
      mutating.current = false;
      if (mounted.current) { setBusy(false); await load(); }
    }
  };

  const save = () => {
    if (!editor) return;
    try {
      const schedule = parseIssueSchedule({ startDate: editor.startDate || null, endDate: editor.endDate || null, revision: editor.task?.schedule.revision ?? 0 });
      if (editor.task) {
        void mutate(() => patchIssueSchedule(editor.task!.id, schedule), '일정을 저장했습니다.');
      } else {
        if (!editor.title.trim() || !editor.projectSlug) { setActionError('프로젝트와 할 일 제목을 입력해 주세요.'); return; }
        void mutate(() => postIssue(editor.projectSlug, editor.title.trim(), schedule), '할 일을 추가했습니다. 목록과 간트에서 함께 관리할 수 있습니다.');
      }
    } catch (error) { setActionError(error instanceof Error ? error.message : '일정을 확인해 주세요.'); }
  };

  return <section className="min-w-0 space-y-4" aria-label="프로젝트별 일정 관리" aria-busy={loading || busy}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-40"><SelectField label="프로젝트" value={project} onChange={setProject} options={[{ value: '', label: '전체 프로젝트' }, ...groups.map(group => ({ value: group.slug ?? '__ungrouped__', label: group.title }))]} /></div>
      <div className="min-w-28"><SelectField label="완료 상태" value={status} onChange={setStatus} options={[{ value: '', label: '전체' }, { value: 'open', label: '미완료' }, { value: 'done', label: '완료' }]} /></div>
      <label className="grid min-w-40 flex-1 gap-1 text-xs">할 일 검색<TextInput type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="할 일 제목" /></label>
      <Button disabled={busy || !projectOptions.length} onClick={() => { setActionError(''); setEditor({ task: null, title: '', projectSlug: projectOptions.some(item => item.value === project) ? project : projectOptions[0]?.value ?? '', startDate: '', endDate: '' }); }}>할 일 추가</Button>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-label="이전 기간" onClick={() => setAnchor(value => moveScheduleWindow(value, scale, -1))}>‹</Button>
        <span className="min-w-40 text-center text-sm font-semibold">{scale === 'month' ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월` : `${window.start} ~ ${window.end}`}</span>
        <Button variant="secondary" aria-label="다음 기간" onClick={() => setAnchor(value => moveScheduleWindow(value, scale, 1))}>›</Button>
        <Button variant="ghost" onClick={() => setAnchor(today)}>오늘</Button>
      </div>
      <div className="flex items-end gap-3"><DateField label="기준일" value={anchor} onChange={value => { if (value) setAnchor(value); }} clearable={false} />
        <div className="min-w-24"><SelectField label="표시 단위" value={scale} onChange={value => setScale(value as GanttScale)} options={[{ value: 'week', label: '주' }, { value: 'month', label: '월' }]} /></div>
      </div>
    </div>
    <p className="text-xs text-[var(--bi-muted)]">프로젝트를 펼쳐 할 일을 확인하고, 기간 막대를 눌러 일정을 수정하세요. 완료한 일정도 보관됩니다. 한국 날짜 기준입니다.</p>
    {loadError && <div role="alert" className="flex items-center gap-2 text-sm text-[var(--bi-error)]">{loadError}<Button variant="secondary" onClick={() => void load()} disabled={busy}>다시 불러오기</Button></div>}
    {actionError && !editor && <p role="alert" className="text-sm text-[var(--bi-error)]">{actionError}</p>}
    {notice && <p role="status" className="text-sm text-[var(--bi-accent)]">{notice}</p>}
    {loading ? <p role="status" className="py-10 text-center text-sm text-[var(--bi-muted)]">일정을 불러오는 중…</p>
      : chartGroups.length ? <GanttChart groups={chartGroups} window={window} today={today} busy={busy} onEdit={edit} onToggleDone={id => {
        const task = taskMap.get(id);
        if (task) void mutate(() => patchIssue(id, { done: !task.done }), task.done ? '완료를 취소했습니다.' : '할 일을 완료했습니다.');
      }} />
        : !loadError && <p className="rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-4 py-10 text-center text-sm text-[var(--bi-muted)]">선택한 기간에 표시할 일정이 없습니다. 기간을 바꾸거나 아래 할 일에 일정을 지정하세요.</p>}
    <div className="flex flex-wrap gap-4 text-xs text-[var(--bi-muted)]"><span>■ 미완료</span><span className="text-[var(--bi-success)]">■ 완료</span><span className="text-[var(--bi-error)]">■ 마감일 지남</span></div>
    <section aria-labelledby="unscheduled-heading" className="rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
      <h3 id="unscheduled-heading" className="border-b border-[var(--bi-border)] px-4 py-3 text-sm font-semibold">일정 미지정 <span className="font-normal text-[var(--bi-muted)]">{unscheduled.length}건</span></h3>
      {unscheduled.length ? <ul className="max-h-72 overflow-y-auto">{unscheduled.map(({ task, projectTitle }) => <li key={task.id} className="flex items-center gap-3 border-b border-[var(--bi-border)] px-4 py-2 last:border-b-0">
        <div className="min-w-0 flex-1"><span className="text-xs text-[var(--bi-muted)]">{projectTitle}{task.done ? ' · 완료' : ''}</span><p className="truncate text-sm">{task.title}</p></div>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => edit(task.id)} aria-label={`${task.title} 일정 지정`}>일정 지정</Button>
      </li>)}</ul> : <p className="px-4 py-5 text-sm text-[var(--bi-muted)]">일정이 없는 할 일이 없습니다.</p>}
    </section>
    <FormModal open={!!editor} title={editor?.task ? '할 일 일정 수정' : '할 일 추가'} onClose={() => { if (!mutating.current) { setEditor(null); setActionError(''); } }} onSubmit={save} submitDisabled={busy} submitLabel={busy ? '저장 중…' : '저장'} closeOnBackdrop={!busy} closeOnEscape={!busy}>
      {editor && <div className="space-y-4">
        {editor.task ? <p className="break-words text-sm font-semibold">{editor.title}</p> : <>
          <SelectField label="프로젝트" value={editor.projectSlug} onChange={projectSlug => setEditor({ ...editor, projectSlug })} options={projectOptions} disabled={busy} />
          <TextField label="할 일" value={editor.title} onChange={title => setEditor({ ...editor, title })} maxLength={200} disabled={busy} />
        </>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField label="시작일" value={editor.startDate} onChange={startDate => setEditor({ ...editor, startDate })} disabled={busy} />
          <DateField label="마감일" value={editor.endDate} onChange={endDate => setEditor({ ...editor, endDate })} minDate={editor.startDate || undefined} disabled={busy} />
        </div>
        <p className="text-xs text-[var(--bi-muted)]">두 날짜를 비우면 일정 미지정으로 저장합니다. 시작일과 마감일은 모두 기간에 포함됩니다.</p>
        {editor.task?.schedule.startDate && <Button variant="ghost" disabled={busy} onClick={() => setEditor({ ...editor, startDate: '', endDate: '' })}>기간 비우기</Button>}
        {actionError && <p role="alert" className="text-sm text-[var(--bi-error)]">{actionError}</p>}
        {editor.task && taskMap.get(editor.task.id)?.schedule.revision !== editor.task.schedule.revision && <div className="text-xs text-[var(--bi-error)]">
          다른 화면에서 일정이 바뀌었습니다. 입력 중인 내용은 유지됩니다.
          <Button variant="secondary" disabled={busy} onClick={() => edit(editor.task!.id)}>최신 일정으로 다시 열기</Button>
        </div>}
      </div>}
    </FormModal>
  </section>;
}
