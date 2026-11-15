import { useEffect, useId, useRef, useState } from 'react';

interface Props {
  nodeId: string;
  className: string;
  label: string;
  /** "YYYY-MM-DD" or "" */
  value: string;
  onChange: (value: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const display = (iso: string) => (iso ? iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1. $2. $3.') : '');
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

/** Accepts 2004-02-27, 2004.02.27, 2004. 02. 27., 20040227. Returns ISO or null. */
function parse(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const y = +digits.slice(0, 4), m = +digits.slice(4, 6), d = +digits.slice(6, 8);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  if (date > new Date()) return null;
  return toIso(y, m, d);
}

/**
 * Birth date input with a rounded calendar popover in place of the browser's
 * native date picker (which can't be styled). Typing still works on desktop;
 * on phones the virtual keyboard stays closed and the calendar is used.
 */
export default function BirthDateField({ nodeId, className, label, value, onChange }: Props) {
  const today = new Date();
  const thisYear = today.getFullYear();
  const [text, setText] = useState(display(value));
  const [open, setOpen] = useState(false);
  const initial = value ? value.split('-').map(Number) : [2000, 1];
  const [view, setView] = useState({ year: initial[0], month: initial[1] });
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const popupId = useId();

  useEffect(() => { if (document.activeElement !== input.current) setText(display(value)); }, [value]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && event.target !== input.current) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); input.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  function show() {
    if (value) { const [y, m] = value.split('-').map(Number); setView({ year: y, month: m }); }
    setOpen(true);
  }
  function move(delta: number) {
    setView(({ year, month }) => {
      const next = new Date(year, month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
  }
  function pick(day: number) {
    const iso = toIso(view.year, view.month, day);
    onChange(iso); setText(display(iso)); setOpen(false);
  }

  const first = new Date(view.year, view.month - 1, 1).getDay();
  const days = new Date(view.year, view.month, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const isFuture = (day: number) => new Date(view.year, view.month - 1, day) > today;
  const atLatestMonth = view.year > thisYear || (view.year === thisYear && view.month >= today.getMonth() + 1);
  const years = Array.from({ length: thisYear - 1930 + 1 }, (_, i) => thisYear - i);

  return <>
    <input
      ref={input} data-node-id={nodeId} className={`${className} profile-input`} aria-label={label}
      type="text" inputMode="none" autoComplete="bday" placeholder="YYYY. MM. DD." maxLength={14}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
      value={text}
      onFocus={show} onClick={show}
      onChange={event => {
        const raw = event.target.value;
        setText(raw);
        if (!raw.trim()) onChange('');
        else { const iso = parse(raw); if (iso) { onChange(iso); setOpen(false); } }
      }}
      onBlur={event => {
        // Tabbing away (not into the calendar) closes it.
        if (!root.current?.contains(event.relatedTarget as Node)) setOpen(false);
        setText(current => (current.trim() && !parse(current) ? display(value) : current.trim() ? display(parse(current)!) : ''));
      }}
      onKeyDown={event => { if (event.key === 'Enter') setOpen(false); }}
    />
    {open && <div ref={root} id={popupId} className="birth-picker" role="dialog" aria-label={`${label} 선택`}>
      <div className="birth-picker-head">
        <button type="button" className="birth-picker-nav" aria-label="이전 달" onClick={() => move(-1)}>‹</button>
        <div className="birth-picker-selects">
          <select aria-label="연도" value={view.year} onChange={e => setView(v => ({ ...v, year: +e.target.value }))}>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select aria-label="월" value={view.month} onChange={e => setView(v => ({ ...v, month: +e.target.value }))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
        <button type="button" className="birth-picker-nav" aria-label="다음 달" disabled={atLatestMonth} onClick={() => move(1)}>›</button>
      </div>
      <div className="birth-picker-grid" role="grid">
        {weekdays.map((w, i) => <span key={w} className={`birth-picker-weekday${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}>{w}</span>)}
        {cells.map((day, i) => day === null ? <span key={`blank-${i}`} /> : (
          <button
            key={day} type="button"
            className={`birth-picker-day${toIso(view.year, view.month, day) === value ? ' is-selected' : ''}${i % 7 === 0 ? ' is-sun' : i % 7 === 6 ? ' is-sat' : ''}`}
            aria-pressed={toIso(view.year, view.month, day) === value}
            aria-label={`${view.year}년 ${view.month}월 ${day}일`}
            disabled={isFuture(day)}
            onClick={() => pick(day)}
          >{day}</button>
        ))}
      </div>
      <div className="birth-picker-foot">
        <button type="button" onClick={() => { onChange(''); setText(''); setOpen(false); }}>지우기</button>
        <button type="button" className="is-primary" onClick={() => setOpen(false)}>닫기</button>
      </div>
    </div>}
  </>;
}
