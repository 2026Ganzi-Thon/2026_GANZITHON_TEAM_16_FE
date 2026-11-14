import { useEffect, useState } from 'react';
import { request, tokens } from '../../lib/http';
import { todaySeoul } from '../diary/api';

interface Page<T> { items: T[]; nextCursor: string | null }
interface SavedDiary { id: string; entryDate: string; savedAt: string | null }
interface Conversation { id: string; completedTurns: number }
interface Stats { diaryCount: number; conversationCount: number; streak: number }

async function allPages<T extends { id: string }>(path: string, signal: AbortSignal): Promise<T[]> {
  const items = new Map<string, T>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const page = await request<Page<T>>(`${path}?${query}`, { signal });
    page.items.forEach(item => items.set(item.id, item));
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('기록 집계를 완료하지 못했어요. 다시 시도해 주세요.');
    if (cursor) cursors.add(cursor);
  } while (cursor && !signal.aborted);
  return [...items.values()];
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;

// Count unique saved dates, anchored to today or yesterday in Asia/Seoul.
function streakOf(diaries: SavedDiary[], today: string) {
  const days = new Set(diaries.map(diary => dayNumber(diary.entryDate)));
  let day = dayNumber(today);
  if (!days.has(day)) day--;
  let streak = 0;
  while (days.has(day)) { streak++; day--; }
  return streak;
}

export function membership(createdAt?: string) {
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) return null;
  const joined = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(createdAt));
  const [year, month, day] = joined.split('-').map(Number);
  return { label: `${year}년 ${month}월 ${day}일부터`, days: Math.max(1, dayNumber(todaySeoul()) - dayNumber(joined) + 1) };
}

export function useMyPageStats(enabled: boolean) {
  const [token, setToken] = useState(tokens.get);
  const [revision, setRevision] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const changed = () => { setToken(tokens.get()); setStats(null); setError(''); };
    window.addEventListener('mowoo:auth-change', changed);
    return () => window.removeEventListener('mowoo:auth-change', changed);
  }, []);
  useEffect(() => {
    if (!enabled || !token) { setStats(null); setError(''); return; }
    const controller = new AbortController();
    setStats(null); setError('');
    Promise.all([
      allPages<SavedDiary>('/api/v1/diaries', controller.signal),
      allPages<Conversation>('/api/v1/chat-sessions', controller.signal),
    ]).then(([diaries, conversations]) => {
      if (controller.signal.aborted) return;
      const saved = diaries.filter(diary => diary.savedAt !== null);
      setStats({ diaryCount: saved.length, conversationCount: conversations.filter(session => session.completedTurns > 0).length, streak: streakOf(saved, todaySeoul()) });
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '기록 집계에 실패했어요.');
    });
    return () => controller.abort();
  }, [enabled, token, revision]);
  return { stats, error, retry: () => setRevision(value => value + 1) };
}
