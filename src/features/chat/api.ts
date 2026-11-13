// Chat screens import chatApi from here only. To connect the backend, replace this
// export with an HTTP implementation of ChatApi (src/lib/http.ts) for
// /api/v1/chat-sessions; the mock follows the same contract. The chat also needs the
// server's owned character UUID (see characters.ts). Diary, character and calendar
// screens are not covered here and need their own API wiring.
import { mockChatApi } from './mockApi';
import type { ChatApi } from './types';

export const chatApi: ChatApi = mockChatApi;
