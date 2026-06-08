import { apiRequest, getApiClientConfig } from '../request';
import type {
  ChatAnswerMetricsData,
  ChatAnswerMetricsQuery,
  ChatConfigData,
  ChatConfigSavePayload,
  ChatExecutionDetailData,
  ChatFeedbackData,
  ChatFeedbackPageItem,
  ChatFeedbackPageRequest,
  ChatMessageStreamHandlers,
  ChatSessionDetailData,
  ChatSessionPageRequest,
  ChatSessionSummary,
  CitationDetailItem,
  CreateChatSessionData,
  CreateChatSessionRequest,
  PageData,
  PromptTemplateCreatePayload,
  PromptTemplateItem,
  PromptTemplateQuery,
  PromptTemplateStatusUpdatePayload,
  PromptTemplateUpdatePayload,
  SendMessageData,
  SendMessageRequest,
  SubmitChatFeedbackPayload,
} from '../../types';
import { buildQueryUrl } from '../query';

const CHAT_BASE_PATH = '/api/v1/chat';

interface ParsedSseEvent {
  eventName: string;
  dataText: string;
}

// 提前拦截空标识，避免请求打到错误路径后才暴露问题。
function encodeRequiredId(id: string, fieldName: string): string {
  const value = id.trim();
  if (!value) {
    throw new Error(`${fieldName} 不能为空`);
  }

  return encodeURIComponent(value);
}

// 流式接口复用全局 API 配置，但需要直接读取 Response.body，不能走 JSON 包裹解析。
function joinStreamUrl(baseUrl: string, url: string): string {
  if (/^https?:\/\//.test(url)) {
    return url;
  }
  if (!baseUrl) {
    return url;
  }
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

// SSE 仍需要携带 Bearer Token，后端接口权限与普通发送接口保持一致。
function buildStreamHeaders(): Headers {
  const config = getApiClientConfig();
  const headers = new Headers(config.defaultHeaders ?? {});
  headers.set('Accept', 'text/event-stream');
  headers.set('Content-Type', 'application/json');
  const accessToken = config.getAccessToken?.();
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return headers;
}

// 解析单个 SSE 消息块，兼容 event/data 多行格式。
function parseSseEvent(rawEvent: string): ParsedSseEvent | null {
  const lines = rawEvent.split('\n');
  let eventName = 'message';
  const dataLines: string[] = [];
  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });
  if (!dataLines.length) {
    return null;
  }
  return {
    eventName,
    dataText: dataLines.join('\n'),
  };
}

// 按事件名分发 SSE 数据，done 事件返回最终持久化后的消息摘要。
function dispatchStreamEvent(
  event: ParsedSseEvent,
  handlers: ChatMessageStreamHandlers,
  setResult: (data: SendMessageData) => void,
): void {
  if (event.eventName === 'start') {
    handlers.onStart?.();
    return;
  }
  if (event.eventName === 'chunk') {
    const data = JSON.parse(event.dataText) as { delta?: string };
    handlers.onChunk?.({ delta: data.delta ?? '' });
    return;
  }
  if (event.eventName === 'done') {
    const data = JSON.parse(event.dataText) as SendMessageData;
    setResult(data);
    handlers.onDone?.(data);
    return;
  }
  if (event.eventName === 'error') {
    const data = JSON.parse(event.dataText) as { message?: string };
    handlers.onError?.({ message: data.message || '流式回答生成失败' });
  }
}

// 逐块读取 text/event-stream，避免前端等待完整 JSON 响应后才渲染回答。
async function readMessageStream(
  response: Response,
  handlers: ChatMessageStreamHandlers,
): Promise<SendMessageData> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('当前浏览器不支持流式响应读取');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalResult: SendMessageData | null = null;
  let streamErrorMessage = '';
  const setResult = (data: SendMessageData) => {
    finalResult = data;
  };
  const wrappedHandlers: ChatMessageStreamHandlers = {
    ...handlers,
    onError: (error) => {
      streamErrorMessage = error.message;
      handlers.onError?.(error);
    },
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex).trimEnd();
      buffer = buffer.slice(separatorIndex + 2);
      const parsedEvent = parseSseEvent(rawEvent);
      if (parsedEvent) {
        dispatchStreamEvent(parsedEvent, wrappedHandlers, setResult);
      }
      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  if (streamErrorMessage) {
    throw new Error(streamErrorMessage);
  }
  if (!finalResult) {
    throw new Error('流式响应未返回完成事件');
  }
  return finalResult;
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
  // 默认聊天发送走 SSE 流式接口，调用方通过 onChunk 渐进渲染助手回答。
  async streamMessage(
    sessionId: string,
    payload: SendMessageRequest,
    handlers: ChatMessageStreamHandlers = {},
  ): Promise<SendMessageData> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    const config = getApiClientConfig();
    const fetcher = config.fetcher ?? fetch.bind(globalThis);
    const response = await fetcher(joinStreamUrl(
      config.baseUrl ?? '',
      `${CHAT_BASE_PATH}/sessions/${encodedSessionId}/messages/stream`,
    ), {
      method: 'POST',
      headers: buildStreamHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`流式发送失败，HTTP 状态码 ${response.status}`);
    }
    return readMessageStream(response, handlers);
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
  // 聊天治理配置只读取全局配置，前端不得自行推断留存和上下文默认值。
  getConfig(): Promise<ChatConfigData> {
    return apiRequest.get<ChatConfigData>(`${CHAT_BASE_PATH}/config`);
  },
  // 保存治理配置会影响留存、短期记忆和截断策略，摘要开关仍以后端预留状态为准。
  saveConfig(payload: ChatConfigSavePayload): Promise<ChatConfigData> {
    return apiRequest.put<ChatConfigData, ChatConfigSavePayload>(`${CHAT_BASE_PATH}/config`, payload);
  },
  // 提示词模板列表用于管理入口和后续模板聊天选项，分页与筛选全部交给后端。
  listPromptTemplates(query: PromptTemplateQuery): Promise<PageData<PromptTemplateItem>> {
    return apiRequest.get<PageData<PromptTemplateItem>>(buildQueryUrl(`${CHAT_BASE_PATH}/prompt-templates`, {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      keyword: query.keyword,
      scenarioCode: query.scenarioCode,
      knowledgeBindingType: query.knowledgeBindingType,
      templateStatus: query.templateStatus,
    }));
  },
  // 模板详情返回完整正文和 JSON 配置，编辑表单不得只依赖列表截断内容。
  getPromptTemplate(templateId: string): Promise<PromptTemplateItem> {
    const encodedTemplateId = encodeRequiredId(templateId, 'templateId');
    return apiRequest.get<PromptTemplateItem>(`${CHAT_BASE_PATH}/prompt-templates/${encodedTemplateId}`);
  },
  // 新增模板提交编码、变量定义和知识绑定，唯一性与绑定范围以后端校验为准。
  createPromptTemplate(payload: PromptTemplateCreatePayload): Promise<PromptTemplateItem> {
    return apiRequest.post<PromptTemplateItem, PromptTemplateCreatePayload>(
      `${CHAT_BASE_PATH}/prompt-templates`,
      payload,
    );
  },
  // 编辑模板不允许改编码，避免前端误改后影响既有聊天会话绑定。
  updatePromptTemplate(templateId: string, payload: PromptTemplateUpdatePayload): Promise<PromptTemplateItem> {
    const encodedTemplateId = encodeRequiredId(templateId, 'templateId');
    return apiRequest.put<PromptTemplateItem, PromptTemplateUpdatePayload>(
      `${CHAT_BASE_PATH}/prompt-templates/${encodedTemplateId}`,
      payload,
    );
  },
  // 启停模板走独立状态接口，避免列表快捷动作误提交正文和变量定义。
  updatePromptTemplateStatus(
    templateId: string,
    payload: PromptTemplateStatusUpdatePayload,
  ): Promise<PromptTemplateItem> {
    const encodedTemplateId = encodeRequiredId(templateId, 'templateId');
    return apiRequest.put<PromptTemplateItem, PromptTemplateStatusUpdatePayload>(
      `${CHAT_BASE_PATH}/prompt-templates/${encodedTemplateId}/status`,
      payload,
    );
  },
  // 删除模板由后端校验未删除会话绑定，前端只表达删除意图。
  deletePromptTemplate(templateId: string): Promise<void> {
    const encodedTemplateId = encodeRequiredId(templateId, 'templateId');
    return apiRequest.delete<void>(`${CHAT_BASE_PATH}/prompt-templates/${encodedTemplateId}`);
  },
  // 提交反馈绑定当前用户和助手消息，重复提交覆盖规则由后端保证。
  submitFeedback(
    sessionId: string,
    messageId: string,
    payload: SubmitChatFeedbackPayload,
  ): Promise<ChatFeedbackData> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    const encodedMessageId = encodeRequiredId(messageId, 'messageId');
    return apiRequest.post<ChatFeedbackData, SubmitChatFeedbackPayload>(
      `${CHAT_BASE_PATH}/sessions/${encodedSessionId}/messages/${encodedMessageId}/feedback`,
      payload,
    );
  },
  // 单条反馈回显仅查询当前用户状态，用于聊天气泡按钮高亮。
  getMessageFeedback(sessionId: string, messageId: string): Promise<ChatFeedbackData> {
    const encodedSessionId = encodeRequiredId(sessionId, 'sessionId');
    const encodedMessageId = encodeRequiredId(messageId, 'messageId');
    return apiRequest.get<ChatFeedbackData>(
      `${CHAT_BASE_PATH}/sessions/${encodedSessionId}/messages/${encodedMessageId}/feedback`,
    );
  },
  // 反馈分页面向运营查询，前端只传筛选条件，不展示无权限会话正文。
  pageFeedback(payload: ChatFeedbackPageRequest): Promise<PageData<ChatFeedbackPageItem>> {
    return apiRequest.post<PageData<ChatFeedbackPageItem>, ChatFeedbackPageRequest>(
      `${CHAT_BASE_PATH}/feedback/page`,
      payload,
    );
  },
  // 基础指标按后端统计口径聚合，前端不自行根据反馈列表推算。
  getAnswerMetrics(payload: ChatAnswerMetricsQuery): Promise<ChatAnswerMetricsData> {
    return apiRequest.post<ChatAnswerMetricsData, ChatAnswerMetricsQuery>(
      `${CHAT_BASE_PATH}/metrics/answers`,
      payload,
    );
  },
};
