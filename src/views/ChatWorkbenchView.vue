<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { chatApi } from '@/api';
import { knowledgeApi } from '@/api/modules/knowledge';
import { usePermission } from '@/auth/permissions';
import type {
  BindingObjectType,
  ChatExecutionDetailData,
  ChatFeedbackData,
  ChatFeedbackType,
  CitationSummaryItem,
  ChatMessageItem,
  ChatMode,
  ChatSessionDetailData,
  ChatSessionSummary,
  CitationDetailItem,
  RetentionStatus,
  SendMessageData,
  SortOrder,
} from '@/types';
import type { KnowledgeBase, KnowledgeDocument } from '@/types/knowledge';
import { formatJson, getErrorMessage, normalizeOptionalText, splitTextToIds } from '@/utils/api-feedback';

interface SessionPageForm {
  keyword: string;
  chatMode: ChatMode | '';
  retentionStatus: RetentionStatus | '';
  pageNo: number;
  pageSize: number;
  sortBy: string;
  sortOrder: SortOrder;
}

interface CreateSessionForm {
  chatMode: ChatMode;
  bindingObjectType: BindingObjectType;
  bindingObjectId: string;
  knowledgeBindingType: string;
  knowledgeBindingIdsText: string;
  firstMessageContent: string;
}

interface MessageForm {
  sessionId: string;
  messageContent: string;
  selectedDocumentIdsText: string;
  templateVariablesText: string;
}

interface TraceForm {
  sessionId: string;
  messageId: string;
  executionId: string;
}

const sessionPageForm = reactive<SessionPageForm>({
  keyword: '',
  chatMode: 'knowledge_base',
  retentionStatus: '',
  pageNo: 1,
  pageSize: 20,
  sortBy: 'lastMessageTime',
  sortOrder: 'desc',
});

const createSessionForm = reactive<CreateSessionForm>({
  chatMode: 'knowledge_base',
  bindingObjectType: 'knowledge_base',
  bindingObjectId: '',
  knowledgeBindingType: '',
  knowledgeBindingIdsText: '',
  firstMessageContent: '',
});

const messageForm = reactive<MessageForm>({
  sessionId: '',
  messageContent: '',
  selectedDocumentIdsText: '',
  templateVariablesText: '{}',
});

const traceForm = reactive<TraceForm>({
  sessionId: '',
  messageId: '',
  executionId: '',
});

const loading = reactive({
  paging: false,
  creating: false,
  sessionDetail: false,
  sending: false,
  citations: false,
  execution: false,
  knowledgeBases: false,
  documents: false,
});

const { hasPermission } = usePermission();
const successMessage = ref('');
const errorMessage = ref('');
const sessionRows = ref<ChatSessionSummary[]>([]);
const sessionTotal = ref(0);
const sessionDetail = ref<ChatSessionDetailData | null>(null);
const streamingMessages = ref<ChatMessageItem[]>([]);
const latestReply = ref<SendMessageData | null>(null);
const citations = ref<CitationDetailItem[]>([]);
const executionDetail = ref<ChatExecutionDetailData | null>(null);
const inspectorTab = ref<'citations' | 'execution' | 'json'>('citations');
const settingsDrawerVisible = ref(false);
const feedbackDialogVisible = ref(false);
const messageThreadRef = ref<HTMLElement | null>(null);
const knowledgeBaseOptions = ref<KnowledgeBase[]>([]);
const documentOptions = ref<KnowledgeDocument[]>([]);
const selectedDocumentIds = ref<string[]>([]);
const knowledgeBindingIds = ref<string[]>([]);
const knowledgeBaseOptionMessage = ref('');
const documentOptionMessage = ref('');
const feedbackMap = ref<Record<string, ChatFeedbackData>>({});
const feedbackSubmittingMessageId = ref('');
const feedbackForm = reactive({
  sessionId: '',
  messageId: '',
  feedbackType: 'like' as ChatFeedbackType,
  feedbackContent: '',
});
const TYPEWRITER_INTERVAL_MS = 18;
const TYPEWRITER_CHARS_PER_TICK = 2;
const THINKING_TEXT = '思考中...';
const INVALID_SOURCE_LABELS = new Set(['外链', '无来源', '暂无来源']);
let pendingReplyText = '';
let typingTimer: number | null = null;
let typingDrainResolver: (() => void) | null = null;

const activeSessionId = computed(() => sessionDetail.value?.sessionId || messageForm.sessionId.trim());
const activeMessages = computed(() => [...(sessionDetail.value?.messageList ?? []), ...streamingMessages.value]);
const canSendMessage = computed(() => (
  Boolean(messageForm.messageContent.trim())
  && !loading.sending
  && Boolean(activeSessionId.value || createSessionForm.bindingObjectId.trim())
));
const hasKnowledgeBaseOptions = computed(() => knowledgeBaseOptions.value.length > 0);
const hasDocumentOptions = computed(() => documentOptions.value.length > 0);
const isCreatingSession = computed(() => !activeSessionId.value);
const canSubmitFeedback = computed(() => hasPermission('chat:feedback:submit'));
const canViewFeedback = computed(() => hasPermission('chat:feedback:detail'));
const visibleCitations = computed(() => citations.value.filter((citation) => hasVisibleCitationSource(citation.documentName)));

// 重置提示状态，避免连续操作时残留上一轮结果。
function resetFeedback(): void {
  successMessage.value = '';
  errorMessage.value = '';
}

// 统一写入成功提示，保证同一时间只展示一种反馈。
function setSuccess(message: string): void {
  successMessage.value = message;
  errorMessage.value = '';
}

// 统一归一化异常文案，避免接口错误直接泄露到页面。
function setError(error: unknown): void {
  successMessage.value = '';
  errorMessage.value = getErrorMessage(error);
}

// 将后端状态码转成界面文案，未知值保留原始码便于联调。
function statusText(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    pending: '待首问',
    in_progress: '进行中',
    closed: '已关闭',
    hot: '热数据',
    cold: '冷数据',
    succeeded: '成功',
    failed: '失败',
    completed: '完成',
    retrieval: '检索',
    context: '上下文',
    model: '模型',
    persist: '持久化',
  };
  return labels[status || ''] ?? status ?? '';
}

// 反馈按钮只挂在后端已持久化的成功助手消息上，避免临时流式消息提交失败。
function canRenderFeedbackAction(message: ChatMessageItem): boolean {
  return canSubmitFeedback.value
    && message.role === 'assistant'
    && message.messageStatus === 'succeeded'
    && !message.messageId.startsWith('tmp_');
}

// 将反馈枚举转换为按钮和提示文案，避免界面直接展示英文枚举。
function feedbackTypeText(feedbackType: ChatFeedbackType): string {
  return feedbackType === 'like' ? '点赞' : '点踩';
}

// 判断当前消息的反馈状态，用于高亮当前用户已提交的反馈按钮。
function isFeedbackActive(messageId: string, feedbackType: ChatFeedbackType): boolean {
  return feedbackMap.value[messageId]?.feedbackType === feedbackType;
}

// 只展示真实来源名称，过滤“外链”这类无法定位具体来源的占位标题。
function hasVisibleCitationSource(sourceName: string | null | undefined): boolean {
  const normalizedName = sourceName?.trim() ?? '';
  return Boolean(normalizedName) && !INVALID_SOURCE_LABELS.has(normalizedName);
}

// 消息卡片只渲染可识别来源，避免无来源回答仍显示无意义的引用按钮。
function getVisibleCitationSummary(message: ChatMessageItem): CitationSummaryItem[] {
  return (message.citationSummary ?? []).filter((citation) => hasVisibleCitationSource(citation.documentName));
}

// 统一压缩会话时间显示，非法时间保留原始值帮助定位数据问题。
function formatTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// 下拉项展示名称带上编码，便于同名知识库联调时区分。
function knowledgeBaseLabel(base: KnowledgeBase): string {
  return base.baseCode ? `${base.baseName}（${base.baseCode}）` : base.baseName;
}

// 文档范围显示标题和业务状态，避免误选草稿或下线文档。
function documentLabel(document: KnowledgeDocument): string {
  const statusName = document.businessStatusName || document.businessStatus;
  return statusName ? `${document.title}（${statusName}）` : document.title;
}

// 构造前端临时消息，SSE 完成后会用后端持久化消息详情替换。
function createTemporaryMessage(role: 'user' | 'assistant', content: string): ChatMessageItem {
  return {
    messageId: `tmp_${role}_${Date.now()}`,
    role,
    content,
    messageStatus: role === 'assistant' ? 'processing' : 'succeeded',
    createdTime: new Date().toISOString(),
  };
}

// 当前流式回答只维护最后一条临时助手消息，避免历史消息被误写入打字队列。
function getStreamingAssistantMessage(): ChatMessageItem | undefined {
  return streamingMessages.value.find((message) => message.role === 'assistant');
}

// 首个回答分片到达前展示等待状态，避免用户误以为发送没有响应。
function showAssistantThinking(): void {
  const assistantMessage = getStreamingAssistantMessage();
  if (assistantMessage && !assistantMessage.content) {
    assistantMessage.content = THINKING_TEXT;
  }
}

// 消息区内部滚动到底部，避免页面整体滚动后把发送框挤出视口。
async function scrollMessageThreadToBottom(): Promise<void> {
  await nextTick();
  const messageThread = messageThreadRef.value;
  if (!messageThread) {
    return;
  }
  messageThread.scrollTop = messageThread.scrollHeight;
}

// 清理上一次打字状态，避免连续发送时旧定时器继续写入新回答。
function resetTypewriterQueue(): void {
  if (typingTimer !== null) {
    window.clearTimeout(typingTimer);
    typingTimer = null;
  }
  pendingReplyText = '';
  if (typingDrainResolver) {
    typingDrainResolver();
    typingDrainResolver = null;
  }
}

// 队列耗尽时唤醒发送流程，之后再刷新后端持久化消息。
function resolveTypewriterDrainIfIdle(): void {
  if (pendingReplyText || typingTimer !== null || !typingDrainResolver) {
    return;
  }
  const resolver = typingDrainResolver;
  typingDrainResolver = null;
  resolver();
}

// 按固定节奏写入少量字符，模拟主流聊天产品的打字机渲染。
function typeNextReplySlice(): void {
  typingTimer = null;
  const assistantMessage = getStreamingAssistantMessage();
  if (!assistantMessage) {
    pendingReplyText = '';
    resolveTypewriterDrainIfIdle();
    return;
  }

  const nextText = pendingReplyText.slice(0, TYPEWRITER_CHARS_PER_TICK);
  pendingReplyText = pendingReplyText.slice(TYPEWRITER_CHARS_PER_TICK);
  if (assistantMessage.content === THINKING_TEXT) {
    assistantMessage.content = '';
  }
  assistantMessage.content += nextText;
  void scrollMessageThreadToBottom();

  if (pendingReplyText) {
    typingTimer = window.setTimeout(typeNextReplySlice, TYPEWRITER_INTERVAL_MS);
    return;
  }
  resolveTypewriterDrainIfIdle();
}

// 将 SSE 分片放入本地打字队列，避免后端快速返回时前端瞬间显示完整答案。
function appendStreamingReply(delta: string): void {
  if (!delta) {
    return;
  }
  pendingReplyText += delta;
  if (typingTimer === null) {
    typingTimer = window.setTimeout(typeNextReplySlice, TYPEWRITER_INTERVAL_MS);
  }
}

// 等待打字队列消费完再刷新会话详情，避免持久化详情立即覆盖打字机效果。
function waitForTypewriterIdle(): Promise<void> {
  if (!pendingReplyText && typingTimer === null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    typingDrainResolver = resolve;
  });
}

// 流式完成后补齐临时助手消息标识，随后详情刷新会覆盖为后端真实消息。
function completeStreamingReply(replyData: SendMessageData): void {
  const assistantMessage = streamingMessages.value.find((message) => message.role === 'assistant');
  if (assistantMessage) {
    if (assistantMessage.content === THINKING_TEXT && !replyData.replyContent) {
      assistantMessage.content = '';
    }
    assistantMessage.messageId = replyData.assistantMessageId;
    assistantMessage.messageStatus = replyData.messageStatus;
    assistantMessage.citationSummary = replyData.citationSummary;
  }
}

// 解析模板变量时只接受对象，避免数组或字符串造成后端语义歧义。
function parseTemplateVariables(rawText: string): Record<string, unknown> | undefined {
  const value = rawText.trim();
  if (!value) {
    return undefined;
  }

  // 模板变量只允许对象，防止数组或字符串透传到后端后语义失真。
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('模板变量必须是 JSON 对象');
  }

  return parsed as Record<string, unknown>;
}

// 加载当前用户可见的启用知识库，聊天页只消费下拉选项不自行绕过后端权限。
async function loadKnowledgeBaseOptions(): Promise<void> {
  knowledgeBaseOptionMessage.value = '';
  if (!hasPermission('knowledge:base:query')) {
    knowledgeBaseOptions.value = [];
    knowledgeBaseOptionMessage.value = '暂无知识库查询权限，无法加载下拉选项';
    return;
  }

  loading.knowledgeBases = true;
  try {
    const pageData = await knowledgeApi.listKnowledgeBases({
      pageNo: 1,
      pageSize: 100,
      baseStatus: 'enabled',
      displayEnabled: true,
    });
    knowledgeBaseOptions.value = pageData.list;
    if (!pageData.list.length) {
      knowledgeBaseOptionMessage.value = '暂无可用知识库';
    }
  } catch (error) {
    knowledgeBaseOptions.value = [];
    knowledgeBaseOptionMessage.value = getErrorMessage(error);
  } finally {
    loading.knowledgeBases = false;
  }
}

// 按已选知识库加载可用于限定问答范围的文档，下拉失败不阻断只按知识库提问。
async function loadDocumentOptions(knowledgeBaseId: string): Promise<void> {
  documentOptionMessage.value = '';
  documentOptions.value = [];
  if (!knowledgeBaseId) {
    return;
  }
  if (!hasPermission('knowledge:document:query')) {
    documentOptionMessage.value = '暂无文档查询权限，可直接按知识库提问';
    return;
  }

  loading.documents = true;
  try {
    const pageData = await knowledgeApi.listKnowledgeDocuments({
      pageNo: 1,
      pageSize: 100,
      knowledgeBaseId,
      businessStatus: 'published',
    });
    documentOptions.value = pageData.list;
    if (!pageData.list.length) {
      documentOptionMessage.value = '当前知识库暂无已发布文档';
    }
  } catch (error) {
    documentOptionMessage.value = getErrorMessage(error);
  } finally {
    loading.documents = false;
  }
}

// 切换知识库时清理旧文档范围，避免跨知识库文档 ID 被继续提交。
async function handleKnowledgeBaseChange(knowledgeBaseId: string): Promise<void> {
  selectedDocumentIds.value = [];
  messageForm.selectedDocumentIdsText = '';
  await loadDocumentOptions(knowledgeBaseId);
}

// 多选文档仍同步到原表单字段，保持发送接口入参结构不变。
function handleSelectedDocumentChange(documentIds: string[]): void {
  messageForm.selectedDocumentIdsText = documentIds.join(',');
}

// 高级知识绑定复用知识库下拉，内部仍转换为逗号分隔文本供原有提交逻辑处理。
function handleKnowledgeBindingChange(bindingIds: string[]): void {
  createSessionForm.knowledgeBindingIdsText = bindingIds.join(',');
  if (bindingIds.length > 0 && !createSessionForm.knowledgeBindingType.trim()) {
    createSessionForm.knowledgeBindingType = 'knowledge_base';
  }
}

// 查询会话列表，保留 silent 模式用于刷新局部数据时不打断用户反馈。
async function handlePageSessions(silent = false): Promise<void> {
  if (!silent) {
    resetFeedback();
  }
  loading.paging = true;
  try {
    const pageData = await chatApi.pageSessions({
      keyword: normalizeOptionalText(sessionPageForm.keyword),
      chatMode: sessionPageForm.chatMode || undefined,
      retentionStatus: sessionPageForm.retentionStatus || undefined,
      pageNo: sessionPageForm.pageNo,
      pageSize: sessionPageForm.pageSize,
      sortBy: sessionPageForm.sortBy,
      sortOrder: sessionPageForm.sortOrder,
    });
    sessionRows.value = pageData.list;
    sessionTotal.value = pageData.total;
    if (!silent) {
      setSuccess(`会话查询完成，共 ${pageData.total} 条`);
    }
  } catch (error) {
    setError(error);
  } finally {
    loading.paging = false;
  }
}

// 加载会话详情并同步后续引用、发送消息所需的会话上下文。
async function loadSessionDetail(sessionId: string): Promise<void> {
  resetFeedback();
  loading.sessionDetail = true;
  try {
    const detailData = await chatApi.getSessionDetail(sessionId);
    resetTypewriterQueue();
    streamingMessages.value = [];
    sessionDetail.value = detailData;
    await loadMessageFeedbacks(detailData);
    messageForm.sessionId = detailData.sessionId;
    selectedDocumentIds.value = [];
    messageForm.selectedDocumentIdsText = '';
    traceForm.sessionId = detailData.sessionId;
    setSuccess(`已打开会话 ${detailData.sessionId}`);
    void scrollMessageThreadToBottom();
  } catch (error) {
    setError(error);
  } finally {
    loading.sessionDetail = false;
  }
}

// 回显只查询当前用户对助手消息的反馈状态，不在前端聚合其他用户反馈。
async function loadMessageFeedbacks(detailData: ChatSessionDetailData): Promise<void> {
  feedbackMap.value = {};
  if (!canViewFeedback.value) {
    return;
  }
  const assistantMessages = detailData.messageList.filter((message) =>
    message.role === 'assistant' && message.messageStatus === 'succeeded' && !message.messageId.startsWith('tmp_'),
  );
  const entries = await Promise.allSettled(assistantMessages.map(async (message) => {
    const feedback = await chatApi.getMessageFeedback(detailData.sessionId, message.messageId);
    return [message.messageId, feedback] as const;
  }));
  const nextFeedbackMap: Record<string, ChatFeedbackData> = {};
  entries.forEach((entry) => {
    if (entry.status === 'fulfilled') {
      const [messageId, feedback] = entry.value;
      nextFeedbackMap[messageId] = feedback;
    }
  });
  feedbackMap.value = nextFeedbackMap;
}

// 创建知识库会话，首问发送仍由消息接口处理以保持后端状态流转一致。
async function handleCreateSession(silent = false): Promise<string> {
  if (!silent) {
    resetFeedback();
  }
  loading.creating = true;
  try {
    if (!createSessionForm.bindingObjectId.trim()) {
      throw new Error('知识库 ID 不能为空');
    }

    // 创建会话只保存绑定关系，首问仍走发送消息接口，避免前端误判状态。
    const createdSession = await chatApi.createSession({
      chatMode: createSessionForm.chatMode,
      bindingObjectType: createSessionForm.bindingObjectType,
      bindingObjectId: createSessionForm.bindingObjectId.trim(),
      knowledgeBindingType: normalizeOptionalText(createSessionForm.knowledgeBindingType) ?? null,
      knowledgeBindingIds: splitTextToIds(createSessionForm.knowledgeBindingIdsText),
      firstMessageContent: normalizeOptionalText(createSessionForm.firstMessageContent) ?? null,
    });
    messageForm.sessionId = createdSession.sessionId;
    traceForm.sessionId = createdSession.sessionId;
    if (!silent) {
      setSuccess(`会话创建成功：${createdSession.sessionId}`);
    }
    await handlePageSessions(true);
    await loadSessionDetail(createdSession.sessionId);
    return createdSession.sessionId;
  } catch (error) {
    setError(error);
    throw error;
  } finally {
    loading.creating = false;
  }
}

// 发送前确保存在会话，支持用户在新聊天界面直接提问。
async function ensureSessionBeforeSend(): Promise<string> {
  const currentSessionId = messageForm.sessionId.trim();
  if (currentSessionId) {
    return currentSessionId;
  }
  return handleCreateSession(true);
}

// 发送用户问题并回填回答、引用和执行链路查询所需的标识。
async function handleSendMessage(): Promise<void> {
  resetFeedback();
  loading.sending = true;
  try {
    const question = messageForm.messageContent.trim();
    if (!question) {
      throw new Error('请输入问题内容');
    }

    const sessionId = await ensureSessionBeforeSend();
    resetTypewriterQueue();
    streamingMessages.value = [
      createTemporaryMessage('user', question),
      createTemporaryMessage('assistant', ''),
    ];
    showAssistantThinking();
    void scrollMessageThreadToBottom();
    messageForm.messageContent = '';
    const replyData = await chatApi.streamMessage(sessionId, {
      messageContent: question,
      selectedDocumentIds: splitTextToIds(messageForm.selectedDocumentIdsText),
      templateVariables: parseTemplateVariables(messageForm.templateVariablesText),
    }, {
      onStart: showAssistantThinking,
      onChunk: ({ delta }) => appendStreamingReply(delta),
      onDone: completeStreamingReply,
      onError: ({ message }) => {
        throw new Error(message);
      },
    });
    await waitForTypewriterIdle();
    latestReply.value = replyData;
    traceForm.sessionId = replyData.sessionId;
    traceForm.messageId = replyData.assistantMessageId;
    traceForm.executionId = replyData.executionSummary?.executionId ?? traceForm.executionId;
    setSuccess('回答已生成');
    await loadSessionDetail(sessionId);
    await handlePageSessions(true);
  } catch (error) {
    resetTypewriterQueue();
    const assistantMessage = streamingMessages.value.find((message) => message.role === 'assistant');
    if (assistantMessage) {
      assistantMessage.messageStatus = 'failed';
    }
    setError(error);
  } finally {
    loading.sending = false;
  }
}

// 查询助手消息引用，支持从消息气泡快捷带入消息 ID。
async function handleLoadCitations(messageId = traceForm.messageId): Promise<void> {
  loading.citations = true;
  try {
    const sessionId = traceForm.sessionId.trim() || activeSessionId.value;
    if (!sessionId) {
      throw new Error('查询引用时，会话 ID 不能为空');
    }
    if (!messageId.trim()) {
      throw new Error('查询引用时，消息 ID 不能为空');
    }

    const citationList = await chatApi.getCitations(sessionId, messageId);
    citations.value = citationList;
    traceForm.sessionId = sessionId;
    traceForm.messageId = messageId;
    inspectorTab.value = 'citations';
  } catch (error) {
    setError(error);
  } finally {
    loading.citations = false;
  }
}

// 查询执行链路详情，供右侧面板排查检索与模型调用状态。
async function handleLoadExecution(): Promise<void> {
  resetFeedback();
  loading.execution = true;
  try {
    if (!traceForm.executionId.trim()) {
      throw new Error('执行记录 ID 不能为空');
    }

    const detailData = await chatApi.getExecutionDetail(traceForm.executionId);
    executionDetail.value = detailData;
    inspectorTab.value = 'execution';
    setSuccess(`已加载执行记录 ${detailData.executionId}`);
  } catch (error) {
    setError(error);
  } finally {
    loading.execution = false;
  }
}

// 点赞点踩支持重复覆盖，后端按当前用户和助手消息保证幂等更新。
async function submitMessageFeedback(
  message: ChatMessageItem,
  feedbackType: ChatFeedbackType,
  feedbackContent = '',
): Promise<void> {
  const sessionId = activeSessionId.value;
  if (!sessionId) {
    setError(new Error('提交反馈时，会话 ID 不能为空'));
    return;
  }
  feedbackSubmittingMessageId.value = message.messageId;
  try {
    const feedback = await chatApi.submitFeedback(sessionId, message.messageId, {
      feedbackType,
      feedbackContent: feedbackContent.trim() || null,
    });
    feedbackMap.value = {
      ...feedbackMap.value,
      [message.messageId]: feedback,
    };
    setSuccess(`已${feedbackTypeText(feedbackType)}`);
  } catch (error) {
    setError(error);
  } finally {
    feedbackSubmittingMessageId.value = '';
  }
}

// 打开补充说明弹窗时回填已有反馈，避免用户二次编辑丢失原说明。
function openFeedbackDialog(message: ChatMessageItem, feedbackType: ChatFeedbackType): void {
  const currentFeedback = feedbackMap.value[message.messageId];
  feedbackForm.sessionId = activeSessionId.value;
  feedbackForm.messageId = message.messageId;
  feedbackForm.feedbackType = feedbackType;
  feedbackForm.feedbackContent = currentFeedback?.feedbackContent ?? '';
  feedbackDialogVisible.value = true;
}

// 提交弹窗中的补充说明，消息不存在时提示刷新而不是构造错误请求。
async function submitFeedbackDialog(): Promise<void> {
  const message = activeMessages.value.find((item) => item.messageId === feedbackForm.messageId);
  if (!message) {
    setError(new Error('反馈消息不存在，请刷新会话后重试'));
    return;
  }
  await submitMessageFeedback(message, feedbackForm.feedbackType, feedbackForm.feedbackContent);
  feedbackDialogVisible.value = false;
}

// 新建对话只清理当前工作区状态，不影响左侧历史列表。
function handleNewChat(): void {
  resetFeedback();
  sessionDetail.value = null;
  resetTypewriterQueue();
  streamingMessages.value = [];
  latestReply.value = null;
  citations.value = [];
  executionDetail.value = null;
  traceForm.sessionId = '';
  traceForm.messageId = '';
  traceForm.executionId = '';
  messageForm.sessionId = '';
  messageForm.messageContent = '';
  selectedDocumentIds.value = [];
  messageForm.selectedDocumentIdsText = '';
  settingsDrawerVisible.value = false;
}

onMounted(() => {
  void handlePageSessions(true);
  void loadKnowledgeBaseOptions();
});
</script>

<template>
  <div class="chat-page">
    <aside class="chat-sidebar">
      <div class="chat-sidebar__head">
        <div>
          <h2>智能问答</h2>
          <span>{{ sessionTotal }} 个会话</span>
        </div>
        <button class="icon-button" type="button" title="新建对话" @click="handleNewChat">
          <Icon icon="lucide:plus" aria-hidden="true" />
        </button>
      </div>

      <label class="chat-search">
        <Icon icon="lucide:search" aria-hidden="true" />
        <input v-model="sessionPageForm.keyword" placeholder="搜索会话" @keyup.enter="handlePageSessions()" />
      </label>

      <div class="chat-filters">
        <select v-model="sessionPageForm.retentionStatus" @change="handlePageSessions()">
          <option value="">全部</option>
          <option value="hot">热数据</option>
          <option value="cold">冷数据</option>
        </select>
        <button class="ghost-button" type="button" :disabled="loading.paging" @click="handlePageSessions()">
          <Icon icon="lucide:refresh-cw" aria-hidden="true" />
          刷新
        </button>
      </div>

      <div class="session-list">
        <button
          v-for="row in sessionRows"
          :key="row.sessionId"
          class="session-item"
          :class="{ 'session-item--active': row.sessionId === activeSessionId }"
          type="button"
          @click="loadSessionDetail(row.sessionId)"
        >
          <span class="session-item__title">{{ row.titleSummary || '未命名会话' }}</span>
          <span class="session-item__preview">{{ row.lastMessagePreview || row.bindingObjectName }}</span>
          <span class="session-item__meta">
            <span>{{ statusText(row.sessionStatus) }}</span>
            <span>{{ formatTime(row.lastMessageTime) }}</span>
          </span>
        </button>
        <div v-if="!sessionRows.length" class="sidebar-empty">
          <Icon icon="lucide:messages-square" aria-hidden="true" />
          <span>暂无会话</span>
        </div>
      </div>
    </aside>

    <main class="chat-main">
      <header class="chat-header">
        <div>
          <span class="chat-header__eyebrow">知识库聊天</span>
          <h1>{{ sessionDetail?.bindingObjectName || '开始新的对话' }}</h1>
        </div>
        <div class="chat-header__actions">
          <div class="chat-header__meta">
            <span v-if="sessionDetail">{{ statusText(sessionDetail.sessionStatus) }}</span>
            <span v-if="activeSessionId">ID {{ activeSessionId }}</span>
          </div>
          <button class="ghost-button" type="button" @click="settingsDrawerVisible = true">
            <Icon icon="lucide:sliders-horizontal" aria-hidden="true" />
            设置
          </button>
        </div>
      </header>

      <div v-if="successMessage || errorMessage" class="chat-feedback" :class="{ 'chat-feedback--error': errorMessage }">
        <Icon :icon="errorMessage ? 'lucide:circle-alert' : 'lucide:circle-check'" aria-hidden="true" />
        <span>{{ errorMessage || successMessage }}</span>
      </div>

      <section v-if="isCreatingSession" class="session-setup">
        <label>
          <span>知识库</span>
          <el-select
            v-model="createSessionForm.bindingObjectId"
            class="chat-select"
            :disabled="loading.knowledgeBases || !hasKnowledgeBaseOptions"
            filterable
            placeholder="请选择新会话知识库"
            @change="handleKnowledgeBaseChange"
          >
            <el-option
              v-for="base in knowledgeBaseOptions"
              :key="base.knowledgeBaseId"
              :label="knowledgeBaseLabel(base)"
              :value="String(base.knowledgeBaseId)"
            />
          </el-select>
          <small v-if="knowledgeBaseOptionMessage">{{ knowledgeBaseOptionMessage }}</small>
        </label>
        <label>
          <span>文档范围</span>
          <el-select
            v-model="selectedDocumentIds"
            class="chat-select"
            :disabled="loading.documents || !createSessionForm.bindingObjectId || !hasDocumentOptions"
            filterable
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="默认全部文档"
            @change="handleSelectedDocumentChange"
          >
            <el-option
              v-for="document in documentOptions"
              :key="document.documentId"
              :label="documentLabel(document)"
              :value="String(document.documentId)"
            />
          </el-select>
          <small v-if="documentOptionMessage">{{ documentOptionMessage }}</small>
        </label>
      </section>

      <section ref="messageThreadRef" class="message-thread" :class="{ 'message-thread--empty': !activeMessages.length }">
        <div v-if="!activeMessages.length" class="empty-chat">
          <Icon icon="lucide:sparkles" aria-hidden="true" />
          <h2>选择会话，或直接提问</h2>
          <p>新会话先选择知识库，发送后回答会按流式方式展示。</p>
        </div>

        <article
          v-for="message in activeMessages"
          :key="message.messageId"
          class="message-row"
          :class="`message-row--${message.role}`"
        >
          <div class="message-avatar">
            <Icon :icon="message.role === 'user' ? 'lucide:user' : 'lucide:bot'" aria-hidden="true" />
          </div>
          <div class="message-card">
            <div class="message-card__meta">
              <span>{{ message.role === 'user' ? '我' : '助手' }}</span>
              <time>{{ formatTime(message.createdTime) }}</time>
              <span v-if="message.messageStatus === 'failed'" class="message-status message-status--failed">失败</span>
            </div>
            <p class="message-card__content">{{ message.content }}</p>
            <div v-if="getVisibleCitationSummary(message).length" class="citation-chips">
              <button
                v-for="citation in getVisibleCitationSummary(message)"
                :key="citation.citationId"
                type="button"
                class="citation-chip"
                @click="handleLoadCitations(message.messageId)"
              >
                <Icon icon="lucide:file-search" aria-hidden="true" />
                {{ citation.documentName }}
              </button>
            </div>
            <div v-if="canRenderFeedbackAction(message)" class="message-feedback-actions">
              <button
                type="button"
                class="feedback-chip"
                :class="{ 'feedback-chip--active': isFeedbackActive(message.messageId, 'like') }"
                :disabled="feedbackSubmittingMessageId === message.messageId"
                @click="submitMessageFeedback(message, 'like')"
              >
                <Icon icon="lucide:thumbs-up" aria-hidden="true" />
                点赞
              </button>
              <button
                type="button"
                class="feedback-chip"
                :class="{ 'feedback-chip--active': isFeedbackActive(message.messageId, 'dislike') }"
                :disabled="feedbackSubmittingMessageId === message.messageId"
                @click="submitMessageFeedback(message, 'dislike')"
              >
                <Icon icon="lucide:thumbs-down" aria-hidden="true" />
                点踩
              </button>
              <button
                type="button"
                class="feedback-chip"
                :disabled="feedbackSubmittingMessageId === message.messageId"
                @click="openFeedbackDialog(message, feedbackMap[message.messageId]?.feedbackType || 'like')"
              >
                <Icon icon="lucide:message-square-pen" aria-hidden="true" />
                说明
              </button>
            </div>
          </div>
        </article>
      </section>

      <form class="composer" @submit.prevent="handleSendMessage">
        <div class="composer__input">
          <textarea
            v-model="messageForm.messageContent"
            :placeholder="isCreatingSession ? '先选择知识库，再输入问题' : '输入问题，按发送提交'"
            :disabled="loading.sending"
          />
          <button class="send-button" type="submit" :disabled="!canSendMessage">
            <Icon :icon="loading.sending ? 'lucide:loader-circle' : 'lucide:send-horizontal'" aria-hidden="true" />
            {{ loading.sending ? '生成中' : '发送' }}
          </button>
        </div>
      </form>

      <el-drawer v-model="settingsDrawerVisible" title="会话设置" direction="rtl" size="420px">
        <div class="settings-panel">
          <section class="settings-section">
            <h3>新会话绑定</h3>
            <label>
              <span>知识库</span>
              <el-select
                v-model="createSessionForm.bindingObjectId"
                class="chat-select"
                :disabled="!isCreatingSession || loading.knowledgeBases || !hasKnowledgeBaseOptions"
                filterable
                placeholder="请选择知识库"
                @change="handleKnowledgeBaseChange"
              >
                <el-option
                  v-for="base in knowledgeBaseOptions"
                  :key="base.knowledgeBaseId"
                  :label="knowledgeBaseLabel(base)"
                  :value="String(base.knowledgeBaseId)"
                />
              </el-select>
              <small v-if="activeSessionId">当前会话已绑定知识库，后续提问不再重复选择。</small>
              <small v-else-if="knowledgeBaseOptionMessage">{{ knowledgeBaseOptionMessage }}</small>
            </label>
            <label>
              <span>文档范围</span>
              <el-select
                v-model="selectedDocumentIds"
                class="chat-select"
                :disabled="loading.documents || !createSessionForm.bindingObjectId || !hasDocumentOptions"
                filterable
                multiple
                collapse-tags
                collapse-tags-tooltip
                placeholder="默认全部文档"
                @change="handleSelectedDocumentChange"
              >
                <el-option
                  v-for="document in documentOptions"
                  :key="document.documentId"
                  :label="documentLabel(document)"
                  :value="String(document.documentId)"
                />
              </el-select>
              <small v-if="documentOptionMessage">{{ documentOptionMessage }}</small>
            </label>
          </section>

          <section class="settings-section">
            <h3>高级参数</h3>
            <label>
              <span>会话 ID</span>
              <input v-model="messageForm.sessionId" placeholder="留空则自动创建" />
            </label>
            <label>
              <span>知识绑定类型</span>
              <input v-model="createSessionForm.knowledgeBindingType" placeholder="可为空" />
            </label>
            <label>
              <span>知识绑定 ID</span>
              <el-select
                v-model="knowledgeBindingIds"
                class="chat-select"
                :disabled="loading.knowledgeBases || !hasKnowledgeBaseOptions"
                filterable
                multiple
                collapse-tags
                collapse-tags-tooltip
                placeholder="可选，选择知识库"
                @change="handleKnowledgeBindingChange"
              >
                <el-option
                  v-for="base in knowledgeBaseOptions"
                  :key="base.knowledgeBaseId"
                  :label="knowledgeBaseLabel(base)"
                  :value="String(base.knowledgeBaseId)"
                />
              </el-select>
            </label>
            <label>
              <span>模板变量 JSON</span>
              <textarea v-model="messageForm.templateVariablesText" rows="5" />
            </label>
          </section>
        </div>
      </el-drawer>

      <el-dialog v-model="feedbackDialogVisible" title="补充反馈说明" width="520px" align-center>
        <el-form :model="feedbackForm" label-position="top">
          <el-form-item label="反馈类型">
            <el-radio-group v-model="feedbackForm.feedbackType">
              <el-radio-button label="like">点赞</el-radio-button>
              <el-radio-button label="dislike">点踩</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="反馈说明">
            <el-input
              v-model="feedbackForm.feedbackContent"
              type="textarea"
              maxlength="1000"
              show-word-limit
              :rows="5"
              placeholder="可填写回答准确性、引用质量或改进建议"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="feedbackDialogVisible = false">取消</el-button>
          <el-button
            type="primary"
            :loading="feedbackSubmittingMessageId === feedbackForm.messageId"
            @click="submitFeedbackDialog"
          >
            提交
          </el-button>
        </template>
      </el-dialog>
    </main>

    <aside class="inspector">
      <div class="inspector__tabs">
        <button type="button" :class="{ active: inspectorTab === 'citations' }" @click="inspectorTab = 'citations'">
          引用
        </button>
        <button type="button" :class="{ active: inspectorTab === 'execution' }" @click="inspectorTab = 'execution'">
          执行
        </button>
        <button type="button" :class="{ active: inspectorTab === 'json' }" @click="inspectorTab = 'json'">
          数据
        </button>
      </div>

      <section v-if="inspectorTab === 'citations'" class="inspector-panel">
        <div class="inspector-panel__head">
          <h3>引用明细</h3>
          <button class="ghost-button" type="button" :disabled="loading.citations" @click="handleLoadCitations()">
            <Icon icon="lucide:search" aria-hidden="true" />
            查询
          </button>
        </div>
        <label class="trace-field">
          <span>消息 ID</span>
          <input v-model="traceForm.messageId" placeholder="助手消息 ID" />
        </label>
        <div v-if="visibleCitations.length" class="citation-list">
          <article v-for="citation in visibleCitations" :key="citation.citationId" class="citation-card">
            <strong>{{ citation.documentName }}</strong>
            <span>文档版本 {{ citation.quotedDocumentVersion }} / 处理版本 {{ citation.quotedProcessingVersion }}</span>
            <p>{{ citation.snippet || '无片段摘要' }}</p>
          </article>
        </div>
        <p v-else class="empty-panel">暂无可展示来源。</p>
      </section>

      <section v-else-if="inspectorTab === 'execution'" class="inspector-panel">
        <div class="inspector-panel__head">
          <h3>执行记录</h3>
          <button class="ghost-button" type="button" :disabled="loading.execution" @click="handleLoadExecution">
            <Icon icon="lucide:search" aria-hidden="true" />
            查询
          </button>
        </div>
        <label class="trace-field">
          <span>执行记录 ID</span>
          <input v-model="traceForm.executionId" placeholder="从回答摘要中获取" />
        </label>
        <div v-if="executionDetail" class="execution-summary">
          <div><span>阶段</span><strong>{{ statusText(executionDetail.stageCode) }}</strong></div>
          <div><span>TopK / TopN</span><strong>{{ executionDetail.topK }} / {{ executionDetail.topN }}</strong></div>
          <div><span>命中文档</span><strong>{{ executionDetail.hitDocumentCount }}</strong></div>
          <div><span>命中分块</span><strong>{{ executionDetail.hitChunkCount }}</strong></div>
          <p v-if="executionDetail.failureReason">{{ executionDetail.failureReason }}</p>
        </div>
        <p v-else class="empty-panel">发送消息后可用执行记录 ID 查看链路。</p>
      </section>

      <section v-else class="inspector-panel">
        <h3>原始数据</h3>
        <pre class="json-viewer">{{ formatJson({ sessionDetail, latestReply, citations, executionDetail }) }}</pre>
      </section>
    </aside>
  </div>
</template>

<style scoped>
:global(.admin-main--chat) {
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

:global(.admin-content--chat) {
  display: flex;
  flex: 1 1 0;
  height: 0;
  min-height: 0;
  overflow: hidden;
  padding: 12px;
}

.chat-page {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr) minmax(280px, 340px);
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #f8fafc;
}

.chat-sidebar,
.inspector {
  min-width: 0;
  min-height: 0;
  background: #ffffff;
}

.chat-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #d9e2ec;
}

.chat-sidebar__head,
.chat-header,
.inspector-panel__head,
.composer__input,
.chat-filters,
.message-card__meta {
  display: flex;
  align-items: center;
}

.chat-sidebar__head {
  justify-content: space-between;
  padding: 18px;
}

.chat-sidebar__head h2,
.chat-header h1,
.inspector-panel h3 {
  margin: 0;
  color: #102033;
}

.chat-sidebar__head h2 {
  font-size: 18px;
}

.chat-sidebar__head span,
.session-item__meta,
.chat-header__eyebrow,
.chat-header__meta,
.message-card__meta,
.trace-field span,
.composer__settings span,
.execution-summary span,
.empty-panel,
.sidebar-empty,
.empty-chat p {
  color: #66788a;
  font-size: 12px;
}

.icon-button,
.ghost-button,
.send-button,
.session-item,
.citation-chip,
.feedback-chip,
.inspector__tabs button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.icon-button {
  width: 36px;
  height: 36px;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  color: #ffffff;
  background: #1d4ed8;
}

.chat-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 14px 12px;
  padding: 9px 12px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #f8fafc;
}

.chat-search input,
.trace-field input,
.composer__settings input,
.composer__settings select,
.composer__settings textarea {
  width: 100%;
  border: 0;
  outline: 0;
  color: #102033;
  background: transparent;
}

.chat-filters {
  gap: 8px;
  padding: 0 14px 12px;
}

.chat-filters select {
  min-width: 0;
  flex: 1;
  height: 34px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  color: #102033;
  background: #ffffff;
}

.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  color: #1f3a5f;
  background: #ffffff;
}

.session-list {
  flex: 1;
  overflow: auto;
  padding: 4px 10px 14px;
}

.session-item {
  display: grid;
  width: 100%;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  text-align: left;
  color: #102033;
  background: transparent;
}

.session-item:hover,
.session-item--active {
  background: #eef4ff;
}

.session-item__title,
.session-item__preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item__title {
  font-weight: 700;
}

.session-item__preview {
  color: #52677a;
  font-size: 13px;
}

.session-item__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-empty,
.empty-chat,
.empty-panel {
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 28px 14px;
  text-align: center;
}

.chat-main {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #f8fafc;
}

.chat-header {
  grid-row: 1;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid #d9e2ec;
  background: rgba(255, 255, 255, 0.86);
}

.chat-header h1 {
  margin-top: 2px;
  font-size: 20px;
}

.chat-header__meta {
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.chat-header__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.chat-header__meta span {
  padding: 5px 9px;
  border-radius: 999px;
  background: #e7eef7;
}

.chat-feedback {
  position: absolute;
  top: 76px;
  right: 24px;
  left: 24px;
  z-index: 4;
  max-height: 72px;
  overflow: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  color: #0f5132;
  background: #dff7ea;
  box-shadow: 0 12px 28px rgba(16, 32, 51, 0.12);
}

.chat-feedback--error {
  color: #842029;
  background: #fde2e1;
}

.session-setup {
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(260px, 1fr);
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid #d9e2ec;
  background: #ffffff;
}

.session-setup label,
.settings-section label {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.session-setup span,
.settings-section span {
  color: #52677a;
  font-size: 12px;
  font-weight: 700;
}

.session-setup small,
.settings-section small {
  color: #66788a;
  font-size: 12px;
  line-height: 1.5;
}

.message-thread {
  grid-row: 3;
  min-height: 0;
  overflow: auto;
  padding: 22px 24px 24px;
}

.message-thread--empty {
  display: flex;
  flex-direction: column;
}

.empty-chat {
  max-width: 460px;
  margin: auto;
}

.empty-chat svg {
  width: 40px;
  height: 40px;
  color: #1d4ed8;
}

.empty-chat h2 {
  margin: 0;
  color: #102033;
  font-size: 22px;
}

.message-row {
  display: flex;
  gap: 12px;
  max-width: 880px;
  margin: 0 auto 18px;
}

.message-row--user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: #1f3a5f;
  background: #e7eef7;
}

.message-row--assistant .message-avatar {
  color: #14532d;
  background: #dcfce7;
}

.message-card {
  max-width: min(680px, 78%);
  padding: 12px 14px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(16, 32, 51, 0.06);
}

.message-row--user .message-card {
  color: #ffffff;
  border-color: #1d4ed8;
  background: #1d4ed8;
}

.message-row--user .message-card__meta,
.message-row--user .message-card__content {
  color: #ffffff;
}

.message-card__meta {
  gap: 8px;
}

.message-status--failed {
  color: #b42318;
}

.message-card__content {
  margin: 8px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
  color: #102033;
}

.citation-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.citation-chip,
.feedback-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border: 1px solid #c8d5e3;
  border-radius: 999px;
  color: #1f3a5f;
  background: #f8fafc;
}

.message-feedback-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.feedback-chip--active {
  border-color: #1d4ed8;
  color: #1d4ed8;
  background: #eef4ff;
}

.composer {
  grid-row: 4;
  position: relative;
  z-index: 5;
  width: 100%;
  margin: 0;
  padding: 14px 20px 18px;
  border-top: 1px solid #d9e2ec;
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
  border-radius: 0;
  background: #ffffff;
  box-shadow: 0 -12px 32px rgba(16, 32, 51, 0.08);
}

.composer__settings {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(180px, 1fr) auto;
  gap: 10px;
  align-items: start;
  margin-bottom: 12px;
}

.composer__settings label,
.trace-field {
  display: grid;
  gap: 5px;
}

.composer__settings .chat-select {
  width: 100%;
}

.composer__settings small {
  color: #66788a;
  font-size: 12px;
  line-height: 1.5;
}

.composer__settings input,
.composer__settings textarea,
.trace-field input {
  min-height: 34px;
  padding: 8px 10px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #f8fafc;
}

.composer__settings details {
  position: relative;
  min-width: 132px;
}

.composer__settings summary {
  min-height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  color: #1f3a5f;
  list-style: none;
  cursor: pointer;
}

.advanced-grid {
  position: absolute;
  right: 0;
  bottom: 42px;
  z-index: 5;
  width: min(520px, 80vw);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(16, 32, 51, 0.16);
}

.advanced-grid__full {
  grid-column: 1 / -1;
}

.composer__input {
  gap: 12px;
  align-items: stretch;
  width: min(900px, 100%);
  margin: 0 auto;
  padding: 8px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #f8fafc;
}

.composer__input textarea {
  flex: 1;
  min-height: 56px;
  max-height: 150px;
  overflow-y: auto;
  resize: vertical;
  border: 0;
  outline: 0;
  background: transparent;
  color: #102033;
  font: inherit;
}

.send-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 96px;
  min-height: 44px;
  align-self: flex-end;
  border-radius: 8px;
  color: #ffffff;
  background: #1d4ed8;
}

.settings-panel {
  display: grid;
  gap: 16px;
}

.settings-section {
  display: grid;
  gap: 12px;
}

.settings-section h3 {
  margin: 0;
  color: #102033;
  font-size: 15px;
}

.settings-section input,
.settings-section textarea {
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  outline: 0;
  color: #102033;
  background: #f8fafc;
}

.settings-section textarea {
  resize: vertical;
}

.send-button:disabled,
.ghost-button:disabled,
.icon-button:disabled,
.feedback-chip:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.inspector {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border-left: 1px solid #d9e2ec;
}

.inspector__tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 10px;
  gap: 6px;
  border-bottom: 1px solid #d9e2ec;
}

.inspector__tabs button {
  min-height: 34px;
  border-radius: 8px;
  color: #52677a;
  background: transparent;
}

.inspector__tabs button.active {
  color: #102033;
  background: #eef4ff;
}

.inspector-panel {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.inspector-panel__head {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.citation-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.citation-card {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #f8fafc;
}

.citation-card strong {
  overflow-wrap: anywhere;
  word-break: break-word;
  color: #102033;
}

.citation-card span,
.citation-card p {
  margin: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: #66788a;
  font-size: 12px;
  line-height: 1.6;
}

.execution-summary {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.execution-summary div {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px solid #edf2f7;
}

.execution-summary strong {
  color: #102033;
}

.execution-summary p {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  color: #842029;
  background: #fde2e1;
}

.json-viewer {
  overflow: auto;
  max-height: 560px;
  margin: 12px 0 0;
  padding: 12px;
  border-radius: 8px;
  color: #dbeafe;
  background: #102033;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1180px) {
  .chat-page {
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  }

  .inspector {
    display: none;
  }
}

@media (max-width: 820px) {
  :global(.admin-shell--chat .admin-sidebar) {
    display: none;
  }

  :global(.admin-main--chat) {
    height: 100dvh;
  }

  .chat-page {
    grid-template-columns: 1fr;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .chat-sidebar {
    display: none;
  }

  .chat-main {
    height: 100%;
    min-height: 0;
  }

  .chat-header {
    padding: 12px 14px;
  }

  .chat-header__actions {
    align-items: flex-end;
    flex-direction: column;
  }

  .chat-header h1 {
    font-size: 17px;
  }

  .chat-feedback {
    margin: 8px 12px 0;
  }

  .message-thread {
    min-height: 0;
    padding: 14px 12px;
  }

  .session-setup {
    grid-template-columns: 1fr;
    padding: 10px 12px;
  }

  .empty-chat {
    padding: 18px 12px;
  }

  .empty-chat h2 {
    font-size: 18px;
  }

  .composer__settings,
  .advanced-grid {
    grid-template-columns: 1fr;
  }

  .composer {
    margin: 0;
    padding: 10px 12px;
    box-shadow: 0 -10px 28px rgba(16, 32, 51, 0.08);
  }

  .composer__settings {
    gap: 8px;
    margin-bottom: 8px;
  }

  .composer__input {
    align-items: stretch;
  }

  .composer__input textarea {
    min-height: 52px;
  }

  .send-button {
    min-width: 78px;
  }

  .advanced-grid {
    position: static;
    width: auto;
    margin-top: 8px;
  }

  .message-card {
    max-width: 86%;
  }
}
</style>
