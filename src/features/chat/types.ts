// Mirrors the backend feat/chat-session DTOs (see FRONTEND_HANDOFF_2026-11-10.md §5).
// Keep these in sync with Swagger when the real API is connected.

export interface DiaryReference {
  diaryId: string;
  entryDate: string;
  title: string;
  acceptedAt: string;
}

export interface ChatMessage {
  id: string;
  sequenceNo: number;
  senderRole: 'USER' | 'ASSISTANT';
  characterId: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  diaryReferences: DiaryReference[];
}

export interface ChatSession {
  id: string;
  characterId: string;
  title: string | null;
  summary: string | null;
  startedAt: string;
  endedAt: string | null;
  completedTurns: number;
  canGenerateDiary: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SessionDetail {
  session: ChatSession;
  messages: Page<ChatMessage>;
}

export interface SendResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  completedTurns: number;
  canGenerateDiary: boolean;
}

export interface EditResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

/** Archive cards also show a preview line; the mock derives it from the first user message. */
export interface SessionListItem extends ChatSession {
  preview: string | null;
}

export type ChatErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'CHARACTER_NOT_OWNED'
  | 'MESSAGE_EMPTY'
  | 'MESSAGE_NOT_FOUND'
  | 'MESSAGE_NOT_EDITABLE'
  | 'AI_UNAVAILABLE';

export class ChatApiError extends Error {
  constructor(public code: ChatErrorCode, public status: number, message: string) {
    super(message);
  }
}

export interface ChatApi {
  createSession(body: { characterId: string }): Promise<ChatSession>;
  listSessions(params?: { limit?: number; cursor?: string | null }): Promise<Page<SessionListItem>>;
  getSession(sessionId: string, params?: { limit?: number; cursor?: string | null }): Promise<SessionDetail>;
  endSession(sessionId: string): Promise<ChatSession>;
  deleteSession(sessionId: string): Promise<void>;
  sendMessage(sessionId: string, body: { content: string; characterId?: string }): Promise<SendResult>;
  editMessage(sessionId: string, messageId: string, body: { content: string }): Promise<EditResult>;
}

/** Turns needed before the server sets canGenerateDiary. */
export const REQUIRED_TURNS = 5;
