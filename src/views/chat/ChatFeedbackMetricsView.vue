<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { aiApi } from '@/api/modules/ai';
import { chatApi } from '@/api';
import { isApiRequestError } from '@/api/request';
import { knowledgeApi } from '@/api/modules/knowledge';
import { usePermission } from '@/auth/permissions';
import type {
  ChatAnswerMetricsData,
  ChatFeedbackPageItem,
  ChatFeedbackType,
  ChatMessageItem,
  ChatSessionSummary,
  PromptTemplateItem,
  SortOrder,
  TimeRange,
} from '@/types';
import type { AiModelConfig } from '@/types/ai';
import type { KnowledgeBase } from '@/types/knowledge';
import { normalizeOptionalText } from '@/utils/api-feedback';
import { showErrorMessage } from '@/utils/ui-feedback';

interface FeedbackFilterForm {
  sessionId: string;
  assistantMessageId: string;
  feedbackType: ChatFeedbackType | '';
  startTime: string;
  endTime: string;
  pageNo: number;
  pageSize: number;
  sortBy: string;
  sortOrder: SortOrder;
}

interface MetricsFilterForm {
  startTime: string;
  endTime: string;
  knowledgeBaseId: string;
  modelConfigId: string;
  templateId: string;
}

const { hasPermission } = usePermission();
const feedbackLoading = ref(false);
const metricsLoading = ref(false);
const feedbackRows = ref<ChatFeedbackPageItem[]>([]);
const feedbackTotal = ref(0);
const metrics = ref<ChatAnswerMetricsData | null>(null);
const sessionOptions = ref<ChatSessionSummary[]>([]);
const assistantMessageOptions = ref<ChatMessageItem[]>([]);
const knowledgeBaseOptions = ref<KnowledgeBase[]>([]);
const modelOptions = ref<AiModelConfig[]>([]);
const promptTemplateOptions = ref<PromptTemplateItem[]>([]);
const optionLoading = reactive({
  sessions: false,
  messages: false,
  knowledgeBases: false,
  models: false,
  templates: false,
});

const feedbackForm = reactive<FeedbackFilterForm>({
  sessionId: '',
  assistantMessageId: '',
  feedbackType: '',
  startTime: '',
  endTime: '',
  pageNo: 1,
  pageSize: 10,
  sortBy: 'createdTime',
  sortOrder: 'desc',
});

const metricsForm = reactive<MetricsFilterForm>({
  startTime: '',
  endTime: '',
  knowledgeBaseId: '',
  modelConfigId: '',
  templateId: '',
});

const canQueryFeedback = computed(() => hasPermission('chat:feedback:query'));
const canQueryMetrics = computed(() => hasPermission('chat:metrics:query'));
const canQuerySessions = computed(() => hasPermission('chat:session:query'));
const canQuerySessionDetail = computed(() => hasPermission('chat:session:detail'));
const canQueryKnowledgeBases = computed(() => hasPermission('knowledge:base:query'));
const canQueryModels = computed(() => hasPermission('ai:model:list'));
const canQueryPromptTemplates = computed(() => hasPermission('chat:prompt-template:query'));
const feedbackTypeSummary = computed(() => {
  const likeCount = feedbackRows.value.filter((row) => row.feedbackType === 'like').length;
  const dislikeCount = feedbackRows.value.filter((row) => row.feedbackType === 'dislike').length;
  return `当前页点赞 ${likeCount} 条，点踩 ${dislikeCount} 条`;
});
const successRateText = computed(() => {
  if (!metrics.value || metrics.value.totalAnswerCount <= 0) {
    return '0%';
  }
  const rate = (metrics.value.successCount / metrics.value.totalAnswerCount) * 100;
  return `${rate.toFixed(1)}%`;
});
const feedbackRateText = computed(() => {
  const value = metrics.value?.feedbackRate ?? 0;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }
  return `${(numericValue * 100).toFixed(1)}%`;
});

// 只对标准接口异常透出后端文案，避免普通运行时错误覆盖业务提示。
function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

// 后端按 OffsetDateTime 解析，前端 datetime 控件值需要补充时区后再提交。
function normalizeDateTimeForApi(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value ?? '');
  if (!normalized) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized) || /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }
  return date.toISOString();
}

// 拼装可选时间范围，空起止时间不传给后端以保留默认统计口径。
function buildTimeRange(startTime: string, endTime: string): TimeRange | undefined {
  const start = normalizeDateTimeForApi(startTime);
  const end = normalizeDateTimeForApi(endTime);
  if (!start && !end) {
    return undefined;
  }
  return { start, end };
}

// 会话下拉用标题、绑定对象和时间组合，避免用户只能看到内部ID。
function sessionOptionLabel(session: ChatSessionSummary): string {
  const title = session.titleSummary || session.lastMessagePreview || '未命名会话';
  const bindingName = session.bindingObjectName ? ` / ${session.bindingObjectName}` : '';
  const time = session.lastMessageTime ? ` / ${formatTime(session.lastMessageTime)}` : '';
  return `${title}${bindingName}${time}`;
}

// 助手消息下拉展示回答摘要，保留时间帮助区分多轮对话。
function assistantMessageOptionLabel(message: ChatMessageItem): string {
  const preview = message.content?.trim() || '空回答';
  const time = message.createdTime ? ` / ${formatTime(message.createdTime)}` : '';
  return `${preview.slice(0, 48)}${preview.length > 48 ? '...' : ''}${time}`;
}

// 知识库下拉展示名称和编码，便于同名知识库区分。
function knowledgeBaseOptionLabel(base: KnowledgeBase): string {
  return base.baseCode ? `${base.baseName}（${base.baseCode}）` : base.baseName;
}

// 模型下拉展示名称、编码和供应商，便于定位实际统计维度。
function modelOptionLabel(model: AiModelConfig): string {
  return `${model.modelName || model.modelCode}（${model.modelCode} / ${model.providerCode}）`;
}

// 模板下拉展示名称和编码，避免直接输入模板ID。
function promptTemplateOptionLabel(template: PromptTemplateItem): string {
  return `${template.templateName}（${template.templateCode}）`;
}

// 知识库和提示词模板对应不同聊天绑定类型，不能同时作为统计维度提交给后端。
function handleMetricsKnowledgeBaseChange(value: string | number | null | undefined): void {
  if (normalizeOptionalText(String(value ?? ''))) {
    metricsForm.templateId = '';
  }
}

// 提示词模板和知识库互斥，避免后端收到两个绑定维度后返回参数错误。
function handleMetricsPromptTemplateChange(value: string | number | null | undefined): void {
  if (normalizeOptionalText(String(value ?? ''))) {
    metricsForm.knowledgeBaseId = '';
  }
}

// 将反馈枚举转成中文表格文案，避免管理页直接展示英文值。
function feedbackTypeText(type: ChatFeedbackType | string): string {
  return type === 'like' ? '点赞' : type === 'dislike' ? '点踩' : type;
}

// 反馈类型映射到 Element Plus 标签色，只处理后端允许的枚举值。
function feedbackTagType(type: ChatFeedbackType | string): 'success' | 'danger' | 'info' {
  if (type === 'like') {
    return 'success';
  }
  if (type === 'dislike') {
    return 'danger';
  }
  return 'info';
}

// 压缩展示时间，无法解析时保留原值方便排查后端数据格式。
function formatTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// 加载可查询会话作为反馈筛选选项，列表权限缺失时不绕过后端权限。
async function loadSessionOptions(): Promise<void> {
  if (!canQuerySessions.value) {
    sessionOptions.value = [];
    return;
  }
  optionLoading.sessions = true;
  try {
    const pageData = await chatApi.pageSessions({
      pageNo: 1,
      pageSize: 100,
      sortBy: 'lastMessageTime',
      sortOrder: 'desc',
    });
    sessionOptions.value = pageData.list;
  } catch (error) {
    sessionOptions.value = [];
    showErrorMessage(resolveErrorMessage(error, '会话下拉加载失败'));
  } finally {
    optionLoading.sessions = false;
  }
}

// 选中会话后再加载助手消息，避免反馈查询条件要求用户手动复制消息ID。
async function handleFeedbackSessionChange(sessionId: string): Promise<void> {
  feedbackForm.assistantMessageId = '';
  assistantMessageOptions.value = [];
  const normalizedSessionId = normalizeOptionalText(sessionId);
  if (!normalizedSessionId || !canQuerySessionDetail.value) {
    return;
  }
  optionLoading.messages = true;
  try {
    const detail = await chatApi.getSessionDetail(normalizedSessionId);
    assistantMessageOptions.value = detail.messageList.filter((message) => message.role === 'assistant');
  } catch (error) {
    assistantMessageOptions.value = [];
    showErrorMessage(resolveErrorMessage(error, '助手消息下拉加载失败'));
  } finally {
    optionLoading.messages = false;
  }
}

// 加载指标筛选所需的知识库、模型和模板下拉，筛选维度全部以已有管理接口为准。
async function loadMetricsOptions(): Promise<void> {
  await Promise.all([
    loadKnowledgeBaseOptions(),
    loadModelOptions(),
    loadPromptTemplateOptions(),
  ]);
}

// 知识库筛选只加载启用知识库，避免统计条件选到不可用对象。
async function loadKnowledgeBaseOptions(): Promise<void> {
  if (!canQueryKnowledgeBases.value) {
    knowledgeBaseOptions.value = [];
    return;
  }
  optionLoading.knowledgeBases = true;
  try {
    const pageData = await knowledgeApi.listKnowledgeBases({
      pageNo: 1,
      pageSize: 100,
      baseStatus: 'enabled',
      displayEnabled: true,
    });
    knowledgeBaseOptions.value = pageData.list;
  } catch (error) {
    knowledgeBaseOptions.value = [];
    showErrorMessage(resolveErrorMessage(error, '知识库下拉加载失败'));
  } finally {
    optionLoading.knowledgeBases = false;
  }
}

// 模型筛选只加载语言模型，和聊天回答统计的模型维度保持一致。
async function loadModelOptions(): Promise<void> {
  if (!canQueryModels.value) {
    modelOptions.value = [];
    return;
  }
  optionLoading.models = true;
  try {
    const pageData = await aiApi.listModels({
      pageNo: 1,
      pageSize: 100,
      modelType: 'language_model',
      modelStatus: 'enabled',
    });
    modelOptions.value = pageData.list;
  } catch (error) {
    modelOptions.value = [];
    showErrorMessage(resolveErrorMessage(error, '模型下拉加载失败'));
  } finally {
    optionLoading.models = false;
  }
}

// 模板筛选只加载启用模板，和提示词聊天统计维度保持一致。
async function loadPromptTemplateOptions(): Promise<void> {
  if (!canQueryPromptTemplates.value) {
    promptTemplateOptions.value = [];
    return;
  }
  optionLoading.templates = true;
  try {
    const pageData = await chatApi.listPromptTemplates({
      pageNo: 1,
      pageSize: 100,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      templateStatus: 'enabled',
    });
    promptTemplateOptions.value = pageData.list;
  } catch (error) {
    promptTemplateOptions.value = [];
    showErrorMessage(resolveErrorMessage(error, '提示词模板下拉加载失败'));
  } finally {
    optionLoading.templates = false;
  }
}

// 按后端统计口径加载指标，前端不从反馈分页结果自行推算。
async function loadMetrics(): Promise<void> {
  if (!canQueryMetrics.value) {
    metrics.value = null;
    return;
  }
  metricsLoading.value = true;
  try {
    metrics.value = await chatApi.getAnswerMetrics({
      timeRange: buildTimeRange(metricsForm.startTime, metricsForm.endTime),
      knowledgeBaseId: normalizeOptionalText(metricsForm.knowledgeBaseId),
      modelConfigId: normalizeOptionalText(metricsForm.modelConfigId),
      templateId: normalizeOptionalText(metricsForm.templateId),
    });
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '聊天指标加载失败'));
  } finally {
    metricsLoading.value = false;
  }
}

// 分页加载反馈记录，筛选和排序全部交给后端控制权限范围。
async function loadFeedback(): Promise<void> {
  if (!canQueryFeedback.value) {
    feedbackRows.value = [];
    feedbackTotal.value = 0;
    return;
  }
  feedbackLoading.value = true;
  try {
    const pageData = await chatApi.pageFeedback({
      pageNo: feedbackForm.pageNo,
      pageSize: feedbackForm.pageSize,
      sortBy: feedbackForm.sortBy,
      sortOrder: feedbackForm.sortOrder,
      sessionId: normalizeOptionalText(feedbackForm.sessionId),
      assistantMessageId: normalizeOptionalText(feedbackForm.assistantMessageId),
      feedbackType: feedbackForm.feedbackType,
      timeRange: buildTimeRange(feedbackForm.startTime, feedbackForm.endTime),
    });
    if (pageData.list.length === 0 && pageData.total > 0 && feedbackForm.pageNo > 1) {
      // 删除或筛选变化导致当前页为空时回退，保持分页状态与后端结果一致。
      feedbackForm.pageNo = Math.max(1, Math.ceil(pageData.total / feedbackForm.pageSize));
      await loadFeedback();
      return;
    }
    feedbackRows.value = pageData.list;
    feedbackTotal.value = pageData.total;
    feedbackForm.pageNo = pageData.pageNo;
    feedbackForm.pageSize = pageData.pageSize;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '反馈列表加载失败'));
  } finally {
    feedbackLoading.value = false;
  }
}

// 查询按钮重置到第一页，避免旧页码导致筛选结果看似为空。
async function searchFeedback(): Promise<void> {
  feedbackForm.pageNo = 1;
  await loadFeedback();
}

// 切换页码后重新请求后端分页，保持表格数据与总数一致。
async function handleFeedbackPageChange(nextPageNo: number): Promise<void> {
  feedbackForm.pageNo = nextPageNo;
  await loadFeedback();
}

// 切换每页数量时回到第一页，避免越界页码产生空列表。
async function handleFeedbackSizeChange(nextPageSize: number): Promise<void> {
  feedbackForm.pageSize = nextPageSize;
  feedbackForm.pageNo = 1;
  await loadFeedback();
}

onMounted(() => {
  void loadSessionOptions();
  void loadMetricsOptions();
  void loadMetrics();
  void loadFeedback();
});
</script>

<template>
  <section class="workspace-card system-page chat-feedback-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">反馈与指标</h2>
        <p class="section-heading__desc">查看聊天回答反馈记录和基础效果统计，不展示无权限会话正文。</p>
      </div>
      <div class="feedback-actions">
        <el-button :disabled="!canQueryMetrics" @click="loadMetrics">刷新指标</el-button>
        <el-button :disabled="!canQueryFeedback" @click="loadFeedback">刷新反馈</el-button>
      </div>
    </div>

    <section class="metrics-panel">
      <div class="metrics-panel__head">
        <h3>回答指标</h3>
        <div class="metrics-toolbar">
          <el-date-picker
            v-model="metricsForm.startTime"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="开始时间"
          />
          <el-date-picker
            v-model="metricsForm.endTime"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="结束时间"
          />
          <el-select
            v-model="metricsForm.knowledgeBaseId"
            clearable
            filterable
            :loading="optionLoading.knowledgeBases"
            placeholder="全部知识库"
            @change="handleMetricsKnowledgeBaseChange"
          >
            <el-option
              v-for="base in knowledgeBaseOptions"
              :key="base.knowledgeBaseId"
              :label="knowledgeBaseOptionLabel(base)"
              :value="String(base.knowledgeBaseId)"
            />
          </el-select>
          <el-select
            v-model="metricsForm.modelConfigId"
            clearable
            filterable
            :loading="optionLoading.models"
            placeholder="全部语言模型"
          >
            <el-option
              v-for="model in modelOptions"
              :key="model.modelId"
              :label="modelOptionLabel(model)"
              :value="String(model.modelId)"
            />
          </el-select>
          <el-select
            v-model="metricsForm.templateId"
            clearable
            filterable
            :loading="optionLoading.templates"
            placeholder="全部提示词模板"
            @change="handleMetricsPromptTemplateChange"
          >
            <el-option
              v-for="template in promptTemplateOptions"
              :key="template.promptTemplateId"
              :label="promptTemplateOptionLabel(template)"
              :value="String(template.promptTemplateId)"
            />
          </el-select>
          <el-button type="primary" :disabled="!canQueryMetrics" @click="loadMetrics">查询指标</el-button>
        </div>
      </div>
      <el-empty v-if="!canQueryMetrics" description="暂无聊天指标查询权限" />
      <div v-else v-loading="metricsLoading" class="metrics-cards">
        <article class="metrics-card">
          <span>总回答数</span>
          <strong>{{ metrics?.totalAnswerCount ?? 0 }}</strong>
        </article>
        <article class="metrics-card">
          <span>成功数</span>
          <strong>{{ metrics?.successCount ?? 0 }}</strong>
        </article>
        <article class="metrics-card">
          <span>失败数</span>
          <strong>{{ metrics?.failureCount ?? 0 }}</strong>
        </article>
        <article class="metrics-card">
          <span>成功率</span>
          <strong>{{ successRateText }}</strong>
        </article>
        <article class="metrics-card">
          <span>点赞数</span>
          <strong>{{ metrics?.likeCount ?? 0 }}</strong>
        </article>
        <article class="metrics-card">
          <span>点踩数</span>
          <strong>{{ metrics?.dislikeCount ?? 0 }}</strong>
        </article>
        <article class="metrics-card">
          <span>反馈率</span>
          <strong>{{ feedbackRateText }}</strong>
        </article>
      </div>
    </section>

    <section class="feedback-panel">
      <div class="feedback-panel__head">
        <div>
          <h3>反馈列表</h3>
          <span>{{ feedbackTypeSummary }}</span>
        </div>
      </div>
      <div class="feedback-toolbar">
        <el-select
          v-model="feedbackForm.sessionId"
          clearable
          filterable
          :loading="optionLoading.sessions"
          placeholder="全部会话"
          @change="handleFeedbackSessionChange"
        >
          <el-option
            v-for="session in sessionOptions"
            :key="session.sessionId"
            :label="sessionOptionLabel(session)"
            :value="session.sessionId"
          />
        </el-select>
        <el-select
          v-model="feedbackForm.assistantMessageId"
          clearable
          filterable
          :disabled="!feedbackForm.sessionId || !canQuerySessionDetail"
          :loading="optionLoading.messages"
          placeholder="全部助手回答"
        >
          <el-option
            v-for="message in assistantMessageOptions"
            :key="message.messageId"
            :label="assistantMessageOptionLabel(message)"
            :value="message.messageId"
          />
        </el-select>
        <el-select v-model="feedbackForm.feedbackType" placeholder="全部反馈" clearable>
          <el-option label="全部反馈" value="" />
          <el-option label="点赞" value="like" />
          <el-option label="点踩" value="dislike" />
        </el-select>
        <el-date-picker
          v-model="feedbackForm.startTime"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss"
          placeholder="开始时间"
        />
        <el-date-picker
          v-model="feedbackForm.endTime"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss"
          placeholder="结束时间"
        />
        <el-button type="primary" :disabled="!canQueryFeedback" @click="searchFeedback">查询反馈</el-button>
      </div>

      <el-empty v-if="!canQueryFeedback" description="暂无聊天反馈查询权限" />
      <template v-else>
        <el-table v-loading="feedbackLoading" :data="feedbackRows" border row-key="feedbackId" class="system-page__table">
          <el-table-column label="反馈类型" width="100">
            <template #default="{ row }">
              <el-tag :type="feedbackTagType(row.feedbackType)">{{ feedbackTypeText(row.feedbackType) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="会话" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.sessionTitleSummary || row.sessionBindingObjectName || `会话 ${row.sessionId}` }}
            </template>
          </el-table-column>
          <el-table-column label="用户问题" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.userMessagePreview || '无问题摘要' }}</template>
          </el-table-column>
          <el-table-column label="助手回答" min-width="260" show-overflow-tooltip>
            <template #default="{ row }">{{ row.assistantMessagePreview || '无回答摘要' }}</template>
          </el-table-column>
          <el-table-column prop="feedbackContent" label="反馈说明" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ row.feedbackContent || '无' }}</template>
          </el-table-column>
          <el-table-column label="反馈用户" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.feedbackUserName || row.feedbackUserId || '未知用户' }}</template>
          </el-table-column>
          <el-table-column label="提交时间" width="170">
            <template #default="{ row }">{{ formatTime(row.createdTime) }}</template>
          </el-table-column>
          <el-table-column label="更新时间" width="170">
            <template #default="{ row }">{{ formatTime(row.updatedTime) }}</template>
          </el-table-column>
        </el-table>

        <div class="feedback-pagination">
          <el-pagination
            v-model:current-page="feedbackForm.pageNo"
            v-model:page-size="feedbackForm.pageSize"
            background
            :page-sizes="[10, 20, 50, 100]"
            :total="feedbackTotal"
            layout="total, sizes, prev, pager, next"
            @current-change="handleFeedbackPageChange"
            @size-change="handleFeedbackSizeChange"
          />
        </div>
      </template>
    </section>
  </section>
</template>

<style scoped>
.feedback-actions,
.metrics-panel__head,
.metrics-toolbar,
.feedback-panel__head,
.feedback-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
}

.metrics-panel,
.feedback-panel {
  display: grid;
  gap: 12px;
}

.metrics-panel {
  margin-bottom: 18px;
}

.metrics-panel__head,
.feedback-panel__head {
  justify-content: space-between;
}

.metrics-panel__head h3,
.feedback-panel__head h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
}

.feedback-panel__head span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.metrics-toolbar,
.feedback-toolbar {
  flex-wrap: wrap;
}

.metrics-toolbar .el-input,
.feedback-toolbar .el-input {
  width: 160px;
}

.metrics-toolbar .el-select,
.feedback-toolbar .el-select {
  width: 220px;
}

.metrics-toolbar :deep(.el-date-editor),
.feedback-toolbar :deep(.el-date-editor) {
  width: 184px;
}

.metrics-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metrics-card {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.metrics-card span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.metrics-card strong {
  display: block;
  margin-top: 8px;
  color: var(--el-text-color-primary);
  font-size: 24px;
}

.feedback-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

@media (max-width: 980px) {
  .metrics-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .feedback-actions,
  .metrics-panel__head,
  .metrics-toolbar,
  .feedback-panel__head,
  .feedback-toolbar,
  .metrics-cards {
    display: grid;
    grid-template-columns: 1fr;
  }

  .metrics-toolbar .el-input,
  .feedback-toolbar .el-input,
  .metrics-toolbar .el-select,
  .feedback-toolbar .el-select,
  .metrics-toolbar :deep(.el-date-editor),
  .feedback-toolbar :deep(.el-date-editor) {
    width: 100%;
  }
}
</style>
