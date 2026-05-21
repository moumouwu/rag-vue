<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { taskApi } from '@/api';
import { isApiRequestError } from '@/api/request';
import { usePermission } from '@/auth/permissions';
import type {
  BatchRerunData,
  PageData,
  SortOrder,
  TaskChildSummaryItem,
  TaskDetailData,
  TaskRetryData,
  TaskStatus,
  TaskSummary,
  TaskType,
} from '@/types';
import { normalizeOptionalText } from '@/utils/api-feedback';
import { showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

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

interface BatchReprocessForm {
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

const batchReprocessForm = reactive<BatchReprocessForm>({
  knowledgeBaseId: '',
  filterConditionText: '{\n  "businessStatus": "published"\n}',
});

const taskTypeOptions: Array<{ label: string; value: TaskType }> = [
  { label: '文档解析', value: 'document_parsing' },
  { label: '文档分块', value: 'document_chunking' },
  { label: '文档向量化', value: 'document_vectorization' },
  { label: '文档重新处理', value: 'document_reprocess' },
  { label: '批量重处理', value: 'batch_reprocess' },
];

const batchRerunTaskTypeOptions: Array<{ label: string; value: TaskType }> = [
  { label: '文档向量化', value: 'document_vectorization' },
  { label: '文档重新处理', value: 'document_reprocess' },
];

const taskStatusOptions: Array<{ label: string; value: TaskStatus }> = [
  { label: '待执行', value: 'pending' },
  { label: '排队中', value: 'queued' },
  { label: '执行中', value: 'running' },
  { label: '执行成功', value: 'succeeded' },
  { label: '部分成功', value: 'partial_success' },
  { label: '执行失败', value: 'failed' },
  { label: '已取消', value: 'canceled' },
];

const sortByOptions: Array<{ label: string; value: string }> = [
  { label: '更新时间', value: 'updatedTime' },
  { label: '创建时间', value: 'createdTime' },
  { label: '开始时间', value: 'startTime' },
  { label: '结束时间', value: 'endTime' },
];

const { hasPermission, hasAnyPermission } = usePermission();
const canQueryTasks = computed(() => hasPermission('task:center:query'));
const canViewTaskDetail = computed(() => hasPermission('task:center:detail'));
const canQueryChildTasks = computed(() => hasPermission('task:center:children-query'));
const canRetryTask = computed(() => hasPermission('task:center:retry'));
const canBatchRerun = computed(() => hasPermission('task:center:batch-rerun'));
const canBatchReprocess = computed(() => hasPermission('task:center:batch-reprocess'));
const canOperateTask = computed(() =>
  hasAnyPermission(['task:center:detail', 'task:center:children-query', 'task:center:retry']),
);

const loading = reactive({
  paging: false,
  detail: false,
  childPage: false,
  retry: false,
  batchRerun: false,
  batchReprocess: false,
});

const taskRows = ref<TaskSummary[]>([]);
const taskTotal = ref(0);
const taskDetail = ref<TaskDetailData | null>(null);
const childTaskPageData = ref<PageData<TaskChildSummaryItem> | null>(null);
const retryResult = ref<TaskRetryData | null>(null);
const batchRerunResult = ref<BatchRerunData | null>(null);
const batchReprocessResult = ref<BatchRerunData | null>(null);
const detailDialogVisible = ref(false);
const batchDialogVisible = ref(false);
const batchReprocessDialogVisible = ref(false);
const detailActiveTab = ref('timeline');

const runningCount = computed(() => taskRows.value.filter((task) => task.taskStatus === 'running').length);
const failedCount = computed(() => taskRows.value.filter((task) => task.taskStatus === 'failed').length);
const succeededCount = computed(() => taskRows.value.filter((task) => task.taskStatus === 'succeeded').length);
const detailDialogTitle = computed(() => (taskDetail.value ? `任务详情：${taskDetail.value.taskId}` : '任务详情'));

// 页面层只展示后端错误文案；非接口异常使用当前操作的兜底提示。
function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : error instanceof Error ? error.message : fallback;
}

// 类型文案仅用于展示，接口仍提交后端定义的稳定枚举值。
function taskTypeText(taskType: TaskType | string): string {
  return taskTypeOptions.find((option) => option.value === taskType)?.label ?? taskType;
}

// 状态文案只做前端映射，未知状态保留原值便于联调定位。
function taskStatusText(taskStatus: TaskStatus | string): string {
  return taskStatusOptions.find((option) => option.value === taskStatus)?.label ?? taskStatus;
}

// 状态颜色沿用其他管理页的 el-tag 语义，避免任务中心另起一套视觉规则。
function taskStatusTagType(taskStatus: TaskStatus | string): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (taskStatus === 'succeeded') {
    return 'success';
  }
  if (taskStatus === 'failed' || taskStatus === 'canceled') {
    return 'danger';
  }
  if (taskStatus === 'running') {
    return 'primary';
  }
  if (taskStatus === 'partial_success' || taskStatus === 'pending' || taskStatus === 'queued') {
    return 'warning';
  }
  return 'info';
}

// 详情和表格统一空值占位，避免用户误以为空白就是接口丢字段。
function safeText(value: string | null | undefined, fallback = '未设置'): string {
  const normalized = value?.trim() ?? '';
  return normalized || fallback;
}

// 时间字段暂不在前端改格式，保持后端返回值可被直接核对。
function formatTime(value: string | null | undefined): string {
  return value && value.trim() ? value : '-';
}

// 进度值只做展示保护，真实处理状态仍以后端状态字段为准。
function progressValue(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

// 子任务汇总按详情接口返回值展示，不在前端自行推导任务完成状态。
function childSummaryText(detail: TaskDetailData): string {
  const summary = detail.childTaskSummary;
  if (!summary) {
    return '暂无子任务汇总';
  }
  return `总数 ${summary.total ?? 0}，成功 ${summary.succeeded ?? 0}，失败 ${summary.failed ?? 0}`;
}

// 批量重跑过滤条件只允许 JSON 对象，防止数组或字符串绕过后端筛选契约。
function parseFilterCondition(rawText: string): Record<string, unknown> | undefined {
  const value = rawText.trim();
  if (!value) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('批量重跑过滤条件必须是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
}

// 分页查询是任务中心主入口，只在具备查询权限时向后端拉取数据。
async function loadTasks(): Promise<void> {
  if (!canQueryTasks.value) {
    return;
  }
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
    taskPageForm.pageNo = pageData.pageNo;
    taskPageForm.pageSize = pageData.pageSize;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '任务列表查询失败'));
  } finally {
    loading.paging = false;
  }
}

// 查询按钮固定回到第一页，避免保留旧页码导致用户误判没有数据。
async function searchTasks(): Promise<void> {
  taskPageForm.pageNo = 1;
  await loadTasks();
}

// 重置只清空筛选条件，保留默认排序，行为与其他列表页保持一致。
async function resetTaskQuery(): Promise<void> {
  taskPageForm.taskType = 'document_vectorization';
  taskPageForm.taskStatus = '';
  taskPageForm.knowledgeBaseId = '';
  taskPageForm.documentId = '';
  taskPageForm.triggerSource = '';
  taskPageForm.sortBy = 'updatedTime';
  taskPageForm.sortOrder = 'desc';
  taskPageForm.pageNo = 1;
  await loadTasks();
}

// 分页页码变化后只刷新当前查询条件下的数据。
async function handlePageChange(pageNo: number): Promise<void> {
  taskPageForm.pageNo = pageNo;
  await loadTasks();
}

// 每页数量变化时回到第一页，避免当前页超过新分页范围。
async function handleSizeChange(pageSize: number): Promise<void> {
  taskPageForm.pageSize = pageSize;
  taskPageForm.pageNo = 1;
  await loadTasks();
}

// 打开详情前清理旧的子任务和回执，防止不同任务的数据串屏。
async function openTaskDetail(row: TaskSummary): Promise<void> {
  if (!canViewTaskDetail.value) {
    return;
  }
  detailDialogVisible.value = true;
  detailActiveTab.value = 'timeline';
  taskDetail.value = null;
  childTaskPageData.value = null;
  retryResult.value = null;
  taskDetailForm.taskId = row.taskId;
  taskDetailForm.childTaskStatus = '';
  taskDetailForm.childPageNo = 1;
  await loadTaskDetail(row.taskId);
}

// 任务详情查询会同步当前任务 ID，方便后续子任务查询和重试复用。
async function loadTaskDetail(taskId: string): Promise<void> {
  if (!canViewTaskDetail.value) {
    return;
  }
  loading.detail = true;
  try {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) {
      throw new Error('任务 ID 不能为空');
    }
    const detailData = await taskApi.getTaskDetail(normalizedTaskId);
    taskDetail.value = detailData;
    taskDetailForm.taskId = detailData.taskId;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '任务详情查询失败'));
    detailDialogVisible.value = false;
  } finally {
    loading.detail = false;
  }
}

// 子任务分页独立调用后端接口，避免详情接口承载过大的子任务列表。
async function loadChildTasks(): Promise<void> {
  if (!canQueryChildTasks.value) {
    return;
  }
  loading.childPage = true;
  try {
    const normalizedTaskId = taskDetailForm.taskId.trim();
    if (!normalizedTaskId) {
      throw new Error('查询子任务时，任务 ID 不能为空');
    }
    const pageData = await taskApi.pageChildTasks(normalizedTaskId, {
      taskStatus: taskDetailForm.childTaskStatus || undefined,
      pageNo: taskDetailForm.childPageNo,
      pageSize: taskDetailForm.childPageSize,
      sortBy: 'updatedTime',
      sortOrder: 'desc',
    });
    childTaskPageData.value = pageData;
    taskDetailForm.childPageNo = pageData.pageNo;
    taskDetailForm.childPageSize = pageData.pageSize;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '子任务查询失败'));
  } finally {
    loading.childPage = false;
  }
}

// 子任务查询按钮从第一页开始，避免状态筛选切换后停留在空页。
async function searchChildTasks(): Promise<void> {
  taskDetailForm.childPageNo = 1;
  await loadChildTasks();
}

// 子任务页码变化只影响当前详情弹窗内的子任务列表。
async function handleChildPageChange(pageNo: number): Promise<void> {
  taskDetailForm.childPageNo = pageNo;
  await loadChildTasks();
}

// 子任务每页数量变化时回到第一页，避免分页范围错位。
async function handleChildSizeChange(pageSize: number): Promise<void> {
  taskDetailForm.childPageSize = pageSize;
  taskDetailForm.childPageNo = 1;
  await loadChildTasks();
}

// 单任务重试只提交任务 ID，是否允许重试由后端根据真实状态判断。
async function retryCurrentTask(): Promise<void> {
  if (!canRetryTask.value) {
    return;
  }
  loading.retry = true;
  try {
    const normalizedTaskId = taskDetailForm.taskId.trim();
    if (!normalizedTaskId) {
      throw new Error('重试任务时，任务 ID 不能为空');
    }
    retryResult.value = await taskApi.retryTask(normalizedTaskId);
    detailActiveTab.value = 'receipt';
    showSuccessMessage(`已提交重试任务，新任务 ID：${retryResult.value.newTaskId}`);
    await loadTasks();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '任务重试失败'));
  } finally {
    loading.retry = false;
  }
}

// 批量重跑弹窗每次打开时保留默认失败任务筛选，减少误提交范围。
function openBatchRerunDialog(): void {
  batchDialogVisible.value = true;
  batchRerunResult.value = null;
}

// 批量重跑按后端筛选条件创建任务，前端不拆成多次单任务重试。
async function submitBatchRerun(): Promise<void> {
  if (!canBatchRerun.value) {
    return;
  }
  loading.batchRerun = true;
  try {
    batchRerunResult.value = await taskApi.batchRerun({
      taskType: batchRerunForm.taskType,
      knowledgeBaseId: normalizeOptionalText(batchRerunForm.knowledgeBaseId),
      filterCondition: parseFilterCondition(batchRerunForm.filterConditionText),
    });
    showSuccessMessage(`已提交批量重跑，批次任务 ID：${batchRerunResult.value.batchTaskId}`);
    await loadTasks();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '批量重跑提交失败'));
  } finally {
    loading.batchRerun = false;
  }
}

// 批量重处理会重新解析文档并生成新业务版本，必须限制在明确知识库范围内。
function openBatchReprocessDialog(): void {
  batchReprocessDialogVisible.value = true;
  batchReprocessResult.value = null;
}

// 批量重处理由后端创建父子任务，前端只提交结构化筛选条件。
async function submitBatchReprocess(): Promise<void> {
  if (!canBatchReprocess.value) {
    return;
  }
  const knowledgeBaseId = normalizeOptionalText(batchReprocessForm.knowledgeBaseId);
  if (!knowledgeBaseId) {
    showErrorMessage('知识库 ID 不能为空');
    return;
  }
  loading.batchReprocess = true;
  try {
    batchReprocessResult.value = await taskApi.batchReprocess({
      knowledgeBaseId,
      filterCondition: parseFilterCondition(batchReprocessForm.filterConditionText),
    });
    showSuccessMessage(`已提交批量重处理，批次任务 ID：${batchReprocessResult.value.batchTaskId}`);
    await loadTasks();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '批量重处理提交失败'));
  } finally {
    loading.batchReprocess = false;
  }
}

onMounted(loadTasks);
</script>

<template>
  <section class="workspace-card system-page task-center-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">任务中心</h2>
        <p class="section-heading__desc">查看文档处理任务状态、子任务进度和重试回执。</p>
      </div>
      <div class="task-center-actions">
        <el-button :disabled="!canQueryTasks" :loading="loading.paging" @click="loadTasks">刷新</el-button>
        <el-button v-if="canBatchRerun" type="primary" @click="openBatchRerunDialog">批量重跑</el-button>
        <el-button v-if="canBatchReprocess" type="primary" @click="openBatchReprocessDialog">批量重处理</el-button>
      </div>
    </div>

    <div class="task-center-toolbar">
      <el-select v-model="taskPageForm.taskType" placeholder="全部类型" clearable>
        <el-option label="全部类型" value="" />
        <el-option v-for="option in taskTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="taskPageForm.taskStatus" placeholder="全部状态" clearable>
        <el-option label="全部状态" value="" />
        <el-option v-for="option in taskStatusOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-input v-model="taskPageForm.knowledgeBaseId" clearable placeholder="知识库 ID" @keyup.enter="searchTasks" />
      <el-input v-model="taskPageForm.documentId" clearable placeholder="文档 ID" @keyup.enter="searchTasks" />
      <el-input v-model="taskPageForm.triggerSource" clearable placeholder="触发来源" @keyup.enter="searchTasks" />
      <el-select v-model="taskPageForm.sortBy" placeholder="排序字段">
        <el-option v-for="option in sortByOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="taskPageForm.sortOrder" placeholder="排序方向">
        <el-option label="倒序" value="desc" />
        <el-option label="正序" value="asc" />
      </el-select>
      <div class="task-center-toolbar__actions">
        <el-button type="primary" :disabled="!canQueryTasks" @click="searchTasks">查询</el-button>
        <el-button @click="resetTaskQuery">重置</el-button>
      </div>
    </div>

    <div class="task-center-summary">
      <span>共 {{ taskTotal }} 个任务</span>
      <span>当前页执行中 {{ runningCount }} 个</span>
      <span>当前页成功 {{ succeededCount }} 个</span>
      <span>当前页失败 {{ failedCount }} 个</span>
    </div>

    <el-empty v-if="!canQueryTasks" description="暂无任务中心查询权限" />
    <template v-else>
      <el-table v-loading="loading.paging" :data="taskRows" border row-key="taskId" class="system-page__table">
        <el-table-column label="任务 ID" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="task-id">{{ row.taskId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="任务类型" width="130">
          <template #default="{ row }">{{ taskTypeText(row.taskType) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="taskStatusTagType(row.taskStatus)" size="small">
              {{ taskStatusText(row.taskStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" width="130">
          <template #default="{ row }">
            <el-progress :percentage="progressValue(row.progress)" :stroke-width="8" />
          </template>
        </el-table-column>
        <el-table-column label="知识库" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.knowledgeBaseName) }}</template>
        </el-table-column>
        <el-table-column label="文档" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.documentName) }}</template>
        </el-table-column>
        <el-table-column prop="retryCount" label="重试" width="72" />
        <el-table-column label="开始时间" width="178">
          <template #default="{ row }">{{ formatTime(row.startTime) }}</template>
        </el-table-column>
        <el-table-column label="结束时间" width="178">
          <template #default="{ row }">{{ formatTime(row.endTime) }}</template>
        </el-table-column>
        <el-table-column v-if="canOperateTask" label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canViewTaskDetail" link type="primary" @click="openTaskDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="task-center-pagination">
        <el-pagination
          v-model:current-page="taskPageForm.pageNo"
          v-model:page-size="taskPageForm.pageSize"
          background
          :page-sizes="[10, 20, 50, 100]"
          :total="taskTotal"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </template>

    <el-dialog v-model="detailDialogVisible" :title="detailDialogTitle" width="920px" align-center>
      <el-skeleton v-if="loading.detail" :rows="7" animated />
      <div v-else-if="taskDetail" class="task-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="任务 ID">
            <span class="task-id">{{ taskDetail.taskId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="任务类型">{{ taskTypeText(taskDetail.taskType) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="taskStatusTagType(taskDetail.taskStatus)">
              {{ taskStatusText(taskDetail.taskStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="触发来源">{{ safeText(taskDetail.triggerSource) }}</el-descriptions-item>
          <el-descriptions-item label="子任务汇总">{{ childSummaryText(taskDetail) }}</el-descriptions-item>
          <el-descriptions-item label="失败原因">{{ safeText(taskDetail.failureReason) }}</el-descriptions-item>
          <el-descriptions-item label="进度说明" :span="2">{{ safeText(taskDetail.progressDetail) }}</el-descriptions-item>
        </el-descriptions>

        <div class="task-detail-toolbar">
          <el-select v-model="taskDetailForm.childTaskStatus" placeholder="全部子任务状态" clearable>
            <el-option label="全部子任务状态" value="" />
            <el-option v-for="option in taskStatusOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
          <el-button
            :disabled="!canQueryChildTasks"
            :loading="loading.childPage"
            @click="searchChildTasks"
          >
            查询子任务
          </el-button>
          <el-button
            v-if="canRetryTask"
            type="primary"
            :loading="loading.retry"
            @click="retryCurrentTask"
          >
            重试任务
          </el-button>
        </div>

        <el-tabs v-model="detailActiveTab">
          <el-tab-pane label="时间线" name="timeline">
            <el-table v-if="taskDetail.timeline?.length" :data="taskDetail.timeline" border class="system-page__table">
              <el-table-column label="时间" width="180">
                <template #default="{ row }">{{ formatTime(row.time) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="110">
                <template #default="{ row }">
                  <el-tag v-if="row.status" :type="taskStatusTagType(row.status)" size="small">
                    {{ taskStatusText(row.status) }}
                  </el-tag>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="说明" min-width="260" show-overflow-tooltip>
                <template #default="{ row }">{{ safeText(row.message) }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无时间线节点" />
          </el-tab-pane>

          <el-tab-pane label="子任务" name="children">
            <el-table
              v-loading="loading.childPage"
              :data="childTaskPageData?.list ?? []"
              border
              row-key="childTaskId"
              class="system-page__table"
            >
              <el-table-column label="子任务 ID" min-width="180" show-overflow-tooltip>
                <template #default="{ row }"><span class="task-id">{{ row.childTaskId }}</span></template>
              </el-table-column>
              <el-table-column label="文档 ID" min-width="160" show-overflow-tooltip>
                <template #default="{ row }"><span class="task-id">{{ row.documentId }}</span></template>
              </el-table-column>
              <el-table-column prop="documentName" label="文档名称" min-width="180" show-overflow-tooltip />
              <el-table-column label="状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="taskStatusTagType(row.taskStatus)" size="small">
                    {{ taskStatusText(row.taskStatus) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="retryCount" label="重试" width="72" />
              <el-table-column label="失败原因" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">{{ safeText(row.failureReason) }}</template>
              </el-table-column>
            </el-table>
            <div v-if="childTaskPageData" class="task-center-pagination">
              <el-pagination
                v-model:current-page="taskDetailForm.childPageNo"
                v-model:page-size="taskDetailForm.childPageSize"
                background
                :page-sizes="[10, 20, 50, 100]"
                :total="childTaskPageData.total"
                layout="total, sizes, prev, pager, next"
                @current-change="handleChildPageChange"
                @size-change="handleChildSizeChange"
              />
            </div>
          </el-tab-pane>

          <el-tab-pane v-if="retryResult" label="操作回执" name="receipt">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="重试新任务">
                <span class="task-id">{{ retryResult.newTaskId }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="来源任务">
                <span class="task-id">{{ retryResult.sourceTaskId }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="重试状态">
                <el-tag :type="taskStatusTagType(retryResult.taskStatus)">
                  {{ taskStatusText(retryResult.taskStatus) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="排队时间">{{ formatTime(retryResult.queuedTime) }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>

    <el-dialog v-model="batchDialogVisible" title="批量重跑" width="680px" align-center>
      <el-form :model="batchRerunForm" label-position="top" class="task-batch-form">
        <div class="task-batch-form__grid">
          <el-form-item label="任务类型" required>
            <el-select v-model="batchRerunForm.taskType">
              <el-option
                v-for="option in batchRerunTaskTypeOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="知识库 ID">
            <el-input v-model="batchRerunForm.knowledgeBaseId" clearable placeholder="可为空" />
          </el-form-item>
        </div>
        <el-form-item label="过滤条件 JSON">
          <el-input
            v-model="batchRerunForm.filterConditionText"
            type="textarea"
            :rows="7"
            placeholder='例如：{"taskStatus":"failed"}'
          />
        </el-form-item>
        <el-alert
          v-if="batchRerunResult"
          type="success"
          show-icon
          :closable="false"
          :title="`已提交批量重跑，批次任务 ID：${batchRerunResult.batchTaskId}`"
        >
          <template #default>
            子任务数量：{{ batchRerunResult.taskCount }}；状态：{{ taskStatusText(batchRerunResult.taskStatus) }}
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="batchDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="loading.batchRerun" @click="submitBatchRerun">提交批量重跑</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchReprocessDialogVisible" title="批量重处理" width="680px" align-center>
      <el-form :model="batchReprocessForm" label-position="top" class="task-batch-form">
        <el-alert
          type="warning"
          show-icon
          :closable="false"
          title="影响范围为当前知识库内满足过滤条件的已发布文档，处理中和外部链接文档不会进入候选。"
        />
        <el-form-item label="知识库 ID" required>
          <el-input v-model="batchReprocessForm.knowledgeBaseId" clearable placeholder="必填" />
        </el-form-item>
        <el-form-item label="过滤条件 JSON">
          <el-input
            v-model="batchReprocessForm.filterConditionText"
            type="textarea"
            :rows="7"
            placeholder='例如：{"businessStatus":"published","processingStatus":"failed"}'
          />
        </el-form-item>
        <el-alert
          v-if="batchReprocessResult"
          type="success"
          show-icon
          :closable="false"
          :title="`已提交批量重处理，批次任务 ID：${batchReprocessResult.batchTaskId}`"
        >
          <template #default>
            子任务数量：{{ batchReprocessResult.taskCount }}；状态：{{ taskStatusText(batchReprocessResult.taskStatus) }}
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="batchReprocessDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="loading.batchReprocess" @click="submitBatchReprocess">提交批量重处理</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.task-center-actions,
.task-center-summary {
  display: flex;
  gap: 10px;
  align-items: center;
}

.task-center-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.task-center-toolbar {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr)) 132px 104px auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.task-center-toolbar__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.task-center-summary {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.task-center-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.task-id {
  font-family: "Cascadia Mono", "Consolas", monospace;
  font-size: 12px;
}

.task-detail {
  display: grid;
  gap: 14px;
}

.task-detail-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
}

.task-detail-toolbar .el-select {
  width: 180px;
}

.task-batch-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 1180px) {
  .task-center-toolbar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .task-center-toolbar,
  .task-batch-form__grid {
    grid-template-columns: 1fr;
  }

  .task-center-actions,
  .task-center-summary,
  .task-center-toolbar__actions,
  .task-detail-toolbar {
    width: 100%;
    justify-content: flex-start;
  }

  .task-detail-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .task-detail-toolbar .el-select {
    width: 100%;
  }
}
</style>
