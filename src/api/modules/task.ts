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
  // 任务列表走分页查询，避免任务中心一次性拉取大量执行记录。
  pageTasks(payload: TaskPageRequest): Promise<PageData<TaskSummary>> {
    return apiRequest.post<PageData<TaskSummary>, TaskPageRequest>(`${TASK_BASE_PATH}/page`, payload);
  },
  // 任务详情用于查看执行阶段、失败原因和重试信息。
  getTaskDetail(taskId: string): Promise<TaskDetailData> {
    const encodedTaskId = encodeRequiredId(taskId, 'taskId');
    return apiRequest.get<TaskDetailData>(`${TASK_BASE_PATH}/${encodedTaskId}`);
  },
  // 子任务分页独立查询，避免父任务详情接口承载过大的子任务列表。
  pageChildTasks(taskId: string, payload: TaskChildPageRequest): Promise<PageData<TaskChildSummaryItem>> {
    const encodedTaskId = encodeRequiredId(taskId, 'taskId');
    return apiRequest.post<PageData<TaskChildSummaryItem>, TaskChildPageRequest>(
      `${TASK_BASE_PATH}/${encodedTaskId}/children/page`,
      payload,
    );
  },
  // 单任务重试只传任务标识，重试策略由后端根据任务状态判断。
  retryTask(taskId: string): Promise<TaskRetryData> {
    const encodedTaskId = encodeRequiredId(taskId, 'taskId');
    return apiRequest.post<TaskRetryData>(`${TASK_BASE_PATH}/${encodedTaskId}/retry`);
  },
  // 批量重跑按后端筛选条件执行，前端不展开成多次单任务请求。
  batchRerun(payload: BatchRerunRequest): Promise<BatchRerunData> {
    return apiRequest.post<BatchRerunData, BatchRerunRequest>(`${TASK_BASE_PATH}/batch-rerun`, payload);
  },
};
