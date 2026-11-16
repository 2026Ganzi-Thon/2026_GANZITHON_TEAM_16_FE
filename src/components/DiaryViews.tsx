// Live (logged-in) diary layers drawn over the Figma screens: the diary list,
// the mind calendar and the delete-selection list. Each loads its own data.
import { useEffect, useState } from 'react';
import { diaryApi, diaryDateLabel, todaySeoul, type CalendarDay, type Diary } from '../features/diary/api';

const primaryColor = (diary: Diary) => diary.emotionConfirmedAt ? diary.emotions.find(e => e.isPrimary)?.colorHex ?? '#c7d4cf' : '#c7d4cf';
const errorText = (error: unknown) => (error instanceof Error && error.message) || '기록을 불러오지 못했어요.';

function Blob({ color }: { color: string }) {
  return <svg className="diary-blob" viewBox="0 0 20 20" aria-hidden="true"><path fill={color} d="M10 1.2c1.4 0 2.6.7 3.3 1.8 1.3-.2 2.6.2 3.5 1.1s1.3 2.2 1.1 3.5c1.1.7 1.8 1.9 1.8 3.3s-.7 2.6-1.8 3.3c.2 1.3-.2 2.6-1.1 3.5s-2.2 1.3-3.5 1.1c-.7 1.1-1.9 1.8-3.3 1.8s-2.6-.7-3.3-1.8c-1.3.2-2.6-.2-3.5-1.1S1.8 14.5 2 13.2C.9 12.6.2 11.4.2 10s.7-2.6 1.8-3.3C1.8 5.4 2.2 4.1 3.1 3.2S5.3 1.9 6.6 2.1C7.3 1.9 8.6 1.2 10 1.2z" /></svg>;
}

export function DiaryCard({ diary, onOpen }: { diary: Diary; onOpen: (id: string) => void }) {
  return <button type="button" className="diary-card" onClick={() => onOpen(diary.id)}>
    <span className="diary-card-date"><Blob color={primaryColor(diary)} />{diaryDateLabel(diary.entryDate)}</span>
    <span className="diary-card-title">{diary.title}</span>
    <span className="diary-card-preview">{diary.content}</span>
  </button>;
}

/** Saved diaries, newest first, with "더 보기" paging. */
export function LiveDiaryList({ top, from, to, onOpen }: { top: number; from?: string; to?: string; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<Diary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  async function load(cursor: string | null) {
    setState('loading');
    try {
      const page = await diaryApi.list({ from, to, cursor });
      setItems(current => { const seen = new Set(current.map(d => d.id)); return [...current, ...page.items.filter(d => !seen.has(d.id))]; });
      setNext(page.nextCursor); setState('ready');
    } catch (reason) { setError(errorText(reason)); setState('error'); }
  }
  useEffect(() => { void load(null); }, []); // first page once
  return <div className="diary-live-list" style={{ top }}>
    {items.map(diary => <DiaryCard key={diary.id} diary={diary} onOpen={onOpen} />)}
    {state === 'ready' && items.length === 0 && <p className="diary-empty">{from ? '이 기간에 저장한 일기가 없어요.' : <>아직 저장한 일기가 없어요.<br />오늘의 마음을 기록해 보세요.</>}</p>}
    {state === 'error' && <p className="diary-empty" role="alert">{error} <button type="button" className="diary-link" onClick={() => void load(next)}>다시 시도</button></p>}
    {next && state !== 'loading' && <button type="button" className="diary-more" onClick={() => void load(next)}>더 보기</button>}
    {state === 'loading' && <p className="diary-empty" role="status">불러오는 중…</p>}
  </div>;
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekdayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const pad = (n: number) => String(n).padStart(2, '0');

type MonthLoader = (from: string, to: string, month: string) => Promise<{ diaries: Diary[]; days: CalendarDay[] }>;
// Server data: the diary list gives every saved day; the calendar API adds the confirmed mood color.
const loadFromServer: MonthLoader = async (from, to, month) => {
  const [page, calendar] = await Promise.all([
    diaryApi.list({ from, to, limit: 100 }),
    diaryApi.calendar(month).catch(() => ({ month, days: [] as CalendarDay[] })),
  ]);
  return { diaries: page.items, days: calendar.days };
};

/** Logged-out preview: sample diaries on the 1st, 5th and 6th of every month (as drawn in the design). */
/** Sunday..Saturday (Seoul dates) of the week containing today. */
export function thisWeek(): string[] {
  const [y, m, d] = todaySeoul().split('-').map(Number);
  const sunday = new Date(y, m - 1, d - new Date(y, m - 1, d).getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  });
}

/**
 * Logged-out preview samples: the 1st, 5th and 6th of every month (as drawn in the design)
 * plus the first days of this week, so the calendar and the weekly views both have content.
 */
export function previewDiaries(from: string, to: string): Diary[] {
  const monthly: [number, string, string, string][] = [
    [1, '#f7dc7c', '새 달의 시작', '새로운 달이 시작됐다. 이번 달에는 조금 더 나를 챙기고 싶다.'],
    [5, '#7aa8f5', '면접을 앞둔 날', '낮에는 괜찮은 척했는데, 저녁이 되니 마음이 자꾸 가라앉는다.'],
    [6, '#7ce3a1', '조금 가벼워진 날', '모우와 이야기하고 나니 걱정이 한결 정리됐다.'],
  ];
  const weekly: [string, string, string][] = [
    ['#7ce3a1', '귀가하다 타코야키 트럭을 만난 날', '별거 아닌데 기분이 좋아졌다.'],
    ['#7aa8f5', '친구와 오래 통화한 날', '서로 바빠서 못 했던 이야기를 실컷 나눴다.'],
    ['#f29b9b', '마감에 쫓긴 날', '하루 종일 정신없었지만 끝내고 나니 후련하다.'],
  ];
  const today = todaySeoul();
  const byDate = new Map<string, [string, string, string]>();
  const months = new Set([from.slice(0, 7), to.slice(0, 7)]);
  months.forEach(month => monthly.forEach(([day, color, title, content]) => byDate.set(`${month}-${pad(day)}`, [color, title, content])));
  thisWeek().slice(0, 3).forEach((date, i) => byDate.set(date, weekly[i]));
  return [...byDate.entries()]
    .filter(([date]) => date >= from && date <= to && date <= today)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, [color, title, content]]) => ({
      id: `preview-${date}`, sourceSessionId: null, entryDate: date, title, content, savedAt: date, emotionConfirmedAt: date,
      emotions: [{ id: color, code: '', name: '', colorHex: color, iconUrl: null, isPrimary: true }], attachments: [],
    }));
}

/** This week's diaries: server data when logged in, preview samples otherwise. */
export function useWeekDiaries(enabled: boolean, live: boolean) {
  const days = thisWeek();
  const [diaries, setDiaries] = useState<Diary[]>(() => (live ? [] : previewDiaries(days[0], days[6])));
  useEffect(() => {
    if (!enabled) return;
    if (!live) { setDiaries(previewDiaries(days[0], days[6])); return; }
    let active = true;
    diaryApi.list({ from: days[0], to: days[6], limit: 50 }).then(page => { if (active) setDiaries(page.items); }).catch(() => { if (active) setDiaries([]); });
    return () => { active = false; };
  }, [enabled, live, days[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDate = new Map<string, Diary>();
  [...diaries].sort((a, b) => a.entryDate.localeCompare(b.entryDate)).forEach(d => { if (!byDate.has(d.entryDate)) byDate.set(d.entryDate, d); });
  return { days, byDate };
}

/** One row of this week's dates (Sun..Sat) with a mood blob on days that have a diary. */
export function WeekRow({ top, left, days, byDate, onOpen, onEmpty }: { top: number; left: number; days: string[]; byDate: Map<string, Diary>; onOpen: (diary: Diary) => void; onEmpty: (date: string) => void }) {
  const today = todaySeoul();
  return <div className="week-row" style={{ top, left }}>
    {days.map(date => {
      const diary = byDate.get(date), day = Number(date.slice(8));
      return <button key={date} type="button" className={`week-day${diary ? ' has-diary' : ''}${date === today ? ' is-today' : ''}`}
        aria-label={`${Number(date.slice(5, 7))}월 ${day}일${diary ? ' 기록 보기' : ''}`}
        onClick={() => diary ? onOpen(diary) : onEmpty(date)}>
        {diary && <Blob color={primaryColor(diary)} />}<span>{day}</span>
      </button>;
    })}
  </div>;
}

/** Home "이번주 기록": up to four of this week's diaries, oldest first, like the design. */
export function WeekList({ top, left, byDate, onOpen }: { top: number; left: number; byDate: Map<string, Diary>; onOpen: (diary: Diary) => void }) {
  const entries = [...byDate.values()].slice(0, 4);
  return <div className="week-list" style={{ top, left }}>
    {entries.length === 0 && <p className="week-empty">이번 주에 남긴 기록이 아직 없어요.</p>}
    {entries.map(diary => <button key={diary.id} type="button" className="week-item" onClick={() => onOpen(diary)}>
      <span className="week-item-day"><Blob color={primaryColor(diary)} /><span>{Number(diary.entryDate.slice(8))}</span></span>
      <span className="week-item-text">{diary.title}</span>
    </button>)}
  </div>;
}

/** Mind calendar month grid + that month's diaries. Days with a diary show a mood blob. */
export function LiveCalendar({ onOpen, onNotice, load = loadFromServer, preview = false }: { onOpen: (id: string, date: string) => void; onNotice: (text: string) => void; load?: MonthLoader; preview?: boolean }) {
  const [y0, m0] = todaySeoul().split('-').map(Number);
  // Remember the viewed month while the tab is open, so "back" from a diary returns to it.
  const [view, setView] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem('mowoo.calendarMonth') ?? 'null'); if (saved?.year && saved?.month) return saved as { year: number; month: number }; } catch { /* ignore */ }
    return { year: y0, month: m0 };
  });
  useEffect(() => { try { sessionStorage.setItem('mowoo.calendarMonth', JSON.stringify(view)); } catch { /* ignore */ } }, [view]);
  const [loaded, setDiaries] = useState<Diary[]>([]);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loadState, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const monthKey = `${view.year}-${pad(view.month)}`;
  const last = new Date(view.year, view.month, 0).getDate();
  // Preview data is drawn in the first frame so scroll restoration on "back" has its full height.
  const diaries = preview ? previewDiaries(`${monthKey}-01`, `${monthKey}-${pad(last)}`) : loaded;
  const state = preview ? 'ready' : loadState;

  useEffect(() => {
    if (preview) return;
    let active = true;
    setState('loading');
    load(`${monthKey}-01`, `${monthKey}-${pad(last)}`, monthKey).then(result => {
      if (!active) return;
      setDiaries(result.diaries); setDays(result.days); setState('ready');
    }).catch(reason => { if (active) { setError(errorText(reason)); setState('error'); } });
    return () => { active = false; };
  }, [monthKey, last, load, preview]);

  const byDate = new Map<string, Diary[]>();
  diaries.forEach(d => byDate.set(d.entryDate, [...(byDate.get(d.entryDate) ?? []), d]));
  const moodByDate = new Map(days.map(d => [d.date, d.primaryEmotion?.colorHex ?? null]));
  const first = new Date(view.year, view.month - 1, 1).getDay();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  const move = (delta: number) => setView(({ year, month }) => { const d = new Date(year, month - 1 + delta, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });
  const isFutureMonth = view.year > y0 || (view.year === y0 && view.month >= m0);

  return <>
    <section className="live-calendar" aria-label={`${view.year}년 ${view.month}월 마음 캘린더`}>
      <div className="live-calendar-head">
        <strong>{monthNames[view.month - 1]} {view.year}</strong>
        <span>
          <button type="button" aria-label="이전 달" onClick={() => move(-1)}>‹</button>
          <button type="button" aria-label="다음 달" disabled={isFutureMonth} onClick={() => move(1)}>›</button>
        </span>
      </div>
      <div className="live-calendar-grid">
        {weekdayLabels.map((w, i) => <span key={w} className={`live-calendar-weekday${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}>{w}</span>)}
        {cells.map((day, i) => {
          if (day === null) return <span key={`b${i}`} />;
          const date = `${monthKey}-${pad(day)}`;
          const entries = byDate.get(date) ?? [];
          const color = moodByDate.get(date) ?? (entries[0] ? primaryColor(entries[0]) : null);
          return <button key={date} type="button" className={`live-calendar-day${entries.length ? ' has-diary' : ''}`}
            aria-label={`${view.month}월 ${day}일${entries.length ? ' 기록 보기' : ''}`}
            onClick={() => entries.length ? onOpen(entries[0].id, date) : onNotice(`${view.month}월 ${day}일에는 남긴 기록이 없어요.`)}>
            {color && <Blob color={color} />}<span>{day}</span>
          </button>;
        })}
      </div>
    </section>
    <div className={`diary-live-list live-calendar-list${preview ? ' is-preview' : ''}`}>
      <h2 className="live-calendar-title">{view.month}월 기록</h2>
      {state === 'loading' && <p className="diary-empty" role="status">불러오는 중…</p>}
      {state === 'error' && <p className="diary-empty" role="alert">{error}</p>}
      {state === 'ready' && diaries.length === 0 && <p className="diary-empty">이 달에는 저장한 일기가 없어요.</p>}
      {[...diaries].reverse().map(diary => <DiaryCard key={diary.id} diary={diary} onOpen={id => onOpen(id, diary.entryDate)} />)}
    </div>
  </>;
}

/** Diaries with checkboxes for "기록 선택 삭제". */
export function LiveDeleteList({ selected, onToggle }: { selected: Set<string>; onToggle: (id: string) => void }) {
  const [items, setItems] = useState<Diary[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { diaryApi.list({ limit: 100 }).then(page => setItems(page.items)).catch(reason => setError(errorText(reason))); }, []);
  return <div className="delete-live-list" role="group" aria-label="삭제할 기록">
    {error && <p className="diary-empty" role="alert">{error}</p>}
    {items === null && !error && <p className="diary-empty" role="status">불러오는 중…</p>}
    {items?.length === 0 && <p className="diary-empty">삭제할 일기가 없어요.</p>}
    {items?.map(diary => {
      const checked = selected.has(diary.id);
      return <label key={diary.id} className={`delete-live-card${checked ? ' is-checked' : ''}`}>
        <input type="checkbox" checked={checked} onChange={() => onToggle(diary.id)} />
        <span className="diary-card-date">{diaryDateLabel(diary.entryDate)}</span>
        <span className="diary-card-title">{diary.title}</span>
        <span className="diary-card-preview">{diary.content}</span>
        <img className="delete-live-check" src={checked ? '/assets/5c577.svg' : '/assets/5f4ae.svg'} alt="" />
      </label>;
    })}
  </div>;
}
