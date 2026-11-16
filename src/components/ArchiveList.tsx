import { useEffect, useRef, useState } from 'react';
import { chatApi, isLiveApi } from '../features/chat/api';
import { errorMessage } from '../features/chat/useChat';
import { ChatApiError, type SessionListItem } from '../features/chat/types';

const seoul = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ...options }).format(new Date(iso));

function DeleteDialog({ item, busy, error, onCancel, onConfirm }: { item: SessionListItem; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return <dialog ref={dialog} className="archive-delete-dialog" aria-labelledby="delete-chat-heading" aria-describedby="delete-chat-description" aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="archive-dialog-rings" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="archive-dialog-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M12 16h24M19 16v-5h10v5M16 16l2 23h12l2-23M22 22v10M26 22v10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
    <h2 id="delete-chat-heading">대화를 삭제할까요?</h2>
    <p className="archive-dialog-title">{item.title ?? '제목 없음'}</p>
    <p id="delete-chat-description">삭제한 대화는 복구할 수 없어요.<br /><strong>이 대화로 만든 일기는 남아 있어요.</strong></p>
    {error && <p className="archive-dialog-error" role="alert">{error}<br />다시 삭제를 눌러 시도해 주세요.</p>}
    {busy && <p className="archive-dialog-progress" role="status">대화를 삭제하고 있어요.</p>}
    <div className="archive-dialog-actions">
      <button type="button" className="archive-dialog-cancel" autoFocus disabled={busy} onClick={onCancel}>취소</button>
      <button type="button" className="archive-dialog-confirm" disabled={busy} onClick={onConfirm}>{busy ? '삭제 중…' : '삭제하기'}</button>
    </div>
  </dialog>;
}

export default function ArchiveList({ onOpen }: { onOpen: (sessionId: string) => void; onError: (message: string) => void }) {
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SessionListItem | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);

  async function load(cursor: string | null) {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    setLoadError('');
    try {
      const page = await chatApi.listSessions({ cursor });
      setItems(current => {
        const seen = new Set(current.map(item => item.id));
        return [...current, ...page.items.filter(item => !seen.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) { setLoadError(errorMessage(error)); }
    finally { locked.current = false; setLoading(false); }
  }
  useEffect(() => { void load(null); }, []); // first page once

  async function remove(item: SessionListItem) {
    if (locked.current) return;
    const activeKey = isLiveApi() ? 'mowoo.chat.active.live' : 'mowoo.chat.active';
    locked.current = true; setDeleting(item.id); setDeleteError(null); setNotice('');
    try {
      try { await chatApi.deleteSession(item.id); }
      catch (error) {
        // Another tab may already have deleted the same conversation.
        if (!(error instanceof ChatApiError && error.status === 404 && error.code === 'SESSION_NOT_FOUND')) throw error;
      }
      setItems(current => current.filter(value => value.id !== item.id));
      try { if (localStorage.getItem(activeKey) === item.id) localStorage.removeItem(activeKey); }
      catch { /* A disabled storage must not turn a successful deletion into an error. */ }
      setNotice('대화를 삭제했어요. 작성한 일기는 유지됩니다.');
      setConfirming(null);
    } catch (error) { setDeleteError({ id: item.id, message: errorMessage(error) }); }
    finally { locked.current = false; setDeleting(null); }
  }

  const groups: { month: string; items: SessionListItem[] }[] = [];
  items.forEach(item => {
    const month = seoul(item.startedAt, { year: 'numeric', month: 'long' });
    const group = groups.at(-1);
    if (group?.month === month) group.items.push(item); else groups.push({ month, items: [item] });
  });

  return (
    <div className="archive-list" data-scroll-key="archive-list">
      {notice && <p className="archive-feedback" role="status">{notice}</p>}
      {loadError && <p className="archive-feedback" role="alert">{loadError} <button type="button" disabled={loading || deleting !== null} onClick={() => void load(nextCursor)}>다시 불러오기</button></p>}
      {!loading && !loadError && items.length === 0 && !nextCursor && <p className="archive-empty">아직 보관된 대화가 없어요.<br />모우와 대화를 시작해 보세요.</p>}
      {groups.map(group => (
        <section key={group.month} aria-label={`${group.month} 기록`}>
          <h2 className="archive-month">{group.month} 기록</h2>
          {group.items.map(item => (
            <div key={item.id} className="archive-entry" aria-busy={deleting === item.id}>
            <button type="button" className="archive-card" disabled={deleting === item.id} onClick={() => onOpen(item.id)}>
              <span className="archive-date">
                {seoul(item.startedAt, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 기록
                {!item.endedAt && <span className="archive-badge">진행 중</span>}
              </span>
              <span className={`archive-title${item.title ? '' : ' is-empty'}`}>{item.title ?? '제목 없음'}</span>
              <span className="archive-preview">{item.summary ?? item.preview ?? ''}</span>
            </button>
            <button type="button" className="archive-delete" aria-label={`${item.title ?? '제목 없음'} 대화 삭제`} disabled={loading || deleting !== null} onClick={() => { setDeleteError(null); setConfirming(item); }}>대화 삭제</button>
            </div>
          ))}
        </section>
      ))}
      {loading && !items.length && <p className="archive-feedback" role="status">불러오는 중…</p>}
      {nextCursor && <button type="button" className="archive-more" disabled={loading || deleting !== null} onClick={() => { void load(nextCursor); }}>{loading ? '불러오는 중…' : '더 보기'}</button>}
      {confirming && <DeleteDialog item={confirming} busy={deleting !== null} error={deleteError?.id === confirming.id ? deleteError.message : undefined}
        onCancel={() => { if (!locked.current) setConfirming(null); }} onConfirm={() => void remove(confirming)} />}
    </div>
  );
}
