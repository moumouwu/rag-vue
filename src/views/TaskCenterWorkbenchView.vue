<script setup lang="ts">
import { reactive, ref } from 'vue';
import { taskApi } from '@/api';
import type { SortOrder, TaskDetailData, TaskStatus, TaskSummary, TaskType } from '@/types';
import { formatJson, getErrorMessage, normalizeOptionalText } from '@/utils/api-feedback';

interface TaskPageForm {
  taskType: TaskType | '';
  taskStatus: TaskStatus | '';
  knowledgeBaseId: string;
  documentId: string;
  triggerSource: string;
  pageNo: number;
  pageSize: number;
  sortBy: string;
  sortOrder: SortOrder;
}

interface TaskDetailForm {
  taskId: string;
  childTaskStatus: TaskStatus | '';
  childPageNo: number;
  childPageSize: number;
}

interface BatchRerunForm {
  taskType: TaskType;
  knowledgeBaseId: string;
  filterConditionText: string;
}

const taskPageForm = reactive<TaskPageForm>({
  taskType: 'document_vectorization',
  taskStatus: '',
  knowledgeBaseId: '',
  documentId: '',
  triggerSource: '',
  pageNo: 1,
  pageSize: 10,
  sortBy: 'updatedTime',
  sortOrder: 'desc',
});

const taskDetailForm = reactive<TaskDetailForm>({
  taskId: '',
  childTaskStatus: '',
  childPageNo: 1,
  childPageSize: 10,
});

const batchRerunForm = reactive<BatchRerunForm>({
  taskType: 'document_vectorization',
  knowledgeBaseId: '',
  filterConditionText: '{\n  "taskStatus": "failed"\n}',
});

const loading = reactive({
  paging: false,
  detail: false,
  childPage: false,
  retry: false,
  batchRerun: false,
});

const successMessage = ref('');
const errorMessage = ref('');
const taskRows = ref<TaskSummary[]>([]);
const taskTotal = ref(0);
const taskDetail = ref<TaskDetailData | null>(null);
const childTaskPageData = ref<unknown | null>(null);
const retryResult = ref<unknown | null>(null);
const batchRerunResult = ref<unknown | null>(null);

function resetFeedback(): void {
  successMessage.value = '';
  errorMessage.value = '';
}

function setSuccess(message: string): void {
  successMessage.value = message;
  errorMessage.value = '';
}

function setError(error: unknown): void {
  successMessage.value = '';
  errorMessage.value = getErrorMessage(error);
}

function parseFilterCondition(rawText: string): Record<string, unknown> | undefined {
  const value = rawText.trim();
  if (!value) {
    return undefined;
  }

  // 批量重跑过滤条件允许灵活扩展，但前端先约束为对象，避免提交非结构化内容。
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('批量重跑过滤条件必须是 JSON 对象');
  }

  return parsed as Record<string, unknown>;
}

async function handlePageTasks(): Promise<void> {
  resetFeedback();
  loading.paging = true;
  try {
    const pageData = await taskApi.pageTasks({
      taskType: taskPageForm.taskType || undefined,
      taskStatus: taskPageForm.taskStatus || undefined,
      knowledgeBaseId: normalizeOptionalText(taskPageForm.knowledgeBaseId),
      documentId: normalizeOptionalText(taskPageForm.documentId),
      triggerSource: normalizeOptionalText(taskPageForm.triggerSource),
      pageNo: taskPageForm.pageNo,
      pageSize: taskPageForm.pageSize,
      sortBy: taskPageForm.sortBy,
      sortOrder: taskPageForm.sortOrder,
    });
    taskRows.value = pageData.list;
    taskTotal.value = pageData.total;
    setSuccess(`任务查询完成，共返回 ${pageData.total} 条记录`);
  } catch (error) {
    setError(error);
  } finally {
    loading.paging = false;
  }
}

async function loadTaskDetail(taskId: string): Promise<void> {
  resetFeedback();
  loading.detail = true;
  try {
    if (!taskId.trim()) {
      throw new Error('任务 ID 不能为空');
    }

    const detailData = await taskApi.getTaskDetail(taskId);
    taskDetail.value = detailData;
    taskDetailForm.taskId = detailData.taskId;
    setSuccess(`已加载任务 ${detailData.taskId} 的详情`);
  } catch (error) {
    setError(error);
  } finally {
    loading.detail = false;
  }
}

async function handlePageChildTasks(): Promise<void> {
  resetFeedback();
  loading.childPage = true;
  try {
    if (!taskDetailForm.taskId.trim()) {
      throw new Error('查询子任务时，任务 ID 不能为空');
    }

    const pageData = await taskApi.pageChildTasks(taskDetailForm.taskId, {
      taskStatus: taskDetailForm.childTaskStatus || undefined,
      pageNo: taskDetailForm.childPageNo,
      pageSize: taskDetailForm.childPageSize,
      sortBy: 'updatedTime',
      sortOrder: 'desc',
    });
    childTaskPageData.value = pageData;
    setSuccess(`子任务查询完成，共返回 ${pageData.total} 条记录`);
  } catch (error) {
    setError(error);
  } finally {
    loading.childPage = false;
  }
}

async function handleRetryTask(): Promise<void> {
  resetFeedback();
  loading.retry = true;
  try {
    if (!taskDetailForm.taskId.trim()) {
      throw new Error('重试任务时，任务 ID 不能为空');
    }

    const retryData = await taskApi.retryTask(taskDetailForm.taskId);
    retryResult.value = retryData;
    setSuccess(`已提交重试任务，新任务 ID：${retryData.newTaskId}`);
  } catch (error) {
    setError(error);
  } finally {
    loading.retry = false;
  }
}

async function handleBatchRerun(): Promise<void> {
  resetFeedback();
  loading.batchRerun = true;
  try {
    const result = await taskApi.batchRerun({
      taskType: batchRerunForm.taskType,
      knowledgeBaseId: normalizeOptionalText(batchRerunForm.knowledgeBaseId),
      filterCondition: parseFilterCondition(batchRerunForm.filterConditionText),
    });
    batchRerunResult.value = result;
    setSuccess(`已提交批量重跑，批次任务 ID：${result.batchTaskId}`);
  } catch (error) {
    setError(error);
  } finally {
    loading.batchRerun = false;
  }
}
</script>

<template>
  <div class="view-shell">
    <div>
      <h2 class="view-shell__title">任务中心联调工作台</h2>
      <p class="view-shell__desc">
        重点验证任务分页、详情、子任务追踪、单任务重试和批量重跑五个入口。
      </p>
    </div>

    <div v-if="successMessage" class="status-banner status-banner--success">
      {{ successMessage }}
    </div>
    <div v-if="errorMessage" class="status-banner status-banner--error">
      {{ errorMessage }}
    </div>

    <div class="panel-grid">
      <div class="panel-stack">
        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">任务分页查询</h3>
              <p class="panel__desc">用于验证任务中心主列表和主过滤条件。</p>
            </div>
            <span class="badge">总数：{{ taskTotal }}</span>
          </div>

          <form class="form-grid" @submit.prevent="handlePageTasks">
            <label class="field">
              <span class="field__label">任务类型</span>
              <select v-model="taskPageForm.taskType" class="select">
                <option value="">全部</option>
                <option value="document_parsing">document_parsing</option>
                <option value="document_chunking">document_chunking</option>
                <option value="document_vectorization">document_vectorization</option>
                <option value="document_reprocess">document_reprocess</option>
                <option value="batch_reprocess">batch_reprocess</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">任务状态</span>
              <select v-model="taskPageForm.taskStatus" class="select">
                <option value="">全部</option>
                <option value="pending">pending</option>
                <option value="queued">queued</option>
                <option value="running">running</option>
                <option value="succeeded">succeeded</option>
                <option value="partial_success">partial_success</option>
                <option value="failed">failed</option>
                <option value="canceled">canceled</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">知识库 ID</span>
              <input v-model="taskPageForm.knowledgeBaseId" class="input" placeholder="可为空" />
            </label>
            <label class="field">
              <span class="field__label">文档 ID</span>
              <input v-model="taskPageForm.documentId" class="input" placeholder="可为空" />
            </label>
            <label class="field">
              <span class="field__label">触发来源</span>
              <input v-model="taskPageForm.triggerSource" class="input" placeholder="例如：manual" />
            </label>
            <label class="field">
              <span class="field__label">排序字段</span>
              <input v-model="taskPageForm.sortBy" class="input" placeholder="updatedTime" />
            </label>
            <label class="field">
              <span class="field__label">页码</span>
              <input v-model.number="taskPageForm.pageNo" class="input" type="number" min="1" />
            </label>
            <label class="field">
              <span class="field__label">每页数量</span>
              <input v-model.number="taskPageForm.pageSize" class="input" type="number" min="1" max="100" />
            </label>
            <label class="field">
              <span class="field__label">排序方向</span>
              <select v-model="taskPageForm.sortOrder" class="select">
                <option value="desc">desc</option>
                <option value="asc">asc</option>
              </select>
            </label>
            <div class="field">
              <span class="field__label">动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--primary" type="submit" :disabled="loading.paging">
                  {{ loading.paging ? '查询中...' : '查询任务' }}
                </button>
              </div>
            </div>
          </form>

          <div class="data-card" style="margin-top: 18px;">
            <h4 class="data-card__title">任务列表结果</h4>
            <div v-if="taskRows.length" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>任务 ID</th>
                    <th>任务类型</th>
                    <th>任务状态</th>
                    <th>知识库</th>
                    <th>文档</th>
                    <th>重试次数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in taskRows" :key="row.taskId">
                    <td>{{ row.taskId }}</td>
                    <td>{{ row.taskType }}</td>
                    <td>{{ row.taskStatus }}</td>
                    <td>{{ row.knowledgeBaseName || '-' }}</td>
                    <td>{{ row.documentName || '-' }}</td>
                    <td>{{ row.retryCount }}</td>
                    <td>
                      <button type="button" class="text-link" @click="loadTaskDetail(row.taskId)">
                        查看详情
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="empty-hint">还没有查询结果，可先发起一次分页查询。</p>
          </div>
        </section>

        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">任务详情与子任务结果</h3>
              <p class="panel__desc">主任务详情、子任务分页、重试结果和批量重跑结果在这里统一查看。</p>
            </div>
          </div>

          <div class="result-grid">
            <div class="result-card">
              <div class="result-block">
                <h4 class="result-block__title">任务详情</h4>
                <pre v-if="taskDetail" class="json-viewer">{{ formatJson(taskDetail) }}</pre>
                <p v-else class="empty-hint">点击列表中的“查看详情”后展示。</p>
              </div>
            </div>
            <div class="result-card">
              <div class="result-block">
                <h4 class="result-block__title">子任务分页</h4>
                <pre v-if="childTaskPageData" class="json-viewer">{{ formatJson(childTaskPageData) }}</pre>
                <p v-else class="empty-hint">输入任务 ID 后可查询子任务分页结果。</p>
              </div>
            </div>
            <div class="result-card">
              <div class="result-block">
                <h4 class="result-block__title">重试结果</h4>
                <pre v-if="retryResult" class="json-viewer">{{ formatJson(retryResult) }}</pre>
                <p v-else class="empty-hint">执行“重试任务”后展示新任务回执。</p>
              </div>
            </div>
            <div class="result-card">
              <div class="result-block">
                <h4 class="result-block__title">批量重跑结果</h4>
                <pre v-if="batchRerunResult" class="json-viewer">{{ formatJson(batchRerunResult) }}</pre>
                <p v-else class="empty-hint">提交批量重跑后展示批次任务回执。</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="panel-stack">
        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">任务详情查询</h3>
              <p class="panel__desc">先聚焦主任务，再往下查看子任务和执行动作。</p>
            </div>
          </div>

          <div class="form-grid">
            <label class="field field--span-2">
              <span class="field__label">任务 ID</span>
              <input v-model="taskDetailForm.taskId" class="input" placeholder="例如：task_001" />
            </label>
            <div class="field field--span-2">
              <span class="field__label">动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--primary" type="button" :disabled="loading.detail" @click="loadTaskDetail(taskDetailForm.taskId)">
                  {{ loading.detail ? '查询中...' : '查询任务详情' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">子任务查询与重试</h3>
              <p class="panel__desc">任务 ID 复用主任务输入，适合处理向量化和重处理场景。</p>
            </div>
          </div>

          <div class="form-grid">
            <label class="field">
              <span class="field__label">子任务状态</span>
              <select v-model="taskDetailForm.childTaskStatus" class="select">
                <option value="">全部</option>
                <option value="pending">pending</option>
                <option value="queued">queued</option>
                <option value="running">running</option>
                <option value="succeeded">succeeded</option>
                <option value="partial_success">partial_success</option>
                <option value="failed">failed</option>
                <option value="canceled">canceled</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">子任务页码</span>
              <input v-model.number="taskDetailForm.childPageNo" class="input" type="number" min="1" />
            </label>
            <label class="field">
              <span class="field__label">子任务每页数量</span>
              <input v-model.number="taskDetailForm.childPageSize" class="input" type="number" min="1" max="100" />
            </label>
            <div class="field">
              <span class="field__label">子任务动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--secondary" type="button" :disabled="loading.childPage" @click="handlePageChildTasks">
                  {{ loading.childPage ? '查询中...' : '查询子任务' }}
                </button>
              </div>
            </div>
            <div class="field field--span-2">
              <span class="field__label">重试动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--secondary" type="button" :disabled="loading.retry" @click="handleRetryTask">
                  {{ loading.retry ? '提交中...' : '重试任务' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">批量重跑</h3>
              <p class="panel__desc">当前先用 JSON 输入过滤条件，后续接正式筛选表单也不会破坏接口边界。</p>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="handleBatchRerun">
            <label class="field">
              <span class="field__label">任务类型</span>
              <select v-model="batchRerunForm.taskType" class="select">
                <option value="document_parsing">document_parsing</option>
                <option value="document_chunking">document_chunking</option>
                <option value="document_vectorization">document_vectorization</option>
                <option value="document_reprocess">document_reprocess</option>
                <option value="batch_reprocess">batch_reprocess</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">知识库 ID</span>
              <input v-model="batchRerunForm.knowledgeBaseId" class="input" placeholder="可为空" />
            </label>
            <label class="field field--span-2">
              <span class="field__label">过滤条件 JSON</span>
              <textarea
                v-model="batchRerunForm.filterConditionText"
                class="textarea"
                placeholder='例如：{"taskStatus":"failed"}'
              />
            </label>
            <div class="field field--span-2">
              <span class="field__label">动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--primary" type="submit" :disabled="loading.batchRerun">
                  {{ loading.batchRerun ? '提交中...' : '提交批量重跑' }}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  </div>
</template>
