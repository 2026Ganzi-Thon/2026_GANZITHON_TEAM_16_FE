// Diary, calendar and record APIs (backend develop: DiaryController, DiaryDraftController,
// CalendarController, RecordController, AuthController#withdraw). Used only when logged in.
import { request } from '../../lib/http';

export interface DiaryEmotion { id: string; code: string; name: string; colorHex: string | null; iconUrl: string | null; isPrimary: boolean }
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

const query = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== null && value !== undefined && value !== '') search.set(key, String(value)); });
  const text = search.toString();
  return text ? `?${text}` : '';
};
const id = (value: string) => encodeURIComponent(value);

export const diaryApi = {
  create: (body: { entryDate: string; title: string; content: string }) =>
    request<Diary>('/api/v1/diaries', { method: 'POST', body: JSON.stringify(body) }),
  get: (diaryId: string) => request<Diary>(`/api/v1/diaries/${id(diaryId)}`),
  list: (params: { from?: string; to?: string; limit?: number; cursor?: string | null } = {}) =>
    request<{ items: Diary[]; nextCursor: string | null }>(`/api/v1/diaries${query(params)}`),
  /** Fields left out stay unchanged; save:true confirms an AI draft. */
  update: (diaryId: string, body: { title?: string; content?: string; entryDate?: string; save?: boolean }) =>
    request<Diary>(`/api/v1/diaries/${id(diaryId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /** AI draft after 5 turns; returns the existing diary if the chat already has one. */
  draftFromChat: (sessionId: string, entryDate: string) =>
    request<Diary>(`/api/v1/chat-sessions/${id(sessionId)}/diary-draft${query({ entryDate })}`, { method: 'PUT' }),
  calendar: (month: string) => request<{ month: string; days: CalendarDay[] }>(`/api/v1/calendar${query({ month })}`),
  deleteDiaries: (diaryIds: string[]) =>
    request('/api/v1/diaries/bulk-delete', { method: 'POST', body: JSON.stringify({ diaryIds }) }),
  deleteAllRecords: () => request('/api/v1/me/records', { method: 'DELETE' }),
  withdraw: () => request('/api/v1/auth/withdraw', { method: 'DELETE' }),
};

/** Today's date in Asia/Seoul as YYYY-MM-DD. */
export const todaySeoul = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** "2026-06-05" -> "2026년 6월 5일 금요일 기록" (calendar date, no UTC shift). */
export const diaryDateLabel = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 기록`;
};
