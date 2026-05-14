<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePermission } from '@/auth/permissions';
import { aiApi } from '@/api/modules/ai';
import { knowledgeApi } from '@/api/modules/knowledge';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type {
  AiModelConfig,
  AiModelType,
  EntityId,
  KnowledgeBase,
  KnowledgeBaseChunkStrategy,
  KnowledgeBaseChunkStrategyPayload,
  KnowledgeBaseCreatePayload,
  KnowledgeBaseStatus,
  KnowledgeBaseUpdatePayload,
  KnowledgeChunkConfig,
  KnowledgeChunkStrategyOption,
  KnowledgeChunkStrategyType,
  SystemDept,
  SystemUser,
} from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type FormMode = 'create' | 'edit';

interface KnowledgeBaseFormState {
  baseCode: string;
  baseName: string;
  description: string;
  ownerDeptId: string;
  ownerUserId: string;
  baseStatus: KnowledgeBaseStatus;
  displayEnabled: boolean;
  displayOrder: number;
  languageModelId: string;
  vectorModelId: string;
  rerankModelId: string;
  displaySummary: string;
}

interface ChunkStrategyFormState {
  chunkStrategyType: Exclude<KnowledgeChunkStrategyType, 'inherit'>;
  chunkSize: number;
  overlapSize: number;
  minChunkSize: number;
  separators: string;
  targetChunkSize: number;
  maxChunkSize: number;
  similarityThreshold: number;
  windowSize: number;
}

const bases = ref<KnowledgeBase[]>([]);
const router = useRouter();
const modelOptions = ref<AiModelConfig[]>([]);
const deptOptions = ref<SystemDept[]>([]);
const userOptions = ref<SystemUser[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const detailDialogVisible = ref(false);
const strategyDialogVisible = ref(false);
const detailLoading = ref(false);
const strategyLoading = ref(false);
const formMode = ref<FormMode>('create');
const editingBaseId = ref<EntityId | null>(null);
const detailBase = ref<KnowledgeBase | null>(null);
const strategyBase = ref<KnowledgeBase | null>(null);
const strategyOptions = ref<KnowledgeChunkStrategyOption[]>([]);
const keyword = ref('');
const ownerDeptIdFilter = ref('');
const ownerUserIdFilter = ref('');
const baseStatusFilter = ref<KnowledgeBaseStatus | ''>('');
const displayEnabledFilter = ref<boolean | ''>('');
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const { hasPermission, hasAnyPermission } = usePermission();

const form = reactive<KnowledgeBaseFormState>({
  baseCode: '',
  baseName: '',
  description: '',
  ownerDeptId: '',
  ownerUserId: '',
  baseStatus: 'enabled',
  displayEnabled: true,
  displayOrder: 100,
  languageModelId: '',
  vectorModelId: '',
  rerankModelId: '',
  displaySummary: '',
});

const strategyForm = reactive<ChunkStrategyFormState>({
  chunkStrategyType: 'fixed_overlap',
  chunkSize: 1000,
  overlapSize: 200,
  minChunkSize: 100,
  separators: '\\n# ,\\n## ,\\n### ,\\n\\n,\\n,。,；,，',
  targetChunkSize: 1000,
  maxChunkSize: 2000,
  similarityThreshold: 0.72,
  windowSize: 3,
});

const dialogTitle = computed(() => (formMode.value === 'create' ? '新增知识库' : '编辑知识库'));
const canQueryBase = computed(() => hasPermission('knowledge:base:query'));
const canViewBase = computed(() => hasPermission('knowledge:base:detail'));
const canCreateBase = computed(() => hasPermission('knowledge:base:create'));
const canUpdateBase = computed(() => hasPermission('knowledge:base:update'));
const canUpdateStatus = computed(() => hasPermission('knowledge:base:status'));
const canDeleteBase = computed(() => hasPermission('knowledge:base:delete'));
const canQueryDocument = computed(() => hasPermission('knowledge:document:query'));
const canQueryChunkStrategy = computed(() => hasPermission('knowledge:chunk-strategy:query'));
const canViewChunkStrategy = computed(() => hasPermission('knowledge:base:chunk-strategy-detail'));
const canSaveChunkStrategy = computed(() => hasPermission('knowledge:base:chunk-strategy-save'));
const canSubmitBase = computed(() => (formMode.value === 'create' ? canCreateBase.value : canUpdateBase.value));
const canOperateBase = computed(() =>
  hasAnyPermission([
    'knowledge:base:detail',
    'knowledge:base:update',
    'knowledge:base:status',
    'knowledge:base:delete',
    'knowledge:document:query',
    'knowledge:base:chunk-strategy-detail',
  ]),
);
const enabledCount = computed(() => bases.value.filter((item) => item.baseStatus === 'enabled').length);
const hasDeptOptions = computed(() => deptOptions.value.length > 0);
const hasUserOptions = computed(() => userOptions.value.length > 0);
const languageModelOptions = computed(() => filterModelOptions('language_model'));
const vectorModelOptions = computed(() => filterModelOptions('vector_model'));
const rerankModelOptions = computed(() => filterModelOptions('rerank_model'));
const concreteStrategyOptions = computed(() =>
  strategyOptions.value.filter((option) => option.strategyType !== 'inherit' && option.enabled),
);
const selectedStrategyOption = computed(() =>
  strategyOptions.value.find((option) => option.strategyType === strategyForm.chunkStrategyType),
);

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function statusText(status: KnowledgeBaseStatus): string {
  return status === 'enabled' ? '启用' : '停用';
}

function statusTagType(status: KnowledgeBaseStatus): 'success' | 'danger' {
  return status === 'enabled' ? 'success' : 'danger';
}

function displayEnabledText(displayEnabled: boolean): string {
  return displayEnabled ? '展示' : '隐藏';
}

function chunkStrategyText(strategyType: string | null | undefined): string {
  if (!strategyType) {
    return '系统默认';
  }
  return strategyOptions.value.find((option) => option.strategyType === strategyType)?.strategyName ?? strategyType;
}

function chunkStrategyTagType(executable: boolean | undefined): 'success' | 'warning' {
  return executable ? 'success' : 'warning';
}

function safeText(value: string | null | undefined, fallback = '未设置'): string {
  const normalized = value?.trim() ?? '';
  return normalized || fallback;
}

function ownerDeptText(base: Pick<KnowledgeBase, 'ownerDeptId' | 'ownerDeptName'>): string {
  if (base.ownerDeptId == null) {
    return '所有人可查看';
  }
  return safeText(base.ownerDeptName, String(base.ownerDeptId));
}

function filterModelOptions(modelType: AiModelType): AiModelConfig[] {
  return modelOptions.value.filter((model) => model.modelType === modelType && model.modelStatus === 'enabled');
}

function splitSeparators(value: string): string[] {
  const separators = value
    .split(',')
    .map((item) => item.trim().replace(/\\n/g, '\n'))
    .filter(Boolean);
  return separators.length > 0 ? separators : ['\n# ', '\n## ', '\n### ', '\n\n', '\n', '。', '；', '，'];
}

function numberValue(config: KnowledgeChunkConfig, key: string, fallback: number): number {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function separatorsText(config: KnowledgeChunkConfig, key: string): string {
  const value = config[key];
  return Array.isArray(value) ? value.map(String).join(',') : strategyForm.separators;
}

function resetForm(): void {
  form.baseCode = '';
  form.baseName = '';
  form.description = '';
  form.ownerDeptId = '';
  form.ownerUserId = '';
  form.baseStatus = 'enabled';
  form.displayEnabled = true;
  form.displayOrder = 100;
  form.languageModelId = '';
  form.vectorModelId = '';
  form.rerankModelId = '';
  form.displaySummary = '';
}

function resetStrategyForm(): void {
  strategyForm.chunkStrategyType = 'fixed_overlap';
  strategyForm.chunkSize = 1000;
  strategyForm.overlapSize = 200;
  strategyForm.minChunkSize = 100;
  strategyForm.separators = '\\n# ,\\n## ,\\n### ,\\n\\n,\\n,。,；,，';
  strategyForm.targetChunkSize = 1000;
  strategyForm.maxChunkSize = 2000;
  strategyForm.similarityThreshold = 0.72;
  strategyForm.windowSize = 3;
}

function fillForm(base: KnowledgeBase): void {
  form.baseCode = base.baseCode;
  form.baseName = base.baseName;
  form.description = base.description ?? '';
  form.ownerDeptId = String(base.ownerDeptId ?? '');
  form.ownerUserId = base.ownerUserId ? String(base.ownerUserId) : '';
  form.baseStatus = base.baseStatus;
  form.displayEnabled = base.displayEnabled;
  form.displayOrder = base.displayOrder ?? 100;
  form.languageModelId = base.languageModelId ? String(base.languageModelId) : '';
  form.vectorModelId = base.vectorModelId ? String(base.vectorModelId) : '';
  form.rerankModelId = base.rerankModelId ? String(base.rerankModelId) : '';
  form.displaySummary = base.displaySummary ?? '';
}

function fillStrategyForm(strategy: KnowledgeBaseChunkStrategy): void {
  const strategyType = strategy.chunkStrategyType ?? strategy.resolvedChunkStrategyType;
  const config = strategy.chunkConfig ?? strategy.resolvedChunkConfig;
  strategyForm.chunkStrategyType = strategyType;
  strategyForm.chunkSize = numberValue(config, 'chunkSize', numberValue(config, 'targetChunkSize', 1000));
  strategyForm.overlapSize = numberValue(config, 'overlapSize', 200);
  strategyForm.minChunkSize = numberValue(config, 'minChunkSize', 100);
  strategyForm.separators = separatorsText(config, strategyType === 'hybrid' ? 'recursiveSeparators' : 'separators');
  strategyForm.targetChunkSize = numberValue(config, 'targetChunkSize', strategyForm.chunkSize);
  strategyForm.maxChunkSize = numberValue(config, 'maxChunkSize', Math.max(2000, strategyForm.targetChunkSize));
  strategyForm.similarityThreshold = numberValue(config, 'similarityThreshold', 0.72);
  strategyForm.windowSize = numberValue(config, strategyType === 'hybrid' ? 'semanticWindow' : 'windowSize', 3);
}

function normalizeOptionalId(value: string): EntityId | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function buildChunkStrategyPayload(): KnowledgeBaseChunkStrategyPayload | null {
  const option = selectedStrategyOption.value;
  if (!option) {
    showErrorMessage('请选择分块策略');
    return null;
  }
  if (strategyForm.overlapSize >= strategyForm.chunkSize) {
    showErrorMessage('重叠长度必须小于分块长度');
    return null;
  }
  let chunkConfig: KnowledgeChunkConfig;
  if (strategyForm.chunkStrategyType === 'recursive') {
    chunkConfig = {
      chunkSize: strategyForm.chunkSize,
      overlapSize: strategyForm.overlapSize,
      minChunkSize: strategyForm.minChunkSize,
      separators: splitSeparators(strategyForm.separators),
      keepSeparator: true,
      fallbackStrategy: 'fixed_overlap',
    };
  } else if (strategyForm.chunkStrategyType === 'semantic') {
    chunkConfig = {
      targetChunkSize: strategyForm.targetChunkSize,
      minChunkSize: strategyForm.minChunkSize,
      maxChunkSize: strategyForm.maxChunkSize,
      similarityThreshold: strategyForm.similarityThreshold,
      windowSize: strategyForm.windowSize,
      fallbackStrategy: 'recursive',
    };
  } else if (strategyForm.chunkStrategyType === 'hybrid') {
    chunkConfig = {
      targetChunkSize: strategyForm.targetChunkSize,
      maxChunkSize: strategyForm.maxChunkSize,
      recursiveSeparators: splitSeparators(strategyForm.separators),
      semanticWindow: strategyForm.windowSize,
      similarityThreshold: strategyForm.similarityThreshold,
      fallbackStrategy: 'recursive',
    };
  } else {
    chunkConfig = {
      chunkSize: strategyForm.chunkSize,
      overlapSize: strategyForm.overlapSize,
      minChunkSize: strategyForm.minChunkSize,
      lengthUnit: 'char',
      preserveStructure: true,
    };
  }
  return {
    chunkStrategyType: strategyForm.chunkStrategyType,
    chunkConfig,
  };
}

function buildPayload(): KnowledgeBaseCreatePayload | KnowledgeBaseUpdatePayload | null {
  if (formMode.value === 'create' && !form.baseCode.trim()) {
    showErrorMessage('请填写知识库编码');
    return null;
  }
  if (!form.baseName.trim()) {
    showErrorMessage('请填写知识库名称');
    return null;
  }
  const basePayload = {
    baseName: form.baseName.trim(),
    description: form.description.trim(),
    ownerDeptId: normalizeOptionalId(form.ownerDeptId),
    ownerUserId: normalizeOptionalId(form.ownerUserId),
    baseStatus: form.baseStatus,
    displayEnabled: form.displayEnabled,
    displayOrder: form.displayOrder,
    languageModelId: normalizeOptionalId(form.languageModelId),
    vectorModelId: normalizeOptionalId(form.vectorModelId),
    rerankModelId: normalizeOptionalId(form.rerankModelId),
    displaySummary: form.displaySummary.trim(),
  };

  if (formMode.value === 'create') {
    return {
      baseCode: form.baseCode.trim(),
      ...basePayload,
    };
  }

  return basePayload;
}

async function loadKnowledgeBases(): Promise<void> {
  if (!canQueryBase.value) {
    bases.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const pageData = await knowledgeApi.listKnowledgeBases({
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim(),
      ownerDeptId: ownerDeptIdFilter.value.trim(),
      ownerUserId: ownerUserIdFilter.value.trim(),
      baseStatus: baseStatusFilter.value,
      displayEnabled: displayEnabledFilter.value,
    });
    if (pageData.list.length === 0 && pageData.total > 0 && pageNo.value > 1) {
      // 删除或筛选后当前页可能为空，回退到最后一页避免停留在空表。
      pageNo.value = Math.max(1, Math.ceil(pageData.total / pageSize.value));
      await loadKnowledgeBases();
      return;
    }
    pageNo.value = pageData.pageNo;
    pageSize.value = pageData.pageSize;
    total.value = pageData.total;
    bases.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '知识库加载失败'));
  } finally {
    loading.value = false;
  }
}

async function loadAuxiliaryOptions(): Promise<void> {
  if (canQueryChunkStrategy.value) {
    try {
      strategyOptions.value = await knowledgeApi.listKnowledgeChunkStrategies(false);
    } catch (error) {
      showErrorMessage(resolveErrorMessage(error, '分块策略选项加载失败'));
    }
  }
  if (hasPermission('ai:model:list')) {
    try {
      const pageData = await aiApi.listModels({ pageNo: 1, pageSize: 100, modelStatus: 'enabled' });
      modelOptions.value = pageData.list;
    } catch (error) {
      showErrorMessage(resolveErrorMessage(error, '模型选项加载失败'));
    }
  }
  if (hasPermission('system:dept:list')) {
    try {
      deptOptions.value = await systemApi.listDepartments();
    } catch (error) {
      showErrorMessage(resolveErrorMessage(error, '部门选项加载失败'));
    }
  }
  if (hasPermission('system:user:list')) {
    try {
      const pageData = await systemApi.listUsers({ pageNo: 1, pageSize: 100, userStatus: 'enabled' });
      userOptions.value = pageData.list;
    } catch (error) {
      showErrorMessage(resolveErrorMessage(error, '负责人选项加载失败'));
    }
  }
}

async function searchKnowledgeBases(): Promise<void> {
  pageNo.value = 1;
  await loadKnowledgeBases();
}

async function handlePageChange(nextPageNo: number): Promise<void> {
  pageNo.value = nextPageNo;
  await loadKnowledgeBases();
}

async function handleSizeChange(nextPageSize: number): Promise<void> {
  pageSize.value = nextPageSize;
  pageNo.value = 1;
  await loadKnowledgeBases();
}

function openCreateBase(): void {
  formMode.value = 'create';
  editingBaseId.value = null;
  resetForm();
  dialogVisible.value = true;
}

async function openEditBase(base: KnowledgeBase): Promise<void> {
  formMode.value = 'edit';
  editingBaseId.value = base.knowledgeBaseId;
  if (canViewBase.value) {
    try {
      fillForm(await knowledgeApi.getKnowledgeBase(base.knowledgeBaseId));
    } catch (error) {
      showErrorMessage(resolveErrorMessage(error, '知识库详情加载失败'));
      fillForm(base);
    }
  } else {
    fillForm(base);
  }
  dialogVisible.value = true;
}

async function openDetailBase(base: KnowledgeBase): Promise<void> {
  if (!canViewBase.value) {
    showErrorMessage('暂无知识库详情权限');
    return;
  }
  detailDialogVisible.value = true;
  detailLoading.value = true;
  detailBase.value = null;
  try {
    detailBase.value = await knowledgeApi.getKnowledgeBase(base.knowledgeBaseId);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '知识库详情加载失败'));
  } finally {
    detailLoading.value = false;
  }
}

async function openChunkStrategy(base: KnowledgeBase): Promise<void> {
  if (!canViewChunkStrategy.value) {
    showErrorMessage('暂无知识库分块策略查看权限');
    return;
  }
  strategyBase.value = base;
  resetStrategyForm();
  strategyDialogVisible.value = true;
  strategyLoading.value = true;
  try {
    const strategy = await knowledgeApi.getKnowledgeBaseChunkStrategy(base.knowledgeBaseId);
    if (strategy.strategyOptions.length > 0) {
      strategyOptions.value = strategy.strategyOptions;
    }
    fillStrategyForm(strategy);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '分块策略加载失败'));
  } finally {
    strategyLoading.value = false;
  }
}

async function submitChunkStrategy(): Promise<void> {
  if (!strategyBase.value) {
    return;
  }
  const payload = buildChunkStrategyPayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    await knowledgeApi.saveKnowledgeBaseChunkStrategy(strategyBase.value.knowledgeBaseId, payload);
    showSuccessMessage('分块策略已保存');
    strategyDialogVisible.value = false;
    await loadKnowledgeBases();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '分块策略保存失败'));
  } finally {
    saving.value = false;
  }
}

async function submitBase(): Promise<void> {
  const payload = buildPayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await knowledgeApi.createKnowledgeBase(payload as KnowledgeBaseCreatePayload);
      pageNo.value = 1;
      showSuccessMessage('知识库已新增');
    } else if (editingBaseId.value) {
      await knowledgeApi.updateKnowledgeBase(editingBaseId.value, payload as KnowledgeBaseUpdatePayload);
      showSuccessMessage('知识库已保存');
    }
    dialogVisible.value = false;
    await loadKnowledgeBases();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '知识库保存失败'));
  } finally {
    saving.value = false;
  }
}

async function changeBaseStatus(base: KnowledgeBase): Promise<void> {
  const nextStatus: KnowledgeBaseStatus = base.baseStatus === 'enabled' ? 'disabled' : 'enabled';
  const confirmed = await confirmAction({
    title: `${statusText(nextStatus)}知识库`,
    message: `确认${statusText(nextStatus)}知识库“${base.baseName}”吗？`,
    confirmButtonText: statusText(nextStatus),
  });
  if (!confirmed) {
    return;
  }
  try {
    await knowledgeApi.updateKnowledgeBaseStatus(base.knowledgeBaseId, { baseStatus: nextStatus });
    showSuccessMessage(`知识库已${statusText(nextStatus)}`);
    await loadKnowledgeBases();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '知识库状态更新失败'));
  }
}

async function deleteBase(base: KnowledgeBase): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除知识库',
    message: `确认删除知识库“${base.baseName}”吗？库下存在文档时后端会拒绝删除。`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await knowledgeApi.deleteKnowledgeBase(base.knowledgeBaseId);
    showSuccessMessage('知识库已删除');
    if (bases.value.length === 1 && pageNo.value > 1) {
      pageNo.value -= 1;
    }
    await loadKnowledgeBases();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '知识库删除失败'));
  }
}

function openDocumentManagement(base: KnowledgeBase): void {
  router.push({
    name: 'KnowledgeDocument',
    query: { baseId: String(base.knowledgeBaseId), baseName: base.baseName },
  });
}

onMounted(async () => {
  await Promise.all([loadKnowledgeBases(), loadAuxiliaryOptions()]);
});
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">知识库管理</h2>
        <p class="section-heading__desc">维护知识库基础信息、归属部门、负责人、状态和关联模型。</p>
      </div>
      <div class="knowledge-actions">
        <el-button @click="loadKnowledgeBases">刷新</el-button>
        <el-button v-if="canCreateBase" type="primary" @click="openCreateBase">新增知识库</el-button>
      </div>
    </div>

    <div class="knowledge-toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索名称、编码、摘要或负责人" @keyup.enter="searchKnowledgeBases" />
      <el-select v-if="hasDeptOptions" v-model="ownerDeptIdFilter" placeholder="全部部门" clearable filterable>
        <el-option label="全部部门" value="" />
        <el-option v-for="dept in deptOptions" :key="dept.deptId" :label="dept.deptName" :value="String(dept.deptId)" />
      </el-select>
      <el-input v-else v-model="ownerDeptIdFilter" clearable placeholder="所属部门ID" />
      <el-select
        v-if="hasUserOptions"
        v-model="ownerUserIdFilter"
        placeholder="全部负责人"
        clearable
        filterable
      >
        <el-option label="全部负责人" value="" />
        <el-option
          v-for="user in userOptions"
          :key="user.userId"
          :label="`${user.displayName}（${user.username}）`"
          :value="String(user.userId)"
        />
      </el-select>
      <el-select v-model="baseStatusFilter" placeholder="全部状态" clearable>
        <el-option label="全部状态" value="" />
        <el-option label="启用" value="enabled" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <el-select v-model="displayEnabledFilter" placeholder="全部展示" clearable>
        <el-option label="全部展示" value="" />
        <el-option label="展示" :value="true" />
        <el-option label="隐藏" :value="false" />
      </el-select>
      <el-button type="primary" :disabled="!canQueryBase" @click="searchKnowledgeBases">查询</el-button>
    </div>

    <div class="knowledge-summary">
      <span>共 {{ total }} 个知识库</span>
      <span>当前页启用 {{ enabledCount }} 个</span>
    </div>

    <el-empty v-if="!canQueryBase" description="暂无知识库查询权限" />
    <template v-else>
      <el-table v-loading="loading" :data="bases" border row-key="knowledgeBaseId" class="system-page__table">
        <el-table-column label="知识库名称" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="knowledge-name">
              <span>{{ row.baseName }}</span>
              <el-tag :type="statusTagType(row.baseStatus)" size="small">{{ statusText(row.baseStatus) }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="baseCode" label="编码" min-width="150" show-overflow-tooltip />
        <el-table-column label="所属部门" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ ownerDeptText(row) }}</template>
        </el-table-column>
        <el-table-column label="负责人" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.ownerUserName) }}</template>
        </el-table-column>
        <el-table-column label="展示" width="86">
          <template #default="{ row }">
            <el-tag :type="row.displayEnabled ? 'success' : 'info'" size="small">
              {{ displayEnabledText(row.displayEnabled) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="displayOrder" label="排序" width="82" />
        <el-table-column label="文档数" width="104">
          <template #default="{ row }">{{ row.visibleDocumentCount }} / {{ row.documentCount }}</template>
        </el-table-column>
        <el-table-column label="分块策略" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ chunkStrategyText(row.chunkStrategyType) }}</template>
        </el-table-column>
        <el-table-column label="语言模型" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.languageModelName) }}</template>
        </el-table-column>
        <el-table-column label="向量模型" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.vectorModelName) }}</template>
        </el-table-column>
        <el-table-column label="重排模型" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.rerankModelName) }}</template>
        </el-table-column>
        <el-table-column label="摘要" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.displaySummary || row.description) }}</template>
        </el-table-column>
        <el-table-column v-if="canOperateBase" label="操作" width="304" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canViewBase" link type="primary" @click="openDetailBase(row)">详情</el-button>
            <el-button v-if="canQueryDocument" link type="primary" @click="openDocumentManagement(row)">文档</el-button>
            <el-button v-if="canViewChunkStrategy" link type="primary" @click="openChunkStrategy(row)">策略</el-button>
            <el-button v-if="canUpdateBase" link type="primary" @click="openEditBase(row)">编辑</el-button>
            <el-button v-if="canUpdateStatus" link type="primary" @click="changeBaseStatus(row)">
              {{ row.baseStatus === 'enabled' ? '停用' : '启用' }}
            </el-button>
            <el-button v-if="canDeleteBase" link type="danger" @click="deleteBase(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="knowledge-pagination">
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
      <el-form :model="form" label-position="top" class="knowledge-form">
        <div class="knowledge-form__grid">
          <el-form-item label="知识库编码" required>
            <el-input
              v-if="formMode === 'create'"
              v-model="form.baseCode"
              maxlength="64"
              placeholder="例如 kb_policy"
            />
            <el-input v-else v-model="form.baseCode" disabled />
          </el-form-item>
          <el-form-item label="知识库名称" required>
            <el-input v-model="form.baseName" maxlength="128" placeholder="例如 企业制度库" />
          </el-form-item>
          <el-form-item label="所属部门">
            <el-select v-if="hasDeptOptions" v-model="form.ownerDeptId" clearable filterable placeholder="不指定部门（所有人可查看）">
              <el-option label="不指定部门（所有人可查看）" value="" />
              <el-option
                v-for="dept in deptOptions"
                :key="dept.deptId"
                :label="dept.deptName"
                :value="String(dept.deptId)"
              />
            </el-select>
            <el-input v-else v-model="form.ownerDeptId" clearable placeholder="所属部门ID，可为空；为空表示所有人可查看" />
          </el-form-item>
          <el-form-item label="负责人">
            <el-select
              v-model="form.ownerUserId"
              clearable
              filterable
              :disabled="!hasUserOptions"
              :placeholder="hasUserOptions ? '请选择负责人，可为空' : '暂无用户列表权限或可选用户'"
            >
              <el-option
                v-for="user in userOptions"
                :key="user.userId"
                :label="`${user.displayName}（${user.username}）`"
                :value="String(user.userId)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" required>
            <el-radio-group v-model="form.baseStatus">
              <el-radio-button label="enabled">启用</el-radio-button>
              <el-radio-button label="disabled">停用</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="入口展示">
            <el-switch v-model="form.displayEnabled" active-text="展示" inactive-text="隐藏" />
          </el-form-item>
          <el-form-item label="展示排序">
            <el-input-number
              v-model="form.displayOrder"
              :min="0"
              :max="999999"
              controls-position="right"
              placeholder="数值越小越靠前"
            />
          </el-form-item>
          <el-form-item label="语言模型">
            <el-select v-if="languageModelOptions.length > 0" v-model="form.languageModelId" clearable filterable>
              <el-option
                v-for="model in languageModelOptions"
                :key="model.modelId"
                :label="model.modelName"
                :value="String(model.modelId)"
              />
            </el-select>
            <el-input v-else v-model="form.languageModelId" placeholder="语言模型ID，可为空" />
          </el-form-item>
          <el-form-item label="向量模型">
            <el-select v-if="vectorModelOptions.length > 0" v-model="form.vectorModelId" clearable filterable>
              <el-option
                v-for="model in vectorModelOptions"
                :key="model.modelId"
                :label="model.modelName"
                :value="String(model.modelId)"
              />
            </el-select>
            <el-input v-else v-model="form.vectorModelId" placeholder="向量模型ID，可为空" />
          </el-form-item>
          <el-form-item label="重排模型">
            <el-select v-model="form.rerankModelId" clearable filterable placeholder="请选择重排模型，可为空">
              <el-option
                v-for="model in rerankModelOptions"
                :key="model.modelId"
                :label="model.modelName"
                :value="String(model.modelId)"
              />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="展示摘要">
          <el-input v-model="form.displaySummary" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="4" maxlength="1000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-if="canSubmitBase" type="primary" :loading="saving" @click="submitBase">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="知识库详情" width="760px" align-center>
      <el-skeleton v-if="detailLoading" :rows="6" animated />
      <el-descriptions v-else-if="detailBase" :column="2" border>
        <el-descriptions-item label="知识库名称">{{ detailBase.baseName }}</el-descriptions-item>
        <el-descriptions-item label="编码">{{ detailBase.baseCode }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusText(detailBase.baseStatus) }}</el-descriptions-item>
        <el-descriptions-item label="所属部门">{{ ownerDeptText(detailBase) }}</el-descriptions-item>
        <el-descriptions-item label="负责人">{{ safeText(detailBase.ownerUserName) }}</el-descriptions-item>
        <el-descriptions-item label="入口展示">{{ displayEnabledText(detailBase.displayEnabled) }}</el-descriptions-item>
        <el-descriptions-item label="展示排序">{{ detailBase.displayOrder }}</el-descriptions-item>
        <el-descriptions-item label="可见/总文档数">
          {{ detailBase.visibleDocumentCount }} / {{ detailBase.documentCount }}
        </el-descriptions-item>
        <el-descriptions-item label="语言模型">{{ safeText(detailBase.languageModelName) }}</el-descriptions-item>
        <el-descriptions-item label="向量模型">{{ safeText(detailBase.vectorModelName) }}</el-descriptions-item>
        <el-descriptions-item label="重排模型">{{ safeText(detailBase.rerankModelName) }}</el-descriptions-item>
        <el-descriptions-item label="分块策略">{{ chunkStrategyText(detailBase.chunkStrategyType) }}</el-descriptions-item>
        <el-descriptions-item label="展示摘要" :span="2">{{ safeText(detailBase.displaySummary) }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">{{ safeText(detailBase.description) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <el-dialog
      v-model="strategyDialogVisible"
      :title="strategyBase ? `处理策略：${strategyBase.baseName}` : '处理策略'"
      width="720px"
      align-center
    >
      <el-skeleton v-if="strategyLoading" :rows="6" animated />
      <el-form v-else :model="strategyForm" label-position="top" class="knowledge-form">
        <el-alert
          title="保存配置不等于立即生成分块；发布或处理文档时才会生成处理版本和 chunk。"
          type="info"
          :closable="false"
          show-icon
        />
        <div class="chunk-strategy-summary">
          <span>当前策略</span>
          <el-tag :type="chunkStrategyTagType(selectedStrategyOption?.executable)">
            {{ selectedStrategyOption?.strategyName || chunkStrategyText(strategyForm.chunkStrategyType) }}
          </el-tag>
          <span v-if="selectedStrategyOption && !selectedStrategyOption.executable" class="chunk-strategy-summary__warning">
            {{ selectedStrategyOption.disabledReason }}
          </span>
        </div>
        <div class="knowledge-form__grid">
          <el-form-item label="分块方式" required>
            <el-select v-model="strategyForm.chunkStrategyType" filterable>
              <el-option
                v-for="option in concreteStrategyOptions"
                :key="option.strategyType"
                :label="option.strategyName"
                :value="option.strategyType"
              >
                <span>{{ option.strategyName }}</span>
                <el-tag class="chunk-option-tag" size="small" :type="chunkStrategyTagType(option.executable)">
                  {{ option.executable ? '可执行' : '预留' }}
                </el-tag>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item
            v-if="strategyForm.chunkStrategyType === 'fixed_overlap' || strategyForm.chunkStrategyType === 'recursive'"
            label="分块长度"
            required
          >
            <el-input-number v-model="strategyForm.chunkSize" :min="300" :max="4000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="strategyForm.chunkStrategyType === 'fixed_overlap' || strategyForm.chunkStrategyType === 'recursive'"
            label="重叠长度"
            required
          >
            <el-input-number v-model="strategyForm.overlapSize" :min="0" :max="1000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="strategyForm.chunkStrategyType !== 'hybrid'"
            label="最小片段长度"
            required
          >
            <el-input-number v-model="strategyForm.minChunkSize" :min="20" :max="4000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="strategyForm.chunkStrategyType === 'semantic' || strategyForm.chunkStrategyType === 'hybrid'"
            label="目标片段长度"
            required
          >
            <el-input-number v-model="strategyForm.targetChunkSize" :min="300" :max="4000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="strategyForm.chunkStrategyType === 'semantic' || strategyForm.chunkStrategyType === 'hybrid'"
            label="最大片段长度"
            required
          >
            <el-input-number v-model="strategyForm.maxChunkSize" :min="300" :max="8000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="strategyForm.chunkStrategyType === 'semantic' || strategyForm.chunkStrategyType === 'hybrid'"
            label="语义相似度阈值"
            required
          >
            <el-input-number
              v-model="strategyForm.similarityThreshold"
              :min="0.1"
              :max="0.95"
              :step="0.01"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item
            v-if="strategyForm.chunkStrategyType === 'semantic' || strategyForm.chunkStrategyType === 'hybrid'"
            label="语义窗口"
            required
          >
            <el-input-number v-model="strategyForm.windowSize" :min="1" :max="8" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item v-if="strategyForm.chunkStrategyType === 'recursive' || strategyForm.chunkStrategyType === 'hybrid'" label="结构分隔符">
          <el-input v-model="strategyForm.separators" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="strategyDialogVisible = false">取消</el-button>
        <el-button v-if="canSaveChunkStrategy" type="primary" :loading="saving" @click="submitChunkStrategy">保存</el-button>
      </template>
    </el-dialog>

  </section>
</template>

<style scoped>
.knowledge-actions,
.knowledge-toolbar,
.knowledge-summary {
  display: flex;
  gap: 10px;
  align-items: center;
}

.knowledge-toolbar {
  margin-bottom: 12px;
}

.knowledge-toolbar .el-input {
  width: 260px;
}

.knowledge-toolbar .el-select {
  width: 150px;
}

.knowledge-form :deep(.el-input-number) {
  width: 100%;
}

.chunk-strategy-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 12px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.chunk-strategy-summary__warning {
  color: var(--el-color-warning);
}

.chunk-option-tag {
  float: right;
  margin-top: 6px;
}

.knowledge-summary {
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.knowledge-name {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.knowledge-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.knowledge-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 760px) {
  .knowledge-actions,
  .knowledge-toolbar,
  .knowledge-summary,
  .knowledge-form__grid {
    display: grid;
    grid-template-columns: 1fr;
  }

  .knowledge-toolbar .el-input,
  .knowledge-toolbar .el-select {
    width: 100%;
  }
}
</style>
