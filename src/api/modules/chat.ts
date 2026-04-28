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
  // 创建会话保存聊天模式和绑定对象，首问可由后端按请求内容决定是否立即处理。
  createSession(payload: CreateChatSessionRequest): Promise<CreateChatSessionData> {
    return apiRequest.post<CreateChatSessionData, CreateChatSessionRequest>(`${CHAT_BASE_PATH}/sessions`, payload);
  },
  // 会话列表使用分页查询，避免默认拉取完整消息历史。
  pageSessions(payload: ChatSessionPageRequest): Promise<PageData<ChatSessionSummary>> {
    return apiRequest.post<PageData<ChatSessionSummary>, ChatSessionPageRequest>(`${CHAT_BASE_PATH}/sessions/page`, payload);
  },
  // 会话详情用于回看消息和引用，路径参数必须先编码。
  getSessionDetail(sessionId: string): Promise<ChatSessionDetailData> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    return apiRequest.get<ChatSessionDetailData>(`${CHAT_BASE_PATH}/sessions/${encodedSessionId}`);
  },
  // 发送消息挂在指定会话下，避免前端自行拼装会话状态。
  sendMessage(sessionId: string, payload: SendMessageRequest): Promise<SendMessageData> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    return apiRequest.post<SendMessageData, SendMessageRequest>(
      `${CHAT_BASE_PATH}/sessions/${encodedSessionId}/messages`,
      payload,
    );
  },
  // 引用明细按消息维度查询，减少会话详情首屏负载。
  getCitations(sessionId: string, messageId: string): Promise<CitationDetailItem[]> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    const encodedMessageId = encodeRequiredId(messageId, 'messageId');
    return apiRequest.get<CitationDetailItem[]>(
      `${CHAT_BASE_PATH}/sessions/${encodedSessionId}/messages/${encodedMessageId}/citations`,
    );
  },
  // 执行明细用于排查检索、模型调用和持久化链路问题。
  getExecutionDetail(executionId: string): Promise<ChatExecutionDetailData> {
    const encodedExecutionId = encodeRequiredId(executionId, 'executionId');
    return apiRequest.get<ChatExecutionDetailData>(`${CHAT_BASE_PATH}/executions/${encodedExecutionId}`);
  },
};
