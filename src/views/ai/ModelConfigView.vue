<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { usePermission } from '@/auth/permissions';
import { aiApi } from '@/api/modules/ai';
import { isApiRequestError } from '@/api/request';
import type {
  AiModelConfig,
  AiModelConfigCreatePayload,
  AiModelConfigUpdatePayload,
  AiModelOrderUpdatePayload,
  AiModelReferenceWarning,
  AiModelStatus,
  AiModelTestMode,
  AiModelTestResult,
  AiModelType,
  EntityId,
} from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type FormMode = 'create' | 'edit';

interface ModelFormState {
  modelCode: string;
  modelName: string;
  modelType: AiModelType;
  providerCode: string;
  endpointUrl: string;
  apiKey: string;
  clearApiKey: boolean;
  timeoutMs: number;
  requestParamsText: string;
  sortOrder: number;
  defaultModel: boolean;
  modelStatus: AiModelStatus;
  remark: string;
}

const MODEL_TYPE_OPTIONS: Array<{ label: string; value: AiModelType }> = [
  { label: '语言模型', value: 'language_model' },
  { label: '向量模型', value: 'vector_model' },
  { label: '图像模型', value: 'image_model' },
  { label: '召回模型', value: 'retrieval_model' },
  { label: '重排模型', value: 'rerank_model' },
];

const models = ref<AiModelConfig[]>([]);
const loading = ref(false);
const saving = ref(false);
const detailLoading = ref(false);
const dialogVisible = ref(false);
const detailDialogVisible = ref(false);
const orderDialogVisible = ref(false);
const orderLoading = ref(false);
const testDialogVisible = ref(false);
const testing = ref(false);
const formMode = ref<FormMode>('create');
const editingModelId = ref<EntityId | null>(null);
const detailModel = ref<AiModelConfig | null>(null);
const testingModel = ref<AiModelConfig | null>(null);
const testMode = ref<AiModelTestMode>('connection');
const testResult = ref<AiModelTestResult | null>(null);
const orderModelType = ref<AiModelType>('language_model');
const orderRows = ref<AiModelConfig[]>([]);
const keyword = ref('');
const modelTypeFilter = ref<AiModelType | ''>('');
const modelStatusFilter = ref<AiModelStatus | ''>('');
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const { hasPermission, hasAnyPermission } = usePermission();

const modelForm = reactive<ModelFormState>({
  modelCode: '',
  modelName: '',
  modelType: 'language_model',
  providerCode: '',
  endpointUrl: '',
  apiKey: '',
  clearApiKey: false,
  timeoutMs: 30000,
  requestParamsText: '{}',
  sortOrder: 10,
  defaultModel: false,
  modelStatus: 'enabled',
  remark: '',
});

const dialogTitle = computed(() => (formMode.value === 'create' ? '新增模型配置' : '编辑模型配置'));
const canQueryModels = computed(() => hasPermission('ai:model:list'));
const canViewModel = computed(() => hasPermission('ai:model:detail'));
const canCreateModel = computed(() => hasPermission('ai:model:create'));
const canUpdateModel = computed(() => hasPermission('ai:model:update'));
const canUpdateStatus = computed(() => hasPermission('ai:model:status'));
const canUpdateDefault = computed(() => hasPermission('ai:model:default'));
const canUpdateOrder = computed(() => hasPermission('ai:model:order'));
const canTestModel = computed(() => hasPermission('ai:model:test'));
const canQueryReferenceWarnings = computed(() => hasPermission('ai:model:reference-query'));
const canDeleteModel = computed(() => hasPermission('ai:model:delete'));
const canOperateModel = computed(() =>
  hasAnyPermission([
    'ai:model:detail',
    'ai:model:update',
    'ai:model:status',
    'ai:model:default',
    'ai:model:test',
    'ai:model:delete',
  ]),
);
const canSubmitModel = computed(() => (formMode.value === 'create' ? canCreateModel.value : canUpdateModel.value));
const enabledCount = computed(() => models.value.filter((model) => model.modelStatus === 'enabled').length);
const defaultCount = computed(() => models.value.filter((model) => model.defaultModel).length);

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function statusText(status: AiModelStatus): string {
  return status === 'enabled' ? '启用' : '停用';
}

function modelTypeText(modelType: string): string {
  return MODEL_TYPE_OPTIONS.find((option) => option.value === modelType)?.label ?? modelType;
}

function safeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function isAuthOptionalProvider(providerCode: string | null | undefined): boolean {
  const normalizedProvider = safeText(providerCode).toLowerCase();
  return normalizedProvider === 'ollama' || normalizedProvider === 'local';
}

function canParticipateInFallback(model: AiModelConfig): boolean {
  return model.modelStatus === 'enabled'
    && !!safeText(model.endpointUrl)
    && (model.apiKeyConfigured || isAuthOptionalProvider(model.providerCode));
}

function fallbackEligibleText(model: AiModelConfig): string {
  return canParticipateInFallback(model) ? '可参与' : '不参与';
}

function fallbackEligibleTagType(model: AiModelConfig): 'success' | 'info' {
  return fallbackEligibleText(model) === '可参与' ? 'success' : 'info';
}

function apiKeyDisplayText(model: AiModelConfig): string {
  if (model.apiKeyConfigured) {
    return safeText(model.apiKeyMasked) || '已配置';
  }
  return isAuthOptionalProvider(model.providerCode) ? '本地无需' : '未配置';
}

function apiKeyTagType(model: AiModelConfig): 'success' | 'info' {
  return model.apiKeyConfigured || isAuthOptionalProvider(model.providerCode) ? 'success' : 'info';
}

function testModeText(mode: AiModelTestMode): string {
  return mode === 'connection' ? '连接测试' : '调用测试';
}

function buildWarningMessage(warnings: AiModelReferenceWarning[]): string {
  if (warnings.length === 0) {
    return '';
  }
  const preview = warnings
    .slice(0, 3)
    .map((warning) => `${warning.referenceName || warning.referenceId || warning.referenceType}：${warning.message}`)
    .join('；');
  return `\n\n引用风险：${preview}${warnings.length > 3 ? `；另有 ${warnings.length - 3} 项` : ''}`;
}

function resetForm(): void {
  modelForm.modelCode = '';
  modelForm.modelName = '';
  modelForm.modelType = 'language_model';
  modelForm.providerCode = '';
  modelForm.endpointUrl = '';
  modelForm.apiKey = '';
  modelForm.clearApiKey = false;
  modelForm.timeoutMs = 30000;
  modelForm.requestParamsText = '{}';
  modelForm.sortOrder = 10;
  modelForm.defaultModel = false;
  modelForm.modelStatus = 'enabled';
  modelForm.remark = '';
}

function fillForm(model: AiModelConfig): void {
  modelForm.modelCode = model.modelCode;
  modelForm.modelName = model.modelName;
  modelForm.modelType = model.modelType;
  modelForm.providerCode = model.providerCode;
  modelForm.endpointUrl = model.endpointUrl;
  modelForm.apiKey = '';
  modelForm.clearApiKey = false;
  modelForm.timeoutMs = model.timeoutMs;
  modelForm.requestParamsText = JSON.stringify(model.requestParams ?? {}, null, 2);
  modelForm.sortOrder = model.sortOrder;
  modelForm.defaultModel = model.defaultModel;
  modelForm.modelStatus = model.modelStatus;
  modelForm.remark = model.remark ?? '';
}

function parseRequestParams(): Record<string, unknown> | null {
  const text = modelForm.requestParamsText.trim();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      showErrorMessage('扩展参数必须是 JSON 对象');
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    showErrorMessage('扩展参数不是合法 JSON');
    return null;
  }
}

function buildPayload(): AiModelConfigCreatePayload | AiModelConfigUpdatePayload | null {
  const requestParams = parseRequestParams();
  if (!requestParams) {
    return null;
  }
  if (!modelForm.modelName.trim()) {
    showErrorMessage('请填写模型名称');
    return null;
  }
  if (formMode.value === 'create' && !modelForm.modelCode.trim()) {
    showErrorMessage('请填写模型标识');
    return null;
  }
  if (!modelForm.providerCode.trim()) {
    showErrorMessage('请填写供应商编码');
    return null;
  }
  if (!modelForm.endpointUrl.trim()) {
    showErrorMessage('请填写服务地址');
    return null;
  }
  if (modelForm.defaultModel && modelForm.modelStatus !== 'enabled') {
    showErrorMessage('默认模型必须处于启用状态');
    return null;
  }

  const basePayload = {
    modelName: modelForm.modelName.trim(),
    modelType: modelForm.modelType,
    providerCode: modelForm.providerCode.trim(),
    endpointUrl: modelForm.endpointUrl.trim(),
    apiKey: modelForm.apiKey.trim() || undefined,
    timeoutMs: modelForm.timeoutMs,
    requestParams,
    sortOrder: modelForm.sortOrder,
    defaultModel: modelForm.defaultModel,
    modelStatus: modelForm.modelStatus,
    remark: modelForm.remark.trim(),
  };

  if (formMode.value === 'create') {
    return {
      modelCode: modelForm.modelCode.trim(),
      ...basePayload,
    };
  }

  return {
    ...basePayload,
    clearApiKey: modelForm.clearApiKey,
  };
}

async function loadModels(): Promise<void> {
  if (!canQueryModels.value) {
    models.value = [];
    return;
  }
  loading.value = true;
  try {
    const pageData = await aiApi.listModels({
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim(),
      modelType: modelTypeFilter.value,
      modelStatus: modelStatusFilter.value,
    });
    if (pageData.list.length === 0 && pageData.total > 0 && pageNo.value > 1) {
      // 删除或筛选后当前页可能为空，回退到最后一页避免停留在空表。
      pageNo.value = Math.max(1, Math.ceil(pageData.total / pageSize.value));
      await loadModels();
      return;
    }
    pageNo.value = pageData.pageNo;
    pageSize.value = pageData.pageSize;
    total.value = pageData.total;
    models.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '模型配置加载失败'));
  } finally {
    loading.value = false;
  }
}

async function searchModels(): Promise<void> {
  pageNo.value = 1;
  await loadModels();
}

async function handlePageChange(nextPageNo: number): Promise<void> {
  pageNo.value = nextPageNo;
  await loadModels();
}

async function handleSizeChange(nextPageSize: number): Promise<void> {
  pageSize.value = nextPageSize;
  pageNo.value = 1;
  await loadModels();
}

async function loadOrderRows(): Promise<void> {
  orderLoading.value = true;
  try {
    const pageData = await aiApi.listModels({
      pageNo: 1,
      pageSize: 100,
      modelType: orderModelType.value,
    });
    orderRows.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '排序列表加载失败'));
  } finally {
    orderLoading.value = false;
  }
}

async function openOrderDialog(): Promise<void> {
  orderModelType.value = modelTypeFilter.value || 'language_model';
  orderDialogVisible.value = true;
  await loadOrderRows();
}

async function changeOrderModelType(): Promise<void> {
  await loadOrderRows();
}

async function saveModelOrder(): Promise<void> {
  if (orderRows.value.length === 0) {
    showErrorMessage('当前类型没有可保存的模型');
    return;
  }
  const payload: AiModelOrderUpdatePayload = {
    modelType: orderModelType.value,
    orders: orderRows.value.map((model) => ({
      modelId: model.modelId,
      sortOrder: model.sortOrder,
    })),
  };
  saving.value = true;
  try {
    orderRows.value = await aiApi.updateModelOrder(payload);
    showSuccessMessage('模型排序已保存');
    await loadModels();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '模型排序保存失败'));
  } finally {
    saving.value = false;
  }
}

function openCreateModel(): void {
  formMode.value = 'create';
  editingModelId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEditModel(model: AiModelConfig): void {
  formMode.value = 'edit';
  editingModelId.value = model.modelId;
  fillForm(model);
  dialogVisible.value = true;
}

async function openDetailModel(model: AiModelConfig): Promise<void> {
  if (!canViewModel.value) {
    showErrorMessage('暂无模型详情权限');
    return;
  }
  detailDialogVisible.value = true;
  detailLoading.value = true;
  detailModel.value = null;
  try {
    detailModel.value = await aiApi.getModel(model.modelId);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '模型详情加载失败'));
  } finally {
    detailLoading.value = false;
  }
}

async function loadReferenceWarnings(model: AiModelConfig): Promise<AiModelReferenceWarning[]> {
  if (!canQueryReferenceWarnings.value) {
    return [];
  }
  try {
    return await aiApi.listModelReferenceWarnings(model.modelId);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '模型引用风险加载失败'));
    return [];
  }
}

function openTestModel(model: AiModelConfig): void {
  testingModel.value = model;
  testMode.value = 'connection';
  testResult.value = null;
  testDialogVisible.value = true;
}

async function runModelTest(): Promise<void> {
  if (!testingModel.value) {
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    testResult.value = await aiApi.testModel(testingModel.value.modelId, { testMode: testMode.value });
    if (testResult.value.success) {
      showSuccessMessage(`${testModeText(testMode.value)}通过`);
    }
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, `${testModeText(testMode.value)}失败`));
  } finally {
    testing.value = false;
  }
}

async function submitModel(): Promise<void> {
  const payload = buildPayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await aiApi.createModel(payload as AiModelConfigCreatePayload);
      pageNo.value = 1;
      showSuccessMessage('模型配置已新增');
    } else if (editingModelId.value) {
      await aiApi.updateModel(editingModelId.value, payload as AiModelConfigUpdatePayload);
      showSuccessMessage('模型配置已保存');
    }
    dialogVisible.value = false;
    await loadModels();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '模型配置保存失败'));
  } finally {
    saving.value = false;
  }
}

async function changeModelStatus(model: AiModelConfig): Promise<void> {
  const nextStatus: AiModelStatus = model.modelStatus === 'enabled' ? 'disabled' : 'enabled';
  const warnings = nextStatus === 'disabled' ? await loadReferenceWarnings(model) : [];
  const confirmed = await confirmAction({
    title: `${statusText(nextStatus)}模型`,
    message: `确认${statusText(nextStatus)}模型“${model.modelName}”吗？${buildWarningMessage(warnings)}`,
    confirmButtonText: statusText(nextStatus),
  });
  if (!confirmed) {
    return;
  }
  try {
    await aiApi.updateModelStatus(model.modelId, { modelStatus: nextStatus });
    showSuccessMessage(`模型已${statusText(nextStatus)}`);
    await loadModels();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '模型状态更新失败'));
  }
}

async function changeDefaultModel(model: AiModelConfig): Promise<void> {
  const nextDefault = !model.defaultModel;
  if (nextDefault && model.modelStatus !== 'enabled') {
    showErrorMessage('停用模型不能设为默认');
    return;
  }
  const confirmed = await confirmAction({
    title: nextDefault ? '设为默认模型' : '取消默认模型',
    message: nextDefault
      ? `确认将“${model.modelName}”设为${modelTypeText(model.modelType)}默认模型吗？`
      : `确认取消“${model.modelName}”的默认标记吗？`,
    confirmButtonText: nextDefault ? '设为默认' : '取消默认',
  });
  if (!confirmed) {
    return;
  }
  try {
    await aiApi.updateModelDefault(model.modelId, { defaultModel: nextDefault });
    showSuccessMessage(nextDefault ? '默认模型已更新' : '默认标记已取消');
    await loadModels();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '默认模型更新失败'));
  }
}

async function deleteModel(model: AiModelConfig): Promise<void> {
  const warnings = await loadReferenceWarnings(model);
  const confirmed = await confirmAction({
    title: '删除模型配置',
    message: `确认删除模型“${model.modelName}”吗？${buildWarningMessage(warnings)}`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await aiApi.deleteModel(model.modelId);
    showSuccessMessage('模型配置已删除');
    if (models.value.length === 1 && pageNo.value > 1) {
      pageNo.value -= 1;
    }
    await loadModels();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '模型配置删除失败'));
  }
}

onMounted(loadModels);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">模型配置</h2>
        <p class="section-heading__desc">维护 AI 模型主数据、服务地址、默认标记和脱敏凭据状态。</p>
      </div>
      <div class="model-actions">
        <el-button @click="loadModels">刷新</el-button>
        <el-button v-if="canUpdateOrder" @click="openOrderDialog">排序维护</el-button>
        <el-button v-if="canCreateModel" type="primary" @click="openCreateModel">新增模型</el-button>
      </div>
    </div>

    <div class="model-toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索模型名称、标识或供应商" @keyup.enter="searchModels" />
      <el-select v-model="modelTypeFilter" placeholder="全部类型" clearable>
        <el-option label="全部类型" value="" />
        <el-option v-for="option in MODEL_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-select v-model="modelStatusFilter" placeholder="全部状态" clearable>
        <el-option label="全部状态" value="" />
        <el-option label="启用" value="enabled" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-button type="primary" :disabled="!canQueryModels" @click="searchModels">查询</el-button>
    </div>

    <div class="model-summary">
      <span>共 {{ total }} 个模型</span>
      <span>当前页启用 {{ enabledCount }} 个</span>
      <span>当前页默认 {{ defaultCount }} 个</span>
    </div>

    <el-empty v-if="!canQueryModels" description="暂无模型配置查询权限" />
    <template v-else>
      <el-table v-loading="loading" :data="models" border row-key="modelId" class="system-page__table">
        <el-table-column label="模型名称" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="model-name">
              <span>{{ row.modelName }}</span>
              <el-tag v-if="row.defaultModel" size="small" type="warning">默认</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="模型标识" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.modelCode }}</template>
        </el-table-column>
        <el-table-column label="类型" width="104">
          <template #default="{ row }">{{ modelTypeText(row.modelType) }}</template>
        </el-table-column>
        <el-table-column prop="providerCode" label="供应商" width="110" show-overflow-tooltip />
        <el-table-column prop="endpointUrl" label="服务地址" min-width="220" show-overflow-tooltip />
        <el-table-column label="fallback" width="96">
          <template #default="{ row }">
            <el-tag :type="fallbackEligibleTagType(row)">{{ fallbackEligibleText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="密钥" width="130">
          <template #default="{ row }">
            <el-tag :type="apiKeyTagType(row)">{{ apiKeyDisplayText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="88">
          <template #default="{ row }">
            <el-tag :type="row.modelStatus === 'enabled' ? 'success' : 'danger'">
              {{ statusText(row.modelStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="timeoutMs" label="超时(ms)" width="100" />
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column v-if="canOperateModel" label="操作" width="306" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canViewModel" link type="primary" @click="openDetailModel(row)">详情</el-button>
            <el-button v-if="canTestModel" link type="primary" @click="openTestModel(row)">测试</el-button>
            <el-button v-if="canUpdateModel" link type="primary" @click="openEditModel(row)">编辑</el-button>
            <el-button v-if="canUpdateStatus" link type="primary" @click="changeModelStatus(row)">
              {{ row.modelStatus === 'enabled' ? '停用' : '启用' }}
            </el-button>
            <el-button v-if="canUpdateDefault" link type="primary" @click="changeDefaultModel(row)">
              {{ row.defaultModel ? '取消默认' : '设为默认' }}
            </el-button>
            <el-button v-if="canDeleteModel" link type="danger" @click="deleteModel(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="model-pagination">
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" align-center>
      <el-form :model="modelForm" label-position="top" class="model-form">
        <div class="model-form__grid">
          <el-form-item label="模型标识" required>
            <el-input
              v-if="formMode === 'create'"
              v-model="modelForm.modelCode"
              maxlength="64"
              placeholder="例如 deepseek-r1:8b"
            />
            <el-input v-else v-model="modelForm.modelCode" disabled />
          </el-form-item>
          <el-form-item label="模型名称" required>
            <el-input v-model="modelForm.modelName" maxlength="128" placeholder="例如 通义千问主模型" />
          </el-form-item>
          <el-form-item label="模型类型" required>
            <el-select v-model="modelForm.modelType">
              <el-option v-for="option in MODEL_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="供应商编码" required>
            <el-input v-model="modelForm.providerCode" maxlength="64" placeholder="例如 dashscope" />
          </el-form-item>
          <el-form-item label="状态" required>
            <el-radio-group v-model="modelForm.modelStatus">
              <el-radio-button label="enabled">启用</el-radio-button>
              <el-radio-button label="disabled">停用</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="排序" required>
            <el-input-number v-model="modelForm.sortOrder" :min="0" :max="999999" controls-position="right" />
          </el-form-item>
          <el-form-item label="超时毫秒" required>
            <el-input-number v-model="modelForm.timeoutMs" :min="1000" :max="300000" :step="1000" controls-position="right" />
          </el-form-item>
          <el-form-item label="默认模型">
            <el-switch v-model="modelForm.defaultModel" active-text="是" inactive-text="否" />
          </el-form-item>
        </div>

        <el-form-item label="服务地址" required>
          <el-input v-model="modelForm.endpointUrl" maxlength="500" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="modelForm.apiKey"
            type="password"
            show-password
            maxlength="1000"
            :placeholder="formMode === 'create' ? '本地模型可留空，云模型请填写' : '留空表示保留原密钥，本地模型可不配置'"
          />
        </el-form-item>
        <el-checkbox v-if="formMode === 'edit'" v-model="modelForm.clearApiKey" :disabled="!!modelForm.apiKey.trim()">
          清空已保存的 API Key
        </el-checkbox>
        <el-form-item label="扩展参数 JSON" class="model-form__params">
          <el-input v-model="modelForm.requestParamsText" type="textarea" :rows="6" placeholder="{ }" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="modelForm.remark" type="textarea" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-if="canSubmitModel" type="primary" :loading="saving" @click="submitModel">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="orderDialogVisible" title="排序维护" width="720px" align-center>
      <div class="order-toolbar">
        <el-select v-model="orderModelType" @change="changeOrderModelType">
          <el-option v-for="option in MODEL_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </div>
      <el-table v-loading="orderLoading" :data="orderRows" border row-key="modelId" class="system-page__table">
        <el-table-column label="模型名称" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.modelName }}</template>
        </el-table-column>
        <el-table-column label="模型标识" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.modelCode }}</template>
        </el-table-column>
        <el-table-column label="状态" width="88">
          <template #default="{ row }">
            <el-tag :type="row.modelStatus === 'enabled' ? 'success' : 'danger'">
              {{ statusText(row.modelStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="fallback" width="96">
          <template #default="{ row }">
            <el-tag :type="fallbackEligibleTagType(row)">{{ fallbackEligibleText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="排序" width="160">
          <template #default="{ row }">
            <el-input-number v-model="row.sortOrder" :min="0" :max="999999" controls-position="right" />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="orderDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="saving" @click="saveModelOrder">保存排序</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="testDialogVisible" title="测试模型连接" width="680px" align-center>
      <div v-if="testingModel" class="model-test">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="模型名称">{{ testingModel.modelName }}</el-descriptions-item>
          <el-descriptions-item label="模型类型">{{ modelTypeText(testingModel.modelType) }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ testingModel.providerCode }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusText(testingModel.modelStatus) }}</el-descriptions-item>
        </el-descriptions>
        <div class="model-test__mode">
          <el-radio-group v-model="testMode">
            <el-radio-button label="connection">连接测试</el-radio-button>
            <el-radio-button label="invocation">调用测试</el-radio-button>
          </el-radio-group>
        </div>
        <el-alert
          v-if="testingModel.modelStatus === 'disabled'"
          type="warning"
          show-icon
          :closable="false"
          title="该模型当前停用，测试通过也不会参与正式 fallback。"
        />
        <el-alert
          v-if="testResult"
          class="model-test__result"
          :type="testResult.success ? 'success' : 'error'"
          show-icon
          :closable="false"
          :title="testResult.message"
        >
          <template #default>
            <div>耗时：{{ testResult.latencyMs }} ms</div>
            <div v-if="!testResult.success">错误码：{{ testResult.errorCode }}；可重试：{{ testResult.retryable ? '是' : '否' }}</div>
            <div v-if="testResult.referenceWarnings.length > 0">引用风险：{{ testResult.referenceWarnings.length }} 项</div>
          </template>
        </el-alert>
      </div>
      <template #footer>
        <el-button @click="testDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="testing" @click="runModelTest">{{ testModeText(testMode) }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="模型配置详情" width="720px" align-center>
      <el-skeleton v-if="detailLoading" :rows="6" animated />
      <el-descriptions v-else-if="detailModel" :column="2" border>
        <el-descriptions-item label="模型名称">{{ detailModel.modelName }}</el-descriptions-item>
        <el-descriptions-item label="模型标识">{{ detailModel.modelCode }}</el-descriptions-item>
        <el-descriptions-item label="模型类型">{{ modelTypeText(detailModel.modelType) }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ detailModel.providerCode }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusText(detailModel.modelStatus) }}</el-descriptions-item>
        <el-descriptions-item label="默认">{{ detailModel.defaultModel ? '是' : '否' }}</el-descriptions-item>
        <el-descriptions-item label="密钥">{{ detailModel.apiKeyConfigured ? detailModel.apiKeyMasked : '未配置' }}</el-descriptions-item>
        <el-descriptions-item label="超时">{{ detailModel.timeoutMs }} ms</el-descriptions-item>
        <el-descriptions-item label="服务地址" :span="2">{{ detailModel.endpointUrl }}</el-descriptions-item>
        <el-descriptions-item label="扩展参数" :span="2">
          <pre class="model-detail__json">{{ JSON.stringify(detailModel.requestParams ?? {}, null, 2) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detailModel.remark || '无' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </section>
</template>

<style scoped>
.model-actions,
.order-toolbar,
.model-toolbar,
.model-summary {
  display: flex;
  gap: 10px;
  align-items: center;
}

.model-toolbar {
  margin-bottom: 12px;
}

.order-toolbar {
  justify-content: flex-end;
  margin-bottom: 12px;
}

.order-toolbar .el-select {
  width: 180px;
}

.model-toolbar .el-input {
  width: 280px;
}

.model-toolbar .el-select {
  width: 132px;
}

.model-summary {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.model-name {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.model-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.model-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.model-form__params {
  margin-top: 12px;
}

.model-test {
  display: grid;
  gap: 14px;
}

.model-test__mode,
.model-test__result {
  margin-top: 4px;
}

.model-detail__json {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  color: var(--el-text-color-primary);
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
}

@media (max-width: 760px) {
  .model-actions,
  .order-toolbar,
  .model-toolbar,
  .model-summary,
  .model-form__grid {
    display: grid;
    grid-template-columns: 1fr;
  }

  .model-toolbar .el-input,
  .model-toolbar .el-select,
  .order-toolbar .el-select {
    width: 100%;
  }
}
</style>
