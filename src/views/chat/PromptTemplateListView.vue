<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { chatApi } from '@/api';
import { isApiRequestError } from '@/api/request';
import { usePermission } from '@/auth/permissions';
import type {
  PromptTemplateCreatePayload,
  PromptTemplateItem,
  PromptTemplateKnowledgeBindingType,
  PromptTemplateStatus,
  PromptTemplateUpdatePayload,
  SortOrder,
} from '@/types';
import { normalizeOptionalText } from '@/utils/api-feedback';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type FormMode = 'create' | 'edit';

interface TemplateFormState {
  templateCode: string;
  templateName: string;
  scenarioCode: string;
  templateContent: string;
  variableDefinitionsText: string;
  knowledgeBindingType: PromptTemplateKnowledgeBindingType;
  knowledgeBindingIdsText: string;
  templateStatus: PromptTemplateStatus;
  remark: string;
}

const templates = ref<PromptTemplateItem[]>([]);
const loading = ref(false);
const saving = ref(false);
const detailLoading = ref(false);
const dialogVisible = ref(false);
const detailDialogVisible = ref(false);
const formMode = ref<FormMode>('create');
const editingTemplateId = ref<string | null>(null);
const detailTemplate = ref<PromptTemplateItem | null>(null);
const keyword = ref('');
const scenarioCodeFilter = ref('');
const knowledgeBindingTypeFilter = ref<PromptTemplateKnowledgeBindingType | ''>('');
const templateStatusFilter = ref<PromptTemplateStatus | ''>('');
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const sortBy = ref('updatedAt');
const sortOrder = ref<SortOrder>('desc');
const { hasPermission, hasAnyPermission } = usePermission();

const templateForm = reactive<TemplateFormState>({
  templateCode: '',
  templateName: '',
  scenarioCode: '',
  templateContent: '',
  variableDefinitionsText: '{\n  "variables": []\n}',
  knowledgeBindingType: 'none',
  knowledgeBindingIdsText: '[]',
  templateStatus: 'enabled',
  remark: '',
});

const dialogTitle = computed(() => (formMode.value === 'create' ? '新增提示词模板' : '编辑提示词模板'));
const canQueryTemplates = computed(() => hasPermission('chat:prompt-template:query'));
const canViewTemplate = computed(() => hasPermission('chat:prompt-template:detail'));
const canCreateTemplate = computed(() => hasPermission('chat:prompt-template:create'));
const canUpdateTemplate = computed(() => hasPermission('chat:prompt-template:update'));
const canUpdateTemplateStatus = computed(() => hasPermission('chat:prompt-template:status'));
const canDeleteTemplate = computed(() => hasPermission('chat:prompt-template:delete'));
const canOperateTemplate = computed(() =>
  hasAnyPermission([
    'chat:prompt-template:detail',
    'chat:prompt-template:update',
    'chat:prompt-template:status',
    'chat:prompt-template:delete',
  ]),
);
const canSubmitTemplate = computed(() =>
  formMode.value === 'create' ? canCreateTemplate.value : canUpdateTemplate.value,
);
const enabledCount = computed(() => templates.value.filter((template) => template.templateStatus === 'enabled').length);

// 只对标准接口异常透出后端文案，普通异常使用当前操作默认提示。
function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

// 模板状态转中文，未知值保留原值便于联调时定位字典漂移。
function statusText(status: string | null | undefined): string {
  return status === 'enabled' ? '启用' : status === 'disabled' ? '停用' : status || '';
}

// 知识绑定类型转中文，避免列表直接展示后端枚举。
function bindingTypeText(bindingType: string | null | undefined): string {
  return bindingType === 'knowledge_base' ? '知识库' : '不绑定';
}

// 压缩展示审计时间，非法时间保留原值方便排查后端数据。
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

// 详情弹窗按格式化 JSON 展示，避免用户误读压缩后的配置。
function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

// 重置表单到新增模板默认值，避免编辑残留影响下一次新增。
function resetForm(): void {
  templateForm.templateCode = '';
  templateForm.templateName = '';
  templateForm.scenarioCode = '';
  templateForm.templateContent = '';
  templateForm.variableDefinitionsText = '{\n  "variables": []\n}';
  templateForm.knowledgeBindingType = 'none';
  templateForm.knowledgeBindingIdsText = '[]';
  templateForm.templateStatus = 'enabled';
  templateForm.remark = '';
}

// 用模板详情回填编辑表单，JSON 字段保持可编辑文本形态。
function fillForm(template: PromptTemplateItem): void {
  templateForm.templateCode = template.templateCode;
  templateForm.templateName = template.templateName;
  templateForm.scenarioCode = template.scenarioCode ?? '';
  templateForm.templateContent = template.templateContent;
  templateForm.variableDefinitionsText = formatJson(template.variableDefinitions);
  templateForm.knowledgeBindingType = template.knowledgeBindingType ?? 'none';
  templateForm.knowledgeBindingIdsText = formatJson(template.knowledgeBindingIds ?? []);
  templateForm.templateStatus = template.templateStatus;
  templateForm.remark = template.remark ?? '';
}

// 解析表单 JSON 字段，失败时停留在前端避免提交非法结构到后端。
function parseJsonField(rawText: string, fieldName: string): unknown | null {
  const text = rawText.trim();
  if (!text) {
    showErrorMessage(`${fieldName}不能为空`);
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    showErrorMessage(`${fieldName}不是合法 JSON`);
    return null;
  }
}

// 构造新增或编辑入参，模板编码只允许在新增时提交。
function buildPayload(): PromptTemplateCreatePayload | PromptTemplateUpdatePayload | null {
  const variableDefinitions = parseJsonField(templateForm.variableDefinitionsText, '变量定义');
  const knowledgeBindingIds = parseJsonField(templateForm.knowledgeBindingIdsText, '绑定知识 ID');
  if (variableDefinitions === null || knowledgeBindingIds === null) {
    return null;
  }
  if (!templateForm.templateName.trim()) {
    showErrorMessage('请填写模板名称');
    return null;
  }
  if (formMode.value === 'create' && !templateForm.templateCode.trim()) {
    showErrorMessage('请填写模板编码');
    return null;
  }
  if (!templateForm.templateContent.trim()) {
    showErrorMessage('请填写模板正文');
    return null;
  }

  // 绑定规则由后端最终校验，前端只保持 none 时传空数组，避免残留旧知识库 ID。
  const basePayload: PromptTemplateUpdatePayload = {
    templateName: templateForm.templateName.trim(),
    scenarioCode: normalizeOptionalText(templateForm.scenarioCode) ?? null,
    templateContent: templateForm.templateContent.trim(),
    variableDefinitions,
    knowledgeBindingType: templateForm.knowledgeBindingType,
    knowledgeBindingIds: templateForm.knowledgeBindingType === 'none' ? [] : knowledgeBindingIds,
    templateStatus: templateForm.templateStatus,
    remark: normalizeOptionalText(templateForm.remark) ?? null,
  };

  if (formMode.value === 'create') {
    return {
      templateCode: templateForm.templateCode.trim(),
      ...basePayload,
    };
  }
  return basePayload;
}

// 加载提示词模板分页，当前页越界时回退到最后一页。
async function loadTemplates(): Promise<void> {
  if (!canQueryTemplates.value) {
    templates.value = [];
    return;
  }
  loading.value = true;
  try {
    const pageData = await chatApi.listPromptTemplates({
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      keyword: normalizeOptionalText(keyword.value),
      scenarioCode: normalizeOptionalText(scenarioCodeFilter.value),
      knowledgeBindingType: knowledgeBindingTypeFilter.value,
      templateStatus: templateStatusFilter.value,
    });
    if (pageData.list.length === 0 && pageData.total > 0 && pageNo.value > 1) {
      // 删除或筛选后当前页可能为空，回退到最后一页避免用户停留在空表。
      pageNo.value = Math.max(1, Math.ceil(pageData.total / pageSize.value));
      await loadTemplates();
      return;
    }
    templates.value = pageData.list;
    total.value = pageData.total;
    pageNo.value = pageData.pageNo;
    pageSize.value = pageData.pageSize;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '提示词模板加载失败'));
  } finally {
    loading.value = false;
  }
}

// 查询动作重置到第一页，避免筛选后仍停留在旧页码。
async function searchTemplates(): Promise<void> {
  pageNo.value = 1;
  await loadTemplates();
}

// 分页页码变更后重新加载后端列表。
async function handlePageChange(nextPageNo: number): Promise<void> {
  pageNo.value = nextPageNo;
  await loadTemplates();
}

// 每页数量变更时重置页码，避免请求越界分页。
async function handleSizeChange(nextPageSize: number): Promise<void> {
  pageSize.value = nextPageSize;
  pageNo.value = 1;
  await loadTemplates();
}

// 打开新增弹窗时清理编辑态，避免复用旧模板 ID。
function openCreateTemplate(): void {
  formMode.value = 'create';
  editingTemplateId.value = null;
  resetForm();
  dialogVisible.value = true;
}

// 有详情权限时优先取完整详情，没有权限时只能使用列表行只读数据。
async function loadTemplateDetail(template: PromptTemplateItem): Promise<PromptTemplateItem> {
  if (!canViewTemplate.value) {
    return template;
  }
  return chatApi.getPromptTemplate(String(template.promptTemplateId));
}

// 打开编辑弹窗前加载最新详情，避免基于过期列表数据保存。
async function openEditTemplate(template: PromptTemplateItem): Promise<void> {
  formMode.value = 'edit';
  editingTemplateId.value = String(template.promptTemplateId);
  try {
    fillForm(await loadTemplateDetail(template));
    dialogVisible.value = true;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '提示词模板详情加载失败'));
  }
}

// 详情弹窗单独查询完整正文和 JSON 配置，避免列表截断影响查看。
async function openDetailTemplate(template: PromptTemplateItem): Promise<void> {
  detailDialogVisible.value = true;
  detailTemplate.value = null;
  detailLoading.value = true;
  try {
    detailTemplate.value = await chatApi.getPromptTemplate(String(template.promptTemplateId));
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '提示词模板详情加载失败'));
  } finally {
    detailLoading.value = false;
  }
}

// 根据当前模式提交新增或编辑，后端负责变量和知识绑定最终校验。
async function submitTemplate(): Promise<void> {
  const payload = buildPayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await chatApi.createPromptTemplate(payload as PromptTemplateCreatePayload);
      pageNo.value = 1;
      showSuccessMessage('提示词模板已新增');
    } else if (editingTemplateId.value) {
      await chatApi.updatePromptTemplate(editingTemplateId.value, payload as PromptTemplateUpdatePayload);
      showSuccessMessage('提示词模板已保存');
    }
    dialogVisible.value = false;
    await loadTemplates();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '提示词模板保存失败'));
  } finally {
    saving.value = false;
  }
}

// 启停模板使用独立接口，避免快捷操作误提交正文或变量定义。
async function changeTemplateStatus(template: PromptTemplateItem): Promise<void> {
  const nextStatus: PromptTemplateStatus = template.templateStatus === 'enabled' ? 'disabled' : 'enabled';
  const confirmed = await confirmAction({
    title: `${statusText(nextStatus)}模板`,
    message: `确认${statusText(nextStatus)}提示词模板“${template.templateName}”吗？`,
    confirmButtonText: statusText(nextStatus),
  });
  if (!confirmed) {
    return;
  }
  try {
    await chatApi.updatePromptTemplateStatus(String(template.promptTemplateId), { templateStatus: nextStatus });
    showSuccessMessage(`模板已${statusText(nextStatus)}`);
    await loadTemplates();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '模板状态更新失败'));
  }
}

// 删除模板前二次确认，已有会话绑定时以后端拒绝结果为准。
async function deleteTemplate(template: PromptTemplateItem): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除提示词模板',
    message: `确认删除提示词模板“${template.templateName}”吗？已有会话绑定时后端会拒绝删除。`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await chatApi.deletePromptTemplate(String(template.promptTemplateId));
    showSuccessMessage('提示词模板已删除');
    if (templates.value.length === 1 && pageNo.value > 1) {
      pageNo.value -= 1;
    }
    await loadTemplates();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '提示词模板删除失败'));
  }
}

onMounted(loadTemplates);
</script>

<template>
  <section class="workspace-card system-page prompt-template-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">提示词模板</h2>
        <p class="section-heading__desc">维护提示词正文、变量定义、适用场景和知识绑定范围。</p>
      </div>
      <div class="template-actions">
        <el-button :disabled="!canQueryTemplates" @click="loadTemplates">刷新</el-button>
        <el-button v-if="canCreateTemplate" type="primary" @click="openCreateTemplate">新增模板</el-button>
      </div>
    </div>

    <div class="template-toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索模板编码、名称或备注" @keyup.enter="searchTemplates" />
      <el-input v-model="scenarioCodeFilter" clearable placeholder="适用场景" @keyup.enter="searchTemplates" />
      <el-select v-model="knowledgeBindingTypeFilter" placeholder="全部绑定" clearable>
        <el-option label="全部绑定" value="" />
        <el-option label="不绑定" value="none" />
        <el-option label="知识库" value="knowledge_base" />
      </el-select>
      <el-select v-model="templateStatusFilter" placeholder="全部状态" clearable>
        <el-option label="全部状态" value="" />
        <el-option label="启用" value="enabled" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button type="primary" :disabled="!canQueryTemplates" @click="searchTemplates">查询</el-button>
    </div>

    <div class="template-summary">
      <span>共 {{ total }} 个模板</span>
      <span>当前页启用 {{ enabledCount }} 个</span>
    </div>

    <el-empty v-if="!canQueryTemplates" description="暂无提示词模板查询权限" />
    <template v-else>
      <el-table v-loading="loading" :data="templates" border row-key="promptTemplateId" class="system-page__table">
        <el-table-column label="模板名称" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="template-name">
              <span>{{ row.templateName }}</span>
              <el-tag v-if="row.available" size="small" type="success">可用</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="模板编码" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.templateCode }}</template>
        </el-table-column>
        <el-table-column label="适用场景" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.scenarioCode || '通用' }}</template>
        </el-table-column>
        <el-table-column label="知识绑定" width="104">
          <template #default="{ row }">{{ bindingTypeText(row.knowledgeBindingType) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="88">
          <template #default="{ row }">
            <el-tag :type="row.templateStatus === 'enabled' ? 'success' : 'danger'">
              {{ statusText(row.templateStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新人" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.updatedByName || row.createdByName || '系统' }}</template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatTime(row.updatedAt || row.createdAt) }}</template>
        </el-table-column>
        <el-table-column v-if="canOperateTemplate" label="操作" width="238" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canViewTemplate" link type="primary" @click="openDetailTemplate(row)">详情</el-button>
            <el-button v-if="canUpdateTemplate" link type="primary" @click="openEditTemplate(row)">编辑</el-button>
            <el-button v-if="canUpdateTemplateStatus" link type="primary" @click="changeTemplateStatus(row)">
              {{ row.templateStatus === 'enabled' ? '停用' : '启用' }}
            </el-button>
            <el-button v-if="canDeleteTemplate" link type="danger" @click="deleteTemplate(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="template-pagination">
        <el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          background
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </template>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="860px" align-center>
      <el-form :model="templateForm" label-position="top" class="template-form">
        <div class="template-form__grid">
          <el-form-item label="模板编码" required>
            <el-input v-if="formMode === 'create'" v-model="templateForm.templateCode" maxlength="64" placeholder="例如 qa.summary" />
            <el-input v-else v-model="templateForm.templateCode" disabled />
          </el-form-item>
          <el-form-item label="模板名称" required>
            <el-input v-model="templateForm.templateName" maxlength="128" placeholder="例如 知识问答摘要" />
          </el-form-item>
          <el-form-item label="适用场景">
            <el-input v-model="templateForm.scenarioCode" maxlength="64" placeholder="可为空" />
          </el-form-item>
          <el-form-item label="状态" required>
            <el-radio-group v-model="templateForm.templateStatus">
              <el-radio-button label="enabled">启用</el-radio-button>
              <el-radio-button label="disabled">停用</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="知识绑定类型">
            <el-radio-group v-model="templateForm.knowledgeBindingType">
              <el-radio-button label="none">不绑定</el-radio-button>
              <el-radio-button label="knowledge_base">知识库</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="绑定知识 ID JSON">
            <el-input v-model="templateForm.knowledgeBindingIdsText" type="textarea" :rows="3" placeholder="[ ]" />
          </el-form-item>
        </div>
        <el-form-item label="模板正文" required>
          <el-input
            v-model="templateForm.templateContent"
            type="textarea"
            :rows="8"
            maxlength="20000"
            placeholder="可使用 {{variableName}} 占位符"
          />
        </el-form-item>
        <el-form-item label="变量定义 JSON" required>
          <el-input v-model="templateForm.variableDefinitionsText" type="textarea" :rows="7" placeholder="{ }" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="templateForm.remark" type="textarea" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-if="canSubmitTemplate" type="primary" :loading="saving" @click="submitTemplate">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="提示词模板详情" width="820px" align-center>
      <el-skeleton v-if="detailLoading" :rows="6" animated />
      <el-descriptions v-else-if="detailTemplate" :column="2" border>
        <el-descriptions-item label="模板名称">{{ detailTemplate.templateName }}</el-descriptions-item>
        <el-descriptions-item label="模板编码">{{ detailTemplate.templateCode }}</el-descriptions-item>
        <el-descriptions-item label="适用场景">{{ detailTemplate.scenarioCode || '通用' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusText(detailTemplate.templateStatus) }}</el-descriptions-item>
        <el-descriptions-item label="知识绑定">{{ bindingTypeText(detailTemplate.knowledgeBindingType) }}</el-descriptions-item>
        <el-descriptions-item label="可用">{{ detailTemplate.available ? '是' : '否' }}</el-descriptions-item>
        <el-descriptions-item label="模板正文" :span="2">
          <pre class="template-detail__pre">{{ detailTemplate.templateContent }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="变量定义" :span="2">
          <pre class="template-detail__pre">{{ formatJson(detailTemplate.variableDefinitions) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="绑定知识 ID" :span="2">
          <pre class="template-detail__pre">{{ formatJson(detailTemplate.knowledgeBindingIds) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detailTemplate.remark || '无' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </section>
</template>

<style scoped>
.template-actions,
.template-toolbar,
.template-summary {
  display: flex;
  gap: 10px;
  align-items: center;
}

.template-toolbar {
  margin-bottom: 12px;
}

.template-toolbar .el-input {
  width: 240px;
}

.template-toolbar .el-select {
  width: 132px;
}

.template-summary {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.template-name {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.template-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.template-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.template-detail__pre {
  max-height: 260px;
  margin: 0;
  overflow: auto;
  color: var(--el-text-color-primary);
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
}

@media (max-width: 860px) {
  .template-actions,
  .template-toolbar,
  .template-summary,
  .template-form__grid {
    display: grid;
    grid-template-columns: 1fr;
  }

  .template-toolbar .el-input,
  .template-toolbar .el-select {
    width: 100%;
  }
}
</style>
