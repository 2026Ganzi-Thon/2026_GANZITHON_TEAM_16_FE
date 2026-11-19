import { useEffect, useId, useRef, useState } from 'react';
import { diaryApi, todaySeoul, type Diary, type EmotionType, type MonthlyRecap as Recap } from '../features/diary/api';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '회고를 불러오지 못했어요. 다시 시도해 주세요.';
const safeColor = (color?: string | null) => color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#b8d5cb';
const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;

type OpenDiary = (id: string, date: string) => void;

function RecapDialog({ month, onMonth, cache, diaryCache, onOpenDiary, onClose }: { month: string; onMonth: (month: string) => void; cache: Map<string, Recap>; diaryCache: Map<string, Diary[]>; onOpenDiary: OpenDiary; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [types, setTypes] = useState<EmotionType[]>([]);
  const [typeError, setTypeError] = useState('');
  const [typeRevision, setTypeRevision] = useState(0);
  const [typesLoading, setTypesLoading] = useState(true);
  const [expanded, setExpanded] = useState<{ month: string; id: string } | null>(null);
  const [diaries, setDiaries] = useState<{ month: string; items: Diary[] } | null>(null);
  const [diariesLoading, setDiariesLoading] = useState(false);
  const [diariesError, setDiariesError] = useState('');
  const [diariesRevision, setDiariesRevision] = useState(0);
  const panelPrefix = useId();
  const expandedId = expanded?.month === month ? expanded.id : null;
  const needsDiaries = expandedId !== null;
  useEffect(() => { setExpanded(null); }, [month]);
  useEffect(() => {
    if (!needsDiaries) return;
    const abort = new AbortController();
    setDiariesError('');
    const cached = diaryCache.get(month);
    if (cached) { setDiaries({ month, items: cached }); setDiariesLoading(false); return () => abort.abort(); }
    setDiaries(null); setDiariesLoading(true);
    const [year, index] = month.split('-').map(Number);
    const lastDay = new Date(year, index, 0).getDate();
    (async () => {
      const items = new Map<string, Diary>();
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        if (abort.signal.aborted) return;
        const page = await diaryApi.list({ from: `${month}-01`, to: `${month}-${lastDay}`, limit: 100, cursor }, abort.signal);
        if (abort.signal.aborted) return;
        page.items.forEach(diary => {
          if (diary.savedAt && diary.emotionConfirmedAt && diary.entryDate.startsWith(`${month}-`)) items.set(diary.id, diary);
        });
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor)) throw new Error('일기 목록을 끝까지 불러오지 못했어요. 다시 시도해 주세요.');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      const result = [...items.values()].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.id.localeCompare(a.id));
      diaryCache.set(month, result); setDiaries({ month, items: result });
    })().catch(reason => { if (!abort.signal.aborted) setDiariesError(errorMessage(reason)); })
      .finally(() => { if (!abort.signal.aborted) setDiariesLoading(false); });
    return () => abort.abort();
  }, [month, needsDiaries, diariesRevision, diaryCache]);
  const latest = todaySeoul().slice(0, 7);
  useEffect(() => {
    const node = dialog.current!; node.showModal();
    return () => node.close();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setTypesLoading(true); setTypeError('');
    diaryApi.emotionTypes(abort.signal).then(result => { if (!abort.signal.aborted) setTypes(result.items); })
      .catch(reason => { if (!abort.signal.aborted) setTypeError(errorMessage(reason)); })
      .finally(() => { if (!abort.signal.aborted) setTypesLoading(false); });
    return () => abort.abort();
  }, [typeRevision]);
  useEffect(() => {
    const abort = new AbortController();
    setRecap(null); setError('');
    const cached = cache.get(month);
    if (cached) { setRecap(cached); setLoading(false); return () => abort.abort(); }
    setLoading(true);
    // Defer one microtask so StrictMode's initial cleanup can cancel before an AI request.
    Promise.resolve().then(() => abort.signal.aborted ? undefined : diaryApi.recap(month, abort.signal)).then(result => {
      if (abort.signal.aborted || !result) return;
      if (result.month !== month) throw new Error('요청한 월의 회고를 확인하지 못했어요. 다시 시도해 주세요.');
      cache.set(month, result); setRecap(result);
    }).catch(reason => { if (!abort.signal.aborted) setError(errorMessage(reason)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [month, revision, cache]);
  function move(delta: number) {
    const [year, index] = month.split('-').map(Number);
    const next = new Date(year, index - 1 + delta, 1);
    onMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }
  const currentRecap = recap?.month === month ? recap : null;
  const counts = [...(currentRecap?.emotionCounts ?? [])].sort((a, b) => b.count - a.count);
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  return <dialog ref={dialog} className="monthly-recap-dialog" aria-labelledby="recap-heading" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="recap-rings" aria-hidden="true"><i /><i /><i /><i /></div>
    <header><div><p className="recap-eyebrow">한 달의 마음을 돌아봐요</p><h2 id="recap-heading">월간 마음 회고</h2></div><button type="button" aria-label="월간 회고 닫기" onClick={onClose}>×</button></header>
    <div className="recap-month-nav">
      <button type="button" aria-label="회고 이전 달" disabled={month <= '1000-01'} onClick={() => move(-1)}>‹</button>
      <label><span className="recap-month-label">회고할 월</span><input type="month" aria-label="회고할 월" min="1000-01" max={latest} value={month} onChange={event => {
        const value = event.target.value;
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= '1000-01' && value <= latest) onMonth(value);
      }} /></label>
      <button type="button" aria-label="회고 다음 달" disabled={month >= latest} onClick={() => move(1)}>›</button>
    </div>
    <p className="recap-description">저장한 일기를 바탕으로 한 달의 마음을 정리했어요. AI 회고는 나의 기록을 돌아보기 위한 참고예요.</p>
    <div className="recap-result" aria-busy={loading}>
      {loading && <p className="recap-loading" role="status">{monthLabel(month)}의 마음을 정리하고 있어요…</p>}
      {error && <div className="recap-error" role="alert"><p>{error}</p><p>회고를 불러오지 못했어요. 기록이 없다는 뜻은 아니에요.</p><button type="button" onClick={() => setRevision(value => value + 1)}>회고 다시 불러오기</button></div>}
      {!loading && currentRecap && <>
        <section aria-labelledby="recap-emotions-heading"><h3 id="recap-emotions-heading">이달에 기록한 감정</h3>
          <p className="recap-description">확정한 감정의 선택 횟수예요. 한 일기에 여러 감정을 고를 수 있어 일기 수와 다를 수 있어요.</p>
          {typesLoading && <p role="status" className="recap-description">감정 이름을 불러오는 중이에요.</p>}
          {typeError && <p className="recap-description" role="alert">감정 이름을 불러오지 못했어요. <button type="button" onClick={() => setTypeRevision(value => value + 1)}>감정 이름 다시 불러오기</button></p>}
          {!counts.length ? <p className="recap-empty">아직 확정한 감정이 없어요.</p> : <ul className="recap-emotions">{counts.map(entry => {
            const type = types.find(value => value.id === entry.emotionTypeId);
            const isExpanded = expandedId === entry.emotionTypeId;
            const emotionName = type?.name ?? '등록 정보가 없는 감정';
            const buttonId = `${panelPrefix}-${entry.emotionTypeId}-button`;
            const panelId = `${panelPrefix}-${entry.emotionTypeId}-diaries`;
            const matching = diaries?.month === month ? diaries.items.filter(diary => diary.emotions.some(emotion => emotion.id === entry.emotionTypeId)) : [];
            return <li key={entry.emotionTypeId}>
              <button type="button" id={buttonId} className="recap-emotion-toggle" aria-label={`${emotionName} 일기 목록`} aria-expanded={isExpanded} aria-controls={panelId}
                onClick={() => setExpanded(isExpanded ? null : { month, id: entry.emotionTypeId })}>
                <span className="recap-emotion-heading"><span className="emotion-dot" style={{ background: safeColor(type?.colorHex) }} /><span>{emotionName}</span><strong>{entry.count}회</strong><svg className="recap-emotion-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <span className="recap-bar" aria-hidden="true"><span style={{ width: `${total ? entry.count / total * 100 : 0}%`, background: safeColor(type?.colorHex) }} /></span>
              </button>
              {isExpanded && <div id={panelId} role="region" aria-labelledby={buttonId} className="recap-emotion-diaries" aria-busy={diariesLoading}>
                {diariesLoading && <p role="status">일기를 불러오고 있어요…</p>}
                {diariesError && <p role="alert">{diariesError}<button type="button" onClick={() => setDiariesRevision(value => value + 1)}>일기 목록 다시 불러오기</button></p>}
                {!diariesLoading && !diariesError && (matching.length ? <ul>{matching.map(diary => <li key={diary.id}><button type="button" aria-label={`${diary.entryDate} 일기 열기`} onClick={() => { onClose(); onOpenDiary(diary.id, diary.entryDate); }}><time dateTime={diary.entryDate}>{diary.entryDate}</time><span aria-hidden="true">›</span></button></li>)}</ul> : <p>해당 감정으로 확정한 일기가 없어요.</p>)}
              </div>}
            </li>;
          })}</ul>}
        </section>
        <section className="recap-summary" aria-labelledby="recap-summary-heading"><h3 id="recap-summary-heading">{monthLabel(month)}의 마음 이야기</h3>
          {currentRecap.concernSummary ? <p className="recap-summary-text">{currentRecap.concernSummary}</p> : <p className="recap-empty">이달에는 저장한 일기가 없어 회고가 없어요.<br />일기를 남기면 한 달의 마음을 돌아볼 수 있어요.</p>}
        </section>
      </>}
    </div>
    <footer><button type="button" className="recap-done" onClick={onClose}>캘린더로 돌아가기</button></footer>
  </dialog>;
}

export default function MonthlyRecap({ month, onMonth, onOpenDiary }: { month: string; onMonth: (month: string) => void; onOpenDiary: OpenDiary }) {
  const [open, setOpen] = useState(false);
  // Lifetime is the current calendar visit. Returning after an edit fetches fresh data.
  const cache = useRef(new Map<string, Recap>());
  const diaryCache = useRef(new Map<string, Diary[]>());
  useEffect(() => {
    const reset = () => { cache.current.clear(); diaryCache.current.clear(); setOpen(false); };
    window.addEventListener('mowoo:auth-change', reset);
    return () => window.removeEventListener('mowoo:auth-change', reset);
  }, []);
  return <>
    <button type="button" className="monthly-recap-entry" onClick={() => setOpen(true)}><span><strong>{Number(month.slice(5))}월 마음 회고</strong><small>이달의 감정과 마음 이야기 돌아보기</small></span><span aria-hidden="true">›</span></button>
    {open && <RecapDialog month={month} onMonth={onMonth} cache={cache.current} diaryCache={diaryCache.current} onOpenDiary={onOpenDiary} onClose={() => setOpen(false)} />}
  </>;
}
