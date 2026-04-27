import type {
  ApiSuccessResponse,
  FilterCondition,
  Nullable,
  PageData,
  PageRequest,
  TaskStatus,
  TaskType,
  TimeRange,
} from './common';

export interface TaskPageRequest extends PageRequest {
  taskType?: TaskType;
  taskStatus?: TaskStatus;
  knowledgeBaseId?: Nullable<string>;
  documentId?: Nullable<string>;
  triggerSource?: Nullable<string>;
  timeRange?: TimeRange;
}

export interface TaskSummary {
  taskId: string;
  taskType: TaskType;
  taskStatus: TaskStatus;
  progress: number;
  knowledgeBaseName?: Nullable<string>;
  documentName?: Nullable<string>;
  retryCount: number;
  startTime?: Nullable<string>;
  endTime?: Nullable<string>;
}

export type TaskPageResponse = ApiSuccessResponse<PageData<TaskSummary>>;

export interface ChildTaskSummary {
  total?: number;
  succeeded?: number;
  failed?: number;
}

export interface TaskTimelineItem {
  time?: string;
  status?: string;
  message?: string;
}

export interface TaskDetailData {
  taskId: string;
  taskType: TaskType;
  taskStatus: TaskStatus;
  triggerSource?: string;
  failureReason?: Nullable<string>;
  progressDetail?: Nullable<string>;
  childTaskSummary?: ChildTaskSummary;
  timeline?: TaskTimelineItem[];
}

export type TaskDetailResponse = ApiSuccessResponse<TaskDetailData>;

export interface TaskChildPageRequest extends PageRequest {
  taskStatus?: TaskStatus;
}

export interface TaskChildSummaryItem {
  childTaskId: string;
  documentId: string;
  documentName: string;
  taskStatus: TaskStatus;
  failureReason?: Nullable<string>;
  retryCount: number;
}

export type TaskChildPageResponse = ApiSuccessResponse<PageData<TaskChildSummaryItem>>;

export interface TaskRetryData {
  newTaskId: string;
  sourceTaskId: string;
  taskStatus: TaskStatus;
  queuedTime?: Nullable<string>;
}

export type TaskRetryResponse = ApiSuccessResponse<TaskRetryData>;

export interface BatchRerunRequest {
  taskType: TaskType;
  knowledgeBaseId?: Nullable<string>;
  filterCondition?: FilterCondition;
}

export interface BatchRerunData {
  batchTaskId: string;
  taskCount: number;
  taskStatus: TaskStatus;
}

export type BatchRerunResponse = ApiSuccessResponse<BatchRerunData>;
