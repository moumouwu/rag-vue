import type {
  ApiSuccessResponse,
  BindingObjectType,
  ChatMode,
  MessageRole,
  MessageStatus,
  Nullable,
  PageData,
  PageRequest,
  RetentionStatus,
  SessionStatus,
  StageCode,
  TemplateVariables,
  TimeRange,
} from './common';
import type { EntityId } from './system';

export interface CreateChatSessionRequest {
  chatMode: ChatMode;
  bindingObjectType: BindingObjectType;
  bindingObjectId: string;
  knowledgeBindingType?: Nullable<string>;
  knowledgeBindingIds?: string[];
  firstMessageContent?: Nullable<string>;
}

export interface CreateChatSessionData {
  sessionId: string;
  sessionStatus: SessionStatus;
  createdTime: string;
}

export type CreateChatSessionResponse = ApiSuccessResponse<CreateChatSessionData>;

export interface ChatSessionPageRequest extends PageRequest {
  keyword?: Nullable<string>;
  chatMode?: ChatMode;
  retentionStatus?: RetentionStatus;
  timeRange?: TimeRange;
}

export interface ChatSessionSummary {
  sessionId: string;
  titleSummary: string;
  chatMode: ChatMode;
  bindingObjectType: BindingObjectType;
  bindingObjectName: string;
  lastMessagePreview?: Nullable<string>;
  lastMessageTime: string;
  sessionStatus: SessionStatus;
  retentionStatus: RetentionStatus;
}

export interface CitationSummaryItem {
  citationId: string;
  knowledgeBaseName: string;
  documentName: string;
  displayRank: number;
}

export interface ChatMessageItem {
  messageId: string;
  parentMessageId?: Nullable<string>;
  role: MessageRole;
  content: string;
  messageStatus: MessageStatus;
  createdTime: string;
  citationSummary?: CitationSummaryItem[];
}

export interface ChatSessionDetailData {
  sessionId: string;
  chatMode: ChatMode;
  bindingObjectType: BindingObjectType;
  bindingObjectName: string;
  knowledgeBindingType?: Nullable<string>;
  knowledgeBindingSummary?: Nullable<string>;
  sessionStatus: SessionStatus;
  retentionStatus: RetentionStatus;
  createdTime: string;
  updatedTime: string;
  messageList: ChatMessageItem[];
}

export type ChatSessionPageResponse = ApiSuccessResponse<PageData<ChatSessionSummary>>;

export type ChatSessionDetailResponse = ApiSuccessResponse<ChatSessionDetailData>;

export interface SendMessageRequest {
  messageContent: string;
  selectedDocumentIds?: string[];
  templateVariables?: TemplateVariables;
}

export interface ExecutionSummary {
  executionId?: string;
  topK?: number;
  topN?: number;
  rerankEnabled?: boolean;
  stageCode?: StageCode;
}

export interface SendMessageData {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  messageStatus: MessageStatus;
  replyContent: string;
  citationSummary?: CitationSummaryItem[];
  executionSummary?: ExecutionSummary;
}

export type SendMessageResponse = ApiSuccessResponse<SendMessageData>;

export interface ChatMessageStreamChunk {
  delta: string;
}

export interface ChatMessageStreamError {
  message: string;
}

export interface ChatMessageStreamHandlers {
  onStart?: () => void;
  onChunk?: (chunk: ChatMessageStreamChunk) => void;
  onDone?: (data: SendMessageData) => void;
  onError?: (error: ChatMessageStreamError) => void;
}

export interface CitationDetailItem {
  citationId: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  documentId: string;
  documentName: string;
  chunkId: string;
  quotedDocumentVersion: string;
  quotedProcessingVersion: number;
  displayRank: number;
  snippet?: string;
}

export type CitationDetailListResponse = ApiSuccessResponse<CitationDetailItem[]>;

export interface ChatExecutionDetailData {
  executionId: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId?: Nullable<string>;
  chatMode: ChatMode;
  bindingObjectType: BindingObjectType;
  bindingObjectId?: Nullable<string>;
  modelConfigId?: string;
  selectedDocumentIdsJson: string;
  topK: number;
  topN: number;
  rerankEnabled: boolean;
  memoryRoundsUsed: number;
  reRetrieved: boolean;
  hitDocumentCount: number;
  hitChunkCount: number;
  contextTruncated: boolean;
  requestTime: string;
  responseTime: string;
  stageCode: StageCode;
  failureReason?: Nullable<string>;
}

export type ChatExecutionDetailResponse = ApiSuccessResponse<ChatExecutionDetailData>;

export type ChatConfigSavePayload = {
  retentionEnabled: boolean;
  retentionDays: number;
  memoryEnabled: boolean;
  memoryRounds: number;
  memoryMaxRounds: number;
  contextTruncationEnabled: boolean;
  contextTokenBudget: number;
  remark?: Nullable<string>;
};

export interface ChatConfigData extends ChatConfigSavePayload {
  configId?: Nullable<string>;
  summaryEnabled: boolean;
}

export type ChatConfigResponse = ApiSuccessResponse<ChatConfigData>;

export type PromptTemplateStatus = 'enabled' | 'disabled';

export type PromptTemplateKnowledgeBindingType = 'none' | 'knowledge_base';

export interface PromptTemplateQuery extends PageRequest {
  keyword?: Nullable<string>;
  scenarioCode?: Nullable<string>;
  knowledgeBindingType?: Nullable<PromptTemplateKnowledgeBindingType | ''>;
  templateStatus?: Nullable<PromptTemplateStatus | ''>;
}

export interface PromptTemplatePayload {
  templateCode?: string;
  templateName: string;
  scenarioCode?: Nullable<string>;
  templateContent: string;
  variableDefinitions: unknown;
  knowledgeBindingType?: Nullable<PromptTemplateKnowledgeBindingType>;
  knowledgeBindingIds?: unknown;
  templateStatus: PromptTemplateStatus;
  remark?: Nullable<string>;
}

export type PromptTemplateCreatePayload = PromptTemplatePayload & {
  templateCode: string;
};

export type PromptTemplateUpdatePayload = Omit<PromptTemplatePayload, 'templateCode'>;

export interface PromptTemplateStatusUpdatePayload {
  templateStatus: PromptTemplateStatus;
}

export interface PromptTemplateItem {
  promptTemplateId: EntityId;
  templateCode: string;
  templateName: string;
  scenarioCode?: Nullable<string>;
  templateContent: string;
  variableDefinitions: unknown;
  knowledgeBindingType?: Nullable<PromptTemplateKnowledgeBindingType>;
  knowledgeBindingIds?: unknown;
  templateStatus: PromptTemplateStatus;
  available: boolean;
  remark?: Nullable<string>;
  createdBy?: Nullable<EntityId>;
  createdByName?: Nullable<string>;
  createdAt?: Nullable<string>;
  updatedBy?: Nullable<EntityId>;
  updatedByName?: Nullable<string>;
  updatedAt?: Nullable<string>;
}

export type PromptTemplatePageResponse = ApiSuccessResponse<PageData<PromptTemplateItem>>;

export type ChatFeedbackType = 'like' | 'dislike';

export interface SubmitChatFeedbackPayload {
  feedbackType: ChatFeedbackType;
  feedbackContent?: Nullable<string>;
}

export interface ChatFeedbackData {
  feedbackSubmitted: boolean;
  feedbackId?: Nullable<string>;
  sessionId: string;
  assistantMessageId: string;
  feedbackType?: Nullable<ChatFeedbackType>;
  feedbackContent?: Nullable<string>;
  createdTime?: Nullable<string>;
  updatedTime?: Nullable<string>;
}

export interface ChatFeedbackPageRequest extends PageRequest {
  sessionId?: Nullable<string>;
  assistantMessageId?: Nullable<string>;
  feedbackType?: Nullable<ChatFeedbackType | ''>;
  timeRange?: TimeRange;
}

export interface ChatFeedbackPageItem {
  feedbackId: string;
  sessionId: string;
  assistantMessageId: string;
  sessionTitleSummary?: Nullable<string>;
  sessionBindingObjectName?: Nullable<string>;
  sessionChatMode?: Nullable<ChatMode>;
  userMessagePreview?: Nullable<string>;
  assistantMessagePreview?: Nullable<string>;
  feedbackType: ChatFeedbackType;
  feedbackContent?: Nullable<string>;
  feedbackUserId?: Nullable<string>;
  feedbackUserName?: Nullable<string>;
  createdTime: string;
  updatedTime: string;
}

export type ChatFeedbackPageResponse = ApiSuccessResponse<PageData<ChatFeedbackPageItem>>;

export interface ChatAnswerMetricsQuery {
  timeRange?: TimeRange;
  knowledgeBaseId?: Nullable<string>;
  modelConfigId?: Nullable<string>;
  templateId?: Nullable<string>;
}

export interface ChatAnswerMetricsData {
  totalAnswerCount: number;
  successCount: number;
  failureCount: number;
  likeCount: number;
  dislikeCount: number;
  feedbackRate: number | string;
}

export type ChatAnswerMetricsResponse = ApiSuccessResponse<ChatAnswerMetricsData>;
