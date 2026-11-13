// Live (logged-in) diary layers drawn over the Figma screens: the diary list,
// the mind calendar and the delete-selection list. Each loads its own data.
import { useEffect, useState } from 'react';
import { diaryApi, diaryDateLabel, todaySeoul, type CalendarDay, type Diary } from '../features/diary/api';

const blobColors = ['#7aa8f5', '#7ce3a1', '#f29b9b', '#f7dc7c'];
const fallbackColor = (diary: Diary) => blobColors[parseInt(diary.id.replace(/\D/g, '').slice(-2) || '0', 10) % blobColors.length];
const primaryColor = (diary: Diary) => diary.emotions.find(e => e.isPrimary)?.colorHex ?? fallbackColor(diary);
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
export function LiveDiaryList({ top, onOpen }: { top: number; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<Diary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  async function load(cursor: string | null) {
    setState('loading');
    try {
      const page = await diaryApi.list({ cursor });
      setItems(current => { const seen = new Set(current.map(d => d.id)); return [...current, ...page.items.filter(d => !seen.has(d.id))]; });
      setNext(page.nextCursor); setState('ready');
    } catch (reason) { setError(errorText(reason)); setState('error'); }
  }
  useEffect(() => { void load(null); }, []); // first page once
  return <div className="diary-live-list" style={{ top }}>
    {items.map(diary => <DiaryCard key={diary.id} diary={diary} onOpen={onOpen} />)}
    {state === 'ready' && items.length === 0 && <p className="diary-empty">아직 저장한 일기가 없어요.<br />오늘의 마음을 기록해 보세요.</p>}
    {state === 'error' && <p className="diary-empty" role="alert">{error} <button type="button" className="diary-link" onClick={() => void load(next)}>다시 시도</button></p>}
    {next && state !== 'loading' && <button type="button" className="diary-more" onClick={() => void load(next)}>더 보기</button>}
    {state === 'loading' && <p className="diary-empty" role="status">불러오는 중…</p>}
  </div>;
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekdayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Mind calendar month grid + that month's diaries. Days with a diary show a mood blob. */
export function LiveCalendar({ onOpen, onNotice }: { onOpen: (id: string) => void; onNotice: (text: string) => void }) {
  const [y0, m0] = todaySeoul().split('-').map(Number);
  const [view, setView] = useState({ year: y0, month: m0 });
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const monthKey = `${view.year}-${pad(view.month)}`;
  const last = new Date(view.year, view.month, 0).getDate();

  useEffect(() => {
    let active = true;
    setState('loading');
    // Diary list gives every saved day; the calendar API adds the confirmed mood color.
    Promise.all([
      diaryApi.list({ from: `${monthKey}-01`, to: `${monthKey}-${pad(last)}`, limit: 100 }),
      diaryApi.calendar(monthKey).catch(() => ({ month: monthKey, days: [] as CalendarDay[] })),
    ]).then(([page, calendar]) => {
      if (!active) return;
      setDiaries(page.items); setDays(calendar.days); setState('ready');
    }).catch(reason => { if (active) { setError(errorText(reason)); setState('error'); } });
    return () => { active = false; };
  }, [monthKey, last]);

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
            onClick={() => entries.length ? onOpen(entries[0].id) : onNotice(`${view.month}월 ${day}일에는 남긴 기록이 없어요.`)}>
            {color && <Blob color={color} />}<span>{day}</span>
          </button>;
        })}
      </div>
    </section>
    <div className="diary-live-list live-calendar-list">
      <h2 className="live-calendar-title">{view.month}월 기록</h2>
      {state === 'loading' && <p className="diary-empty" role="status">불러오는 중…</p>}
      {state === 'error' && <p className="diary-empty" role="alert">{error}</p>}
      {state === 'ready' && diaries.length === 0 && <p className="diary-empty">이 달에는 저장한 일기가 없어요.</p>}
      {[...diaries].reverse().map(diary => <DiaryCard key={diary.id} diary={diary} onOpen={onOpen} />)}
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
