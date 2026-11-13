import { useEffect, useState } from 'react';
import { chatApi } from '../features/chat/api';
import { errorMessage } from '../features/chat/useChat';
import type { SessionListItem } from '../features/chat/types';

const seoul = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ...options }).format(new Date(iso));

export default function ArchiveList({ onOpen, onError }: { onOpen: (sessionId: string) => void; onError: (message: string) => void }) {
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(cursor: string | null) {
    setLoading(true);
    try {
      const page = await chatApi.listSessions({ cursor });
      setItems(current => {
        const seen = new Set(current.map(item => item.id));
        return [...current, ...page.items.filter(item => !seen.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) { onError(errorMessage(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(null); }, []); // first page once

  const groups: { month: string; items: SessionListItem[] }[] = [];
  items.forEach(item => {
    const month = seoul(item.startedAt, { month: 'long' });
    const group = groups.at(-1);
    if (group?.month === month) group.items.push(item); else groups.push({ month, items: [item] });
  });

  return (
    <div className="archive-list" data-scroll-key="archive-list">
      {!loading && items.length === 0 && <p className="archive-empty">아직 보관된 대화가 없어요.<br />모우와 대화를 시작해 보세요.</p>}
      {groups.map(group => (
        <section key={group.month} aria-label={`${group.month} 기록`}>
          <h2 className="archive-month">{group.month} 기록</h2>
          {group.items.map(item => (
            <button key={item.id} type="button" className="archive-card" onClick={() => onOpen(item.id)}>
              <span className="archive-date">
                {seoul(item.startedAt, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 기록
                {!item.endedAt && <span className="archive-badge">진행 중</span>}
              </span>
              <span className={`archive-title${item.title ? '' : ' is-empty'}`}>{item.title ?? '제목 없음'}</span>
              <span className="archive-preview">{item.summary ?? item.preview ?? ''}</span>
            </button>
          ))}
        </section>
      ))}
      {nextCursor && <button type="button" className="archive-more" disabled={loading} onClick={() => { void load(nextCursor); }}>{loading ? '불러오는 중…' : '더 보기'}</button>}
    </div>
  );
}
