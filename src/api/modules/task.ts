import { apiRequest } from '../request';
import type {
  BatchRerunData,
  BatchRerunRequest,
  PageData,
  TaskChildPageRequest,
  TaskChildSummaryItem,
  TaskDetailData,
  TaskPageRequest,
  TaskRetryData,
  TaskSummary,
} from '../../types';

const TASK_BASE_PATH = '/api/v1/tasks';

// 任务接口大量依赖路径参数，这里统一做空值保护。
function encodeRequiredId(id: string, fieldName: string): string {
  const value = id.trim();
  if (!value) {
    throw new Error(`${fieldName} 不能为空`);
  }

  return encodeURIComponent(value);
}

export const taskApi = {
  pageTasks(payload: TaskPageRequest): Promise<PageData<TaskSummary>> {
    return apiRequest.post<PageData<TaskSummary>, TaskPageRequest>(`${TASK_BASE_PATH}/page`, payload);
  },
  getTaskDetail(taskId: string): Promise<TaskDetailData> {
    const encodedTaskId = encodeRequiredId(taskId, 'taskId');
    return apiRequest.get<TaskDetailData>(`${TASK_BASE_PATH}/${encodedTaskId}`);
  },
  pageChildTasks(taskId: string, payload: TaskChildPageRequest): Promise<PageData<TaskChildSummaryItem>> {
    const encodedTaskId = encodeRequiredId(taskId, 'taskId');
    return apiRequest.post<PageData<TaskChildSummaryItem>, TaskChildPageRequest>(
      `${TASK_BASE_PATH}/${encodedTaskId}/children/page`,
      payload,
    );
  },
  retryTask(taskId: string): Promise<TaskRetryData> {
    const encodedTaskId = encodeRequiredId(taskId, 'taskId');
    return apiRequest.post<TaskRetryData>(`${TASK_BASE_PATH}/${encodedTaskId}/retry`);
  },
  batchRerun(payload: BatchRerunRequest): Promise<BatchRerunData> {
    return apiRequest.post<BatchRerunData, BatchRerunRequest>(`${TASK_BASE_PATH}/batch-rerun`, payload);
  },
};
