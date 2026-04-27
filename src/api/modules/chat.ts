import { apiRequest } from '../request';
import type {
  ChatExecutionDetailData,
  ChatSessionDetailData,
  ChatSessionPageRequest,
  ChatSessionSummary,
  CitationDetailItem,
  CreateChatSessionData,
  CreateChatSessionRequest,
  PageData,
  SendMessageData,
  SendMessageRequest,
} from '../../types';

const CHAT_BASE_PATH = '/api/v1/chat';

// 提前拦截空标识，避免请求打到错误路径后才暴露问题。
function encodeRequiredId(id: string, fieldName: string): string {
  const value = id.trim();
  if (!value) {
    throw new Error(`${fieldName} 不能为空`);
  }

  return encodeURIComponent(value);
}

export const chatApi = {
  createSession(payload: CreateChatSessionRequest): Promise<CreateChatSessionData> {
    return apiRequest.post<CreateChatSessionData, CreateChatSessionRequest>(`${CHAT_BASE_PATH}/sessions`, payload);
  },
  pageSessions(payload: ChatSessionPageRequest): Promise<PageData<ChatSessionSummary>> {
    return apiRequest.post<PageData<ChatSessionSummary>, ChatSessionPageRequest>(`${CHAT_BASE_PATH}/sessions/page`, payload);
  },
  getSessionDetail(sessionId: string): Promise<ChatSessionDetailData> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    return apiRequest.get<ChatSessionDetailData>(`${CHAT_BASE_PATH}/sessions/${encodedSessionId}`);
  },
  sendMessage(sessionId: string, payload: SendMessageRequest): Promise<SendMessageData> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    return apiRequest.post<SendMessageData, SendMessageRequest>(
      `${CHAT_BASE_PATH}/sessions/${encodedSessionId}/messages`,
      payload,
    );
  },
  getCitations(sessionId: string, messageId: string): Promise<CitationDetailItem[]> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    const encodedMessageId = encodeRequiredId(messageId, 'messageId');
    return apiRequest.get<CitationDetailItem[]>(
      `${CHAT_BASE_PATH}/sessions/${encodedSessionId}/messages/${encodedMessageId}/citations`,
    );
  },
  getExecutionDetail(executionId: string): Promise<ChatExecutionDetailData> {
    const encodedExecutionId = encodeRequiredId(executionId, 'executionId');
    return apiRequest.get<ChatExecutionDetailData>(`${CHAT_BASE_PATH}/executions/${encodedExecutionId}`);
  },
};
