import { useEffect, useRef, useState } from 'react';
import { chatApi } from '../features/chat/api';
import { errorMessage } from '../features/chat/useChat';
import type { DiarySuggestion } from '../features/chat/types';

interface Props {
  sessionId: string;
  messageId: string;
  concern: string;
  disabled: boolean;
  onOpenDiary: (id: string) => void;
  onReference: (messageId: string, diaryId: string) => Promise<string | null>;
}

function SuggestionDialog({ sessionId, messageId, concern, onOpenDiary, onReference, onClose }: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const [items, setItems] = useState<DiarySuggestion[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    alive.current = true;
    const node = dialog.current!; node.showModal();
    return () => { alive.current = false; node.close(); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(''); setSelected(null); setItems([]);
    chatApi.suggestDiaries(sessionId, messageId, abort.signal).then(result => {
      if (!abort.signal.aborted) setItems(result.items);
    }).catch(reason => { if (!abort.signal.aborted) setError(errorMessage(reason)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [sessionId, messageId, revision]);
  async function confirm() {
    if (!selected || locked.current) return;
    locked.current = true; setSaving(true); setError('');
    try {
      const failure = await onReference(messageId, selected);
      if (!alive.current) return;
      if (failure) setError(failure);
      else onClose();
    } finally { locked.current = false; if (alive.current) setSaving(false); }
  }
  return <dialog ref={dialog} className="past-diary-dialog" aria-labelledby="past-diary-heading" aria-describedby="past-diary-consent" aria-busy={saving}
    onCancel={event => { event.preventDefault(); if (!locked.current) onClose(); }}>
    <header><h2 id="past-diary-heading">지난 마음 돌아보기</h2><button type="button" aria-label="과거 일기 추천 닫기" disabled={saving} onClick={onClose}>×</button></header>
    <p className="past-diary-concern">{concern}</p>
    <p id="past-diary-consent">지금 이야기와 함께 살펴볼 일기를 골라 주세요. <strong>‘선택한 일기로 비교하기’를 누르면 일기 내용을 AI가 참고해 비교 답변을 만들어요.</strong></p>
    {loading && <p role="status">관련된 일기를 찾고 있어요…</p>}
    {!loading && !items.length && !error && <p className="past-diary-empty">지금 추천할 일기가 없어요. 기록이 없거나 추천을 잠시 제공하지 못할 수 있어요.</p>}
    {!!items.length && <fieldset disabled={saving}><legend>비교할 일기 선택</legend>{items.map(item => <div key={item.diaryId} className={`past-diary-option${selected === item.diaryId ? ' is-selected' : ''}`}>
      <label><input type="radio" name="past-diary" checked={selected === item.diaryId} onChange={() => setSelected(item.diaryId)} /><span><time>{item.entryDate}</time><strong>{item.title || '제목 없음'}</strong></span></label>
      <button type="button" onClick={() => onOpenDiary(item.diaryId)}>일기 읽기</button>
    </div>)}</fieldset>}
    {error && <p className="past-diary-error" role="alert">{error}</p>}
    {!loading && !saving && !items.length && <button type="button" className="past-diary-retry" onClick={() => setRevision(value => value + 1)}>추천 다시 받기</button>}
    {saving && <p role="status">선택한 일기를 참고해 답변을 만들고 있어요…</p>}
    <div className="past-diary-actions"><button type="button" disabled={saving} onClick={onClose}>취소</button>
      <button type="button" disabled={loading || saving || !selected} onClick={() => void confirm()}>{saving ? '비교하는 중…' : '선택한 일기로 비교하기'}</button></div>
  </dialog>;
}

export default function PastDiarySuggestions(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="chat-diary-suggest" disabled={props.disabled} onClick={() => setOpen(true)}>과거 일기 추천받기</button>
    {open && <SuggestionDialog {...props} onClose={() => setOpen(false)} />}
  </>;
}
