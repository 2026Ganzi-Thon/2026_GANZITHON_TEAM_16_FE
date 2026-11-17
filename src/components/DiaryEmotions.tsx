import { useEffect, useRef, useState } from 'react';
import { diaryApi, type Diary, type EmotionType } from '../features/diary/api';

const message = (error: unknown) => error instanceof Error ? error.message : '감정을 처리하지 못했어요. 다시 시도해 주세요.';
const color = (value?: string | null) => value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#c7d4cf';

function EmotionPicker({ diary, onClose, onConfirmed }: { diary: Diary; onClose: () => void; onConfirmed: (diary: Diary) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const [types, setTypes] = useState<EmotionType[]>([]);
  const [selected, setSelected] = useState<string[]>(diary.emotions.map(emotion => emotion.id));
  const [primary, setPrimary] = useState<string | null>(diary.emotions.find(emotion => emotion.isPrimary)?.id ?? null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'suggest' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [suggested, setSuggested] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    const abort = new AbortController(); controller.current = abort;
    return () => { abort.abort(); node.close(); };
  }, []);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError('');
    diaryApi.emotionTypes(abort.signal).then(({ items }) => {
      if (abort.signal.aborted) return;
      setTypes(items);
      setSelected(current => current.filter(id => items.some(type => type.id === id)));
      setPrimary(current => items.some(type => type.id === current) ? current : null);
    }).catch(reason => { if (!abort.signal.aborted) setError(message(reason)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [revision]);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id];
    setSelected(next); if (!primary || !next.includes(primary)) setPrimary(next[0] ?? null);
    setSuggested(false); setError('');
  }
  async function suggest() {
    if (locked.current) return;
    locked.current = true; setBusy('suggest'); setError('');
    try {
      const result = await diaryApi.suggestEmotions(diary.id, controller.current?.signal);
      if (controller.current?.signal.aborted) return;
      if (!Array.isArray(result.suggestedEmotionIds) || !result.suggestedEmotionIds.length || new Set(result.suggestedEmotionIds).size !== result.suggestedEmotionIds.length
        || !result.suggestedEmotionIds.every(id => types.some(type => type.id === id)) || !result.suggestedEmotionIds.includes(result.primaryEmotionId)) {
        throw new Error('추천 감정을 확인하지 못했어요. 직접 선택해 주세요.');
      }
      setSelected(result.suggestedEmotionIds); setPrimary(result.primaryEmotionId); setSuggested(true);
    } catch (reason) { if (!controller.current?.signal.aborted) setError(message(reason)); }
    finally { locked.current = false; if (!controller.current?.signal.aborted) setBusy(null); }
  }
  async function confirm() {
    if (locked.current || !primary || !selected.includes(primary) || !selected.length) return;
    locked.current = true; setBusy('save'); setError('');
    try {
      const saved = await diaryApi.confirmEmotions(diary.id, selected, primary, controller.current?.signal);
      if (controller.current?.signal.aborted) return;
      onConfirmed(saved); onClose();
    } catch (reason) { if (!controller.current?.signal.aborted) setError(message(reason)); }
    finally { locked.current = false; if (!controller.current?.signal.aborted) setBusy(null); }
  }
  return <dialog ref={dialog} className="emotion-dialog" aria-labelledby="emotion-heading" onCancel={event => {
    event.preventDefault(); if (!locked.current) onClose();
  }}>
    <header><h2 id="emotion-heading">오늘의 마음</h2><button type="button" aria-label="감정 선택 닫기" disabled={Boolean(busy)} onClick={onClose}>×</button></header>
    <p className="emotion-help">여러 감정을 고를 수 있어요. 대표 감정 하나가 캘린더에 표시돼요.</p>
    {loading ? <p role="status">감정을 불러오는 중이에요.</p> : !types.length ? <div><p>{error || '등록된 감정이 없어요. 관리자에게 문의해 주세요.'}</p><button type="button" onClick={() => setRevision(value => value + 1)}>다시 불러오기</button></div> : <>
      <button type="button" className="emotion-recommend" disabled={Boolean(busy)} onClick={() => void suggest()}>{busy === 'suggest' ? '감정을 추천받는 중…' : 'AI 감정 추천받기'}</button>
      <p className="emotion-help">AI 추천은 참고용이에요. 확정하기 전까지 저장되지 않아요.</p>
      <fieldset disabled={Boolean(busy)}><legend>감정 선택</legend><div className="emotion-options">{types.map(type => <label key={type.id} className={selected.includes(type.id) ? 'is-selected' : ''}>
        <input type="checkbox" checked={selected.includes(type.id)} onChange={() => toggle(type.id)} />
        <span className="emotion-dot" style={{ background: color(type.colorHex) }} />{type.name}
      </label>)}</div></fieldset>
      <fieldset disabled={Boolean(busy)}><legend>대표 감정</legend>{selected.length ? types.filter(type => selected.includes(type.id)).map(type => <label className="emotion-primary-choice" key={type.id}>
        <input type="radio" name="primary-emotion" value={type.id} checked={primary === type.id} onChange={() => setPrimary(type.id)} />{type.name}
      </label>) : <p className="emotion-help">감정을 하나 이상 선택해 주세요.</p>}</fieldset>
      {suggested && <p role="status" className="emotion-help">추천 감정을 반영했어요. 수정하거나 확정해 주세요.</p>}
      {error && <p role="alert" className="emotion-error">{error}</p>}
      <button type="button" className="emotion-confirm" disabled={Boolean(busy) || !primary || !selected.includes(primary)} onClick={() => void confirm()}>{busy === 'save' ? '저장하는 중…' : '감정 확정하기'}</button>
    </>}
  </dialog>;
}

function ReconfirmationNotice({ onLater, onSelect }: { onLater: () => void; onSelect: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!; node.showModal();
    return () => node.close();
  }, []);
  return <dialog ref={dialog} className="emotion-reconfirmation-dialog" aria-labelledby="emotion-reset-heading" aria-describedby="emotion-reset-description"
    onCancel={event => { event.preventDefault(); onLater(); }}>
    <div className="recap-rings" aria-hidden="true"><i /><i /><i /><i /></div>
    <span className="emotion-reset-symbol" aria-hidden="true">↻</span>
    <h2 id="emotion-reset-heading">바뀐 이야기의 마음은 어떤가요?</h2>
    <p id="emotion-reset-description">일기 본문이 바뀌어 기존 감정이 초기화됐어요.<br />지금의 마음에 맞는 감정을 다시 선택해 주세요.</p>
    <div className="emotion-reset-actions"><button type="button" onClick={onLater}>나중에</button><button type="button" onClick={onSelect}>감정 다시 선택하기</button></div>
  </dialog>;
}

export default function DiaryEmotions({ diary, onConfirmed, needsReconfirmation = false }: { diary: Diary; onConfirmed: (diary: Diary) => void; needsReconfirmation?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showReminder, setShowReminder] = useState(needsReconfirmation);
  useEffect(() => { if (needsReconfirmation) setShowReminder(true); }, [needsReconfirmation]);
  const primary = diary.emotions.find(emotion => emotion.isPrimary);
  if (!diary.savedAt) return null;
  return <>
    <button type="button" className="diary-emotion-button" onClick={() => setOpen(true)}>
      <span className="emotion-dot" style={{ background: color(primary?.colorHex) }} />{diary.emotionConfirmedAt ? `${primary?.name ?? '감정'} · 변경` : needsReconfirmation ? '감정 다시 선택하기' : '감정 기록하기'}
    </button>
    {open && <EmotionPicker diary={diary} onClose={() => setOpen(false)} onConfirmed={onConfirmed} />}
    {needsReconfirmation && showReminder && !open && <ReconfirmationNotice onLater={() => setShowReminder(false)} onSelect={() => { setShowReminder(false); setOpen(true); }} />}
  </>;
}
