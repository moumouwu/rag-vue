export type Nullable<T> = T | null;

export type ChatMode = 'knowledge_base' | 'prompt_template';

export type BindingObjectType = 'knowledge_base' | 'prompt_template';

export type SessionStatus = 'pending' | 'in_progress' | 'archived';

export type RetentionStatus = 'hot' | 'cold';

export type MessageRole = 'user' | 'assistant';

export type MessageStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export type TaskType =
  | 'document_parsing'
  | 'document_chunking'
  | 'document_vectorization'
  | 'document_reprocess'
  | 'batch_reprocess';

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial_success'
  | 'failed'
  | 'canceled';

export type SortOrder = 'asc' | 'desc';

export type StageCode =
  | 'pending'
  | 'auth'
  | 'template'
  | 'retrieval'
  | 'context'
  | 'model'
  | 'persist'
  | 'completed'
  | 'failed';

export interface TimeRange {
  start?: string;
  end?: string;
}

export interface PageRequest {
  pageNo: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface PageData<T> {
  pageNo: number;
  pageSize: number;
  total: number;
  list: T[];
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  retryable: boolean;
  requestId: string;
  stageCode: StageCode;
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type TemplateVariables = Record<string, unknown>;

export type FilterCondition = Record<string, unknown>;
