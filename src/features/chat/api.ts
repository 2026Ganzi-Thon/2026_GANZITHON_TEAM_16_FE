// Chat screens import chatApi from here only. Logged in (access token present) it
// calls the backend; in the logged-out preview it uses the localStorage mock with the
// same contract. The choice is made per call because login state can change.
import { tokens } from '../../lib/http';
import { httpChatApi } from './httpApi';
import { mockChatApi } from './mockApi';
import type { ChatApi } from './types';

export const isLiveApi = () => Boolean(tokens.get());
const pick = () => (isLiveApi() ? httpChatApi : mockChatApi);

export const chatApi: ChatApi = {
  createSession: body => pick().createSession(body),
  listSessions: params => pick().listSessions(params),
  getSession: (id, params) => pick().getSession(id, params),
  endSession: id => pick().endSession(id),
  deleteSession: id => pick().deleteSession(id),
  sendMessage: (id, body) => pick().sendMessage(id, body),
  editMessage: (id, messageId, body) => pick().editMessage(id, messageId, body),
};
