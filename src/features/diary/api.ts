// Diary, calendar and record APIs (backend develop: DiaryController, DiaryDraftController,
// CalendarController, RecordController, AuthController#withdraw). Used only when logged in.
import { request } from '../../lib/http';
import { photoBody } from '../attachments';

export interface DiaryEmotion { id: string; code: string; name: string; colorHex: string | null; iconUrl: string | null; isPrimary: boolean }
export interface EmotionType { id: string; code: string; name: string; colorHex: string | null; iconUrl: string | null }
export interface DiaryAttachment { id: string; mimeType: string; url: string; sortOrder: number }
export interface Diary {
  id: string;
  sourceSessionId: string | null;
  entryDate: string; // YYYY-MM-DD (Seoul calendar date, never shifted)
  title: string;
  content: string;
  savedAt: string | null; // null = AI draft not saved yet
  emotionConfirmedAt: string | null;
  emotions: DiaryEmotion[];
  attachments: DiaryAttachment[];
}
export interface CalendarDay { date: string; primaryEmotion: { id: string; code: string; name: string; colorHex: string | null } | null; diaryIds: string[] }
export interface MonthlyRecap { month: string; emotionCounts: { emotionTypeId: string; count: number }[]; concernSummary: string | null }

const query = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== null && value !== undefined && value !== '') search.set(key, String(value)); });
  const text = search.toString();
  return text ? `?${text}` : '';
};
const id = (value: string) => encodeURIComponent(value);

export const diaryApi = {
  emotionTypes: (signal?: AbortSignal) => request<{ items: EmotionType[] }>('/api/v1/emotion-types', { signal }),
  suggestEmotions: (diaryId: string, signal?: AbortSignal) => request<{ suggestedEmotionIds: string[]; primaryEmotionId: string }>(`/api/v1/diaries/${id(diaryId)}/emotion-suggestions`, { method: 'POST', signal }),
  confirmEmotions: (diaryId: string, emotionIds: string[], primaryEmotionId: string, signal?: AbortSignal) => request<Diary>(`/api/v1/diaries/${id(diaryId)}/emotions`, { method: 'PUT', body: JSON.stringify({ emotionIds, primaryEmotionId }), signal }),
  create: (body: { entryDate: string; title: string; content: string }, files?: File[]) =>
    request<Diary>('/api/v1/diaries', { method: 'POST', body: photoBody(body, files) }),
  get: (diaryId: string) => request<Diary>(`/api/v1/diaries/${id(diaryId)}`),
  list: (params: { from?: string; to?: string; limit?: number; cursor?: string | null } = {}, signal?: AbortSignal) =>
    request<{ items: Diary[]; nextCursor: string | null }>(`/api/v1/diaries${query(params)}`, { signal }),
  /** Fields left out stay unchanged; save:true confirms an AI draft. */
  update: (diaryId: string, body: { title?: string; content?: string; entryDate?: string; save?: boolean; removeAttachmentIds?: string[] }, files?: File[]) =>
    request<Diary>(`/api/v1/diaries/${id(diaryId)}`, { method: 'PATCH', body: photoBody(body, files) }),
  /** AI draft after 5 turns; returns the existing diary if the chat already has one. */
  draftFromChat: (sessionId: string, entryDate: string, signal?: AbortSignal) =>
    request<Diary>(`/api/v1/chat-sessions/${id(sessionId)}/diary-draft${query({ entryDate })}`, { method: 'PUT', signal }),
  calendar: (month: string, signal?: AbortSignal) => request<{ month: string; days: CalendarDay[] }>(`/api/v1/calendar${query({ month })}`, { signal }),
  recap: (month: string, signal?: AbortSignal) => request<MonthlyRecap>(`/api/v1/calendar/recap${query({ month })}`, { signal }),
  deleteDiaries: (diaryIds: string[]) =>
    request('/api/v1/diaries/bulk-delete', { method: 'POST', body: JSON.stringify({ diaryIds }) }),
  deleteAllRecords: () => request('/api/v1/me/records', { method: 'DELETE' }),
  withdraw: () => request('/api/v1/auth/withdraw', { method: 'DELETE' }),
};

/** Follow every cursor; publish results only once the complete list is available. */
export async function listAllDiaries(params: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<Diary[]> {
  const items = new Map<string, Diary>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    signal?.throwIfAborted();
    const page = await diaryApi.list({ ...params, limit: 100, cursor }, signal);
    signal?.throwIfAborted();
    page.items.forEach(diary => items.set(diary.id, diary));
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('일기 목록을 끝까지 불러오지 못했어요. 다시 시도해 주세요.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...items.values()];
}

/** Today's date in Asia/Seoul as YYYY-MM-DD. */
export const todaySeoul = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** "2026-06-05" -> "2026년 6월 5일 금요일 기록" (calendar date, no UTC shift). */
export const diaryDateLabel = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 기록`;
};
