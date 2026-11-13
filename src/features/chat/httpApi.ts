// HTTP implementation of the chat contract (/api/v1/chat-sessions). Responses carry
// isSuccess/code/message at the top level next to the data fields; screens ignore them.
import { ApiError, request } from '../../lib/http';
import { ChatApiError, type ChatApi, type ChatErrorCode, type SessionListItem } from './types';

const base = '/api/v1/chat-sessions';
const query = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== null && value !== undefined) search.set(key, String(value)); });
  const text = search.toString();
  return text ? `?${text}` : '';
};

async function call<T>(url: string, options: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(url, options);
  } catch (error) {
    if (error instanceof ApiError) throw new ChatApiError((error.code ?? 'UNKNOWN') as ChatErrorCode, error.status, error.message);
    throw error;
  }
}

export const httpChatApi: ChatApi = {
  createSession: body => call(base, { method: 'POST', body: JSON.stringify(body) }),
  listSessions: async ({ limit, cursor } = {}) => {
    const page = await call<{ items: Omit<SessionListItem, 'preview'>[]; nextCursor: string | null }>(`${base}${query({ limit, cursor })}`);
    return { items: page.items.map(item => ({ ...item, preview: null })), nextCursor: page.nextCursor };
  },
  getSession: (sessionId, { limit, cursor } = {}) => call(`${base}/${encodeURIComponent(sessionId)}${query({ limit, cursor })}`),
  endSession: sessionId => call(`${base}/${encodeURIComponent(sessionId)}`, { method: 'PATCH', body: JSON.stringify({ action: 'END' }) }),
  deleteSession: async sessionId => { await call(`${base}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }); },
  sendMessage: (sessionId, body) => call(`${base}/${encodeURIComponent(sessionId)}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  editMessage: (sessionId, messageId, body) => call(`${base}/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
};
