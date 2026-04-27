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
  assistantMessageId: string;
  modelConfigId?: string;
  topK: number;
  topN: number;
  rerankEnabled: boolean;
  memoryRoundsUsed: number;
  reRetrieved: boolean;
  contextTruncated: boolean;
  stageCode: StageCode;
  failureReason?: Nullable<string>;
}

export type ChatExecutionDetailResponse = ApiSuccessResponse<ChatExecutionDetailData>;
