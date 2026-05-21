<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { knowledgeApi } from '@/api/modules/knowledge';
import { isApiRequestError } from '@/api/request';
import { usePermission } from '@/auth/permissions';
import type {
  AiModelConfig,
  EntityId,
  KnowledgeBaseConfig,
  KnowledgeBaseConfigPayload,
  KnowledgeBaseChunkStrategy,
  KnowledgeBaseRetrievalConfig,
  KnowledgeChunkConfig,
  KnowledgeChunkStrategyOption,
  KnowledgeChunkStrategyType,
} from '@/types';
import { showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

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

interface RetrievalConfigFormState {
  retrievalEnabled: boolean;
  vectorModelId: string;
  topK: number;
  topN: number;
  rerankEnabled: boolean;
  rerankModelId: string;
}

const props = withDefaults(defineProps<{
  baseId: EntityId | string | null;
  compact?: boolean;
}>(), {
  compact: false,
});

const emit = defineEmits<{
  saved: [config: KnowledgeBaseConfig];
}>();

const { hasPermission } = usePermission();
const canViewConfig = computed(() => hasPermission('knowledge:base:config-detail'));
const canSaveConfig = computed(() => hasPermission('knowledge:base:config-save'));
const normalizedBaseId = computed(() => String(props.baseId ?? '').trim());
const loading = ref(false);
const saving = ref(false);
const config = ref<KnowledgeBaseConfig | null>(null);

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

const retrievalForm = reactive<RetrievalConfigFormState>({
  retrievalEnabled: true,
  vectorModelId: '',
  topK: 20,
  topN: 3,
  rerankEnabled: false,
  rerankModelId: '',
});

const readonly = computed(() => !canSaveConfig.value);
const strategyOptions = computed(() => config.value?.chunkStrategy.strategyOptions ?? []);
const concreteStrategyOptions = computed(() =>
  strategyOptions.value.filter((option) => option.strategyType !== 'inherit' && option.enabled),
);
const selectedStrategyOption = computed(() =>
  strategyOptions.value.find((option) => option.strategyType === strategyForm.chunkStrategyType),
);
const modelOptions = computed<AiModelConfig[]>(() => config.value?.modelOptions ?? []);
const vectorModelOptions = computed(() =>
  modelOptions.value.filter((model) => model.modelType === 'vector_model' && model.modelStatus === 'enabled'),
);
const rerankModelOptions = computed(() =>
  modelOptions.value.filter((model) => model.modelType === 'rerank_model' && model.modelStatus === 'enabled'),
);
const retrievalConfig = computed<KnowledgeBaseRetrievalConfig | null>(() => config.value?.retrievalConfig ?? null);
const maxTopN = computed(() => Math.min(retrievalConfig.value?.systemMaxTopN ?? 10, 10, retrievalForm.topK));
const retrievalStatusText = computed(() => (retrievalForm.retrievalEnabled ? '已启用' : '已关闭'));
const rerankStatusText = computed(() => (retrievalForm.rerankEnabled ? '已启用' : '未启用'));

// 页面只展示接口错误文案；非接口异常用当前操作的兜底提示。
function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

// ID 在前端表单中使用字符串承载，提交时空值统一转成 null。
function normalizeOptionalId(value: string): EntityId | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

// 分隔符用逗号编辑，提交时还原换行符，避免 textarea 直接输入换行导致含义不清。
function splitSeparators(value: string): string[] {
  const separators = value
    .split(',')
    .map((item) => item.trim().replace(/\\n/g, '\n'))
    .filter(Boolean);
  return separators.length > 0 ? separators : ['\n# ', '\n## ', '\n### ', '\n\n', '\n', '。', '；', '，'];
}

// 数字配置从后端 JSON 中读取，非法历史值按默认值回显，最终仍由后端保存校验。
function numberValue(configValue: KnowledgeChunkConfig, key: string, fallback: number): number {
  const value = configValue[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// 分隔符配置只接受数组回显，避免历史脏数据直接展示成不可编辑对象。
function separatorsText(configValue: KnowledgeChunkConfig, key: string): string {
  const value = configValue[key];
  return Array.isArray(value) ? value.map(String).join(',') : strategyForm.separators;
}

// 策略名称以后端选项为准；无选项时展示编码，便于定位字典或接口问题。
function chunkStrategyText(strategyType: string | null | undefined): string {
  if (!strategyType) {
    return '系统默认';
  }
  return strategyOptions.value.find((option) => option.strategyType === strategyType)?.strategyName ?? strategyType;
}

// 可执行状态只影响提示样式，是否允许保存仍以后端配置和校验为准。
function chunkStrategyTagType(executable: boolean | undefined): 'success' | 'warning' {
  return executable ? 'success' : 'warning';
}

// 策略表单恢复默认值，切换知识库或接口异常时避免残留上一个知识库配置。
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

// 检索表单恢复系统常用默认值，真正边界在加载配置后以后端返回为准。
function resetRetrievalForm(): void {
  retrievalForm.retrievalEnabled = true;
  retrievalForm.vectorModelId = '';
  retrievalForm.topK = 20;
  retrievalForm.topN = 3;
  retrievalForm.rerankEnabled = false;
  retrievalForm.rerankModelId = '';
}

// 根据后端策略响应填充表单，当前配置为空时使用最终生效配置预览。
function fillStrategyForm(strategy: KnowledgeBaseChunkStrategy): void {
  const strategyType = strategy.chunkStrategyType ?? strategy.resolvedChunkStrategyType;
  const chunkConfig = strategy.chunkConfig ?? strategy.resolvedChunkConfig;
  strategyForm.chunkStrategyType = strategyType;
  applyChunkConfig(strategyType, chunkConfig);
}

// 根据策略配置对象填入对应字段，切换策略和接口回显复用同一套转换。
function applyChunkConfig(
  strategyType: Exclude<KnowledgeChunkStrategyType, 'inherit'>,
  chunkConfig: KnowledgeChunkConfig | null | undefined,
): void {
  const source: KnowledgeChunkConfig = chunkConfig ?? {};
  strategyForm.chunkSize = numberValue(source, 'chunkSize', numberValue(source, 'targetChunkSize', 1000));
  strategyForm.overlapSize = numberValue(source, 'overlapSize', 200);
  strategyForm.minChunkSize = numberValue(source, 'minChunkSize', 100);
  strategyForm.separators = separatorsText(source, strategyType === 'hybrid' ? 'recursiveSeparators' : 'separators');
  strategyForm.targetChunkSize = numberValue(source, 'targetChunkSize', strategyForm.chunkSize);
  strategyForm.maxChunkSize = numberValue(source, 'maxChunkSize', Math.max(2000, strategyForm.targetChunkSize));
  strategyForm.similarityThreshold = numberValue(source, 'similarityThreshold', 0.72);
  strategyForm.windowSize = numberValue(source, strategyType === 'hybrid' ? 'semanticWindow' : 'windowSize', 3);
}

// 选择新策略时应用该策略默认参数，避免把上一种策略的无关字段带入保存请求。
function handleStrategyTypeChange(): void {
  const option = selectedStrategyOption.value;
  if (!option || option.strategyType === 'inherit') {
    return;
  }
  applyChunkConfig(option.strategyType, option.defaultConfig);
}

// 后端检索配置是默认值和系统边界的来源，前端只做回填。
function fillRetrievalForm(nextConfig: KnowledgeBaseRetrievalConfig): void {
  retrievalForm.retrievalEnabled = nextConfig.retrievalEnabled;
  retrievalForm.vectorModelId = nextConfig.vectorModelId ? String(nextConfig.vectorModelId) : '';
  retrievalForm.topK = nextConfig.topK;
  retrievalForm.topN = nextConfig.topN;
  retrievalForm.rerankEnabled = nextConfig.rerankEnabled;
  retrievalForm.rerankModelId = nextConfig.rerankModelId ? String(nextConfig.rerankModelId) : '';
}

// 保存前做基础边界提示；最终范围、模型类型和启用状态仍由后端统一校验。
function buildPayload(): KnowledgeBaseConfigPayload | null {
  if (!normalizedBaseId.value) {
    showErrorMessage('缺少知识库ID');
    return null;
  }
  const option = selectedStrategyOption.value;
  if (!option || option.strategyType === 'inherit') {
    showErrorMessage('请选择处理策略');
    return null;
  }
  if (strategyForm.overlapSize >= strategyForm.chunkSize) {
    showErrorMessage('重叠长度必须小于分块长度');
    return null;
  }
  if (retrievalForm.topK < 1 || (retrievalConfig.value && retrievalForm.topK > retrievalConfig.value.systemMaxTopK)) {
    showErrorMessage(`TopK范围为1到${retrievalConfig.value?.systemMaxTopK ?? 100}`);
    return null;
  }
  if (retrievalForm.topN < 1 || retrievalForm.topN > maxTopN.value) {
    showErrorMessage(`TopN范围为1到${maxTopN.value}，且不能大于TopK`);
    return null;
  }
  if (retrievalForm.retrievalEnabled && !retrievalForm.vectorModelId) {
    showErrorMessage('启用检索时请选择向量模型');
    return null;
  }
  if (retrievalForm.rerankEnabled && !retrievalForm.rerankModelId) {
    showErrorMessage('启用重排时请选择重排模型');
    return null;
  }
  return {
    chunkStrategy: buildChunkStrategyPayload(),
    retrievalConfig: {
      retrievalEnabled: retrievalForm.retrievalEnabled,
      vectorModelId: normalizeOptionalId(retrievalForm.vectorModelId),
      topK: retrievalForm.topK,
      topN: retrievalForm.topN,
      rerankEnabled: retrievalForm.rerankEnabled,
      rerankModelId: normalizeOptionalId(retrievalForm.rerankModelId),
    },
  };
}

// 按当前策略组装分块配置，只提交所选策略实际需要的字段。
function buildChunkStrategyPayload(): KnowledgeBaseConfigPayload['chunkStrategy'] {
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

// 聚合查询一次返回配置页全部数据，避免处理策略、检索配置和模型选项拆开加载。
async function loadConfig(): Promise<void> {
  if (!canViewConfig.value || !normalizedBaseId.value) {
    config.value = null;
    resetStrategyForm();
    resetRetrievalForm();
    return;
  }
  loading.value = true;
  try {
    const nextConfig = await knowledgeApi.getKnowledgeBaseConfig(normalizedBaseId.value);
    config.value = nextConfig;
    fillStrategyForm(nextConfig.chunkStrategy);
    fillRetrievalForm(nextConfig.retrievalConfig);
  } catch (error) {
    config.value = null;
    showErrorMessage(resolveErrorMessage(error, '知识库配置加载失败'));
  } finally {
    loading.value = false;
  }
}

// 保存后使用聚合接口返回值重新回填页面，确保展示与后端归一化结果一致。
async function submitConfig(): Promise<void> {
  const payload = buildPayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    const savedConfig = await knowledgeApi.saveKnowledgeBaseConfig(normalizedBaseId.value, payload);
    config.value = savedConfig;
    fillStrategyForm(savedConfig.chunkStrategy);
    fillRetrievalForm(savedConfig.retrievalConfig);
    emit('saved', savedConfig);
    showSuccessMessage('知识库配置已保存');
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '知识库配置保存失败'));
  } finally {
    saving.value = false;
  }
}

watch(() => props.baseId, async () => {
  await loadConfig();
});

onMounted(async () => {
  await loadConfig();
});
</script>

<template>
  <div class="base-config-panel" :class="{ 'base-config-panel--compact': compact }">
    <el-empty v-if="!normalizedBaseId" description="缺少知识库ID" />
    <el-empty v-else-if="!canViewConfig" description="暂无知识库配置查看权限" />
    <el-skeleton v-else-if="loading" :rows="10" animated />
    <el-form v-else :model="{ strategyForm, retrievalForm }" label-position="top" class="base-config-form">
      <div class="base-config-panel__head">
        <div class="base-config-panel__title">
          <h3>处理与检索配置</h3>
          <p v-if="config">{{ config.baseName }}</p>
        </div>
        <div class="base-config-panel__actions">
          <el-button :disabled="!canViewConfig" @click="loadConfig">刷新</el-button>
          <el-button v-if="canSaveConfig" type="primary" :loading="saving" @click="submitConfig">保存配置</el-button>
        </div>
      </div>

      <div class="base-config-summary" aria-label="当前配置摘要">
        <div class="base-config-summary__item">
          <span>处理策略</span>
          <strong>{{ selectedStrategyOption?.strategyName || chunkStrategyText(strategyForm.chunkStrategyType) }}</strong>
        </div>
        <div class="base-config-summary__item">
          <span>检索</span>
          <strong>{{ retrievalStatusText }}</strong>
        </div>
        <div class="base-config-summary__item">
          <span>TopK / TopN</span>
          <strong>{{ retrievalForm.topK }} / {{ retrievalForm.topN }}</strong>
        </div>
        <div class="base-config-summary__item">
          <span>重排</span>
          <strong>{{ rerankStatusText }}</strong>
        </div>
      </div>

      <div class="base-config-layout">
        <section class="base-config-section">
          <div class="base-config-section__head">
            <div class="base-config-section__title">
              <span>01</span>
              <h4>处理策略</h4>
            </div>
            <el-tag :type="chunkStrategyTagType(selectedStrategyOption?.executable)">
              {{ selectedStrategyOption?.executable ? '可执行' : '预留' }}
            </el-tag>
          </div>
          <p v-if="selectedStrategyOption && !selectedStrategyOption.executable" class="base-config-section__notice">
            {{ selectedStrategyOption.disabledReason }}
          </p>
          <el-alert
            class="base-config-alert"
            title="保存配置不等于立即生成分块；发布或重新处理文档时才会生成处理版本和分块。"
            type="info"
            :closable="false"
            show-icon
          />
          <div class="base-config-grid">
            <el-form-item label="分块方式" required>
              <el-select
                v-model="strategyForm.chunkStrategyType"
                filterable
                :disabled="readonly"
                @change="handleStrategyTypeChange"
              >
                <el-option
                  v-for="option in concreteStrategyOptions"
                  :key="option.strategyType"
                  :label="option.strategyName"
                  :value="option.strategyType"
                >
                  <span>{{ option.strategyName }}</span>
                  <el-tag class="base-config-option-tag" size="small" :type="chunkStrategyTagType(option.executable)">
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
              <el-input-number
                v-model="strategyForm.chunkSize"
                :disabled="readonly"
                :min="300"
                :max="4000"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item
              v-if="strategyForm.chunkStrategyType === 'fixed_overlap' || strategyForm.chunkStrategyType === 'recursive'"
              label="重叠长度"
              required
            >
              <el-input-number
                v-model="strategyForm.overlapSize"
                :disabled="readonly"
                :min="0"
                :max="1000"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item v-if="strategyForm.chunkStrategyType !== 'hybrid'" label="最小片段长度" required>
              <el-input-number
                v-model="strategyForm.minChunkSize"
                :disabled="readonly"
                :min="20"
                :max="4000"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item
              v-if="strategyForm.chunkStrategyType === 'semantic' || strategyForm.chunkStrategyType === 'hybrid'"
              label="目标片段长度"
              required
            >
              <el-input-number
                v-model="strategyForm.targetChunkSize"
                :disabled="readonly"
                :min="300"
                :max="4000"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item
              v-if="strategyForm.chunkStrategyType === 'semantic' || strategyForm.chunkStrategyType === 'hybrid'"
              label="最大片段长度"
              required
            >
              <el-input-number
                v-model="strategyForm.maxChunkSize"
                :disabled="readonly"
                :min="300"
                :max="8000"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item
              v-if="strategyForm.chunkStrategyType === 'semantic' || strategyForm.chunkStrategyType === 'hybrid'"
              label="语义相似度阈值"
              required
            >
              <el-input-number
                v-model="strategyForm.similarityThreshold"
                :disabled="readonly"
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
              <el-input-number
                v-model="strategyForm.windowSize"
                :disabled="readonly"
                :min="1"
                :max="8"
                controls-position="right"
              />
            </el-form-item>
          </div>
          <el-form-item
            v-if="strategyForm.chunkStrategyType === 'recursive' || strategyForm.chunkStrategyType === 'hybrid'"
            label="结构分隔符"
            class="base-config-form__full"
          >
            <el-input v-model="strategyForm.separators" :disabled="readonly" type="textarea" :rows="3" />
          </el-form-item>
        </section>

        <section class="base-config-section">
          <div class="base-config-section__head">
            <div class="base-config-section__title">
              <span>02</span>
              <h4>检索配置</h4>
            </div>
            <div class="base-config-section__meta">
              <span>TopK 上限 {{ retrievalConfig?.systemMaxTopK ?? '-' }}</span>
              <span>TopN 上限 {{ retrievalConfig?.systemMaxTopN ?? '-' }}</span>
            </div>
          </div>
          <div class="base-config-grid">
            <el-form-item label="启用检索">
              <el-switch
                v-model="retrievalForm.retrievalEnabled"
                :disabled="readonly"
                active-text="启用"
                inactive-text="关闭"
              />
            </el-form-item>
            <el-form-item label="向量模型" required>
              <el-select
                v-model="retrievalForm.vectorModelId"
                clearable
                filterable
                :disabled="readonly || !retrievalForm.retrievalEnabled"
                placeholder="请选择向量模型"
              >
                <el-option
                  v-for="model in vectorModelOptions"
                  :key="model.modelId"
                  :label="model.modelName"
                  :value="String(model.modelId)"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="TopK 召回候选数" required>
              <el-input-number
                v-model="retrievalForm.topK"
                :disabled="readonly"
                :min="1"
                :max="retrievalConfig?.systemMaxTopK ?? 100"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="TopN 最终引用数" required>
              <el-input-number
                v-model="retrievalForm.topN"
                :disabled="readonly"
                :min="1"
                :max="maxTopN"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="启用重排">
              <el-switch
                v-model="retrievalForm.rerankEnabled"
                :disabled="readonly"
                active-text="启用"
                inactive-text="关闭"
              />
            </el-form-item>
            <el-form-item label="重排模型" required>
              <el-select
                v-model="retrievalForm.rerankModelId"
                clearable
                filterable
                :disabled="readonly || !retrievalForm.rerankEnabled"
                placeholder="请选择重排模型"
              >
                <el-option
                  v-for="model in rerankModelOptions"
                  :key="model.modelId"
                  :label="model.modelName"
                  :value="String(model.modelId)"
                />
              </el-select>
            </el-form-item>
          </div>
        </section>
      </div>

      <div class="base-config-footer">
        <span>配置保存后对后续发布和处理生效，已生成的处理版本不会自动重跑。</span>
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.base-config-panel {
  min-width: 0;
}

.base-config-panel__head,
.base-config-panel__actions,
.base-config-section__head,
.base-config-section__title,
.base-config-section__meta,
.base-config-footer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.base-config-panel__head {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.base-config-panel__title {
  min-width: 0;
}

.base-config-panel__title h3,
.base-config-section__title h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.base-config-panel__title p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-config-panel__actions {
  flex: 0 0 auto;
  justify-content: flex-end;
}

.base-config-panel__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.base-config-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.base-config-summary__item {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  border-left: 3px solid var(--brand-subtle);
  padding: 10px 12px;
}

.base-config-summary__item span,
.base-config-footer span,
.base-config-section__meta span,
.base-config-section__notice {
  color: var(--text-muted);
  font-size: 12px;
}

.base-config-summary__item strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: var(--text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.base-config-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
  gap: 14px;
}

.base-config-section {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: #ffffff;
  padding: 14px;
}

.base-config-panel--compact .base-config-section {
  padding: 12px;
}

.base-config-section__head {
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.base-config-section__title {
  min-width: 0;
}

.base-config-section__title span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-size: 12px;
  font-weight: 800;
}

.base-config-section__meta {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.base-config-section__notice {
  margin: -2px 0 10px;
  color: var(--accent);
}

.base-config-alert {
  margin-bottom: 12px;
}

.base-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}

.base-config-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.base-config-form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  color: #253244;
  font-size: 13px;
  font-weight: 700;
}

.base-config-form :deep(.el-input-number),
.base-config-form :deep(.el-select) {
  width: 100%;
}

.base-config-form :deep(.el-input__wrapper),
.base-config-form :deep(.el-textarea__inner) {
  box-shadow: 0 0 0 1px var(--border) inset;
}

.base-config-form :deep(.el-input__wrapper:hover),
.base-config-form :deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px var(--border-strong) inset;
}

.base-config-form__full {
  margin-bottom: 0;
}

.base-config-option-tag {
  float: right;
  margin-top: 6px;
}

.base-config-footer {
  justify-content: flex-start;
  gap: 12px;
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  padding: 10px 12px;
}

@media (max-width: 1180px) {
  .base-config-layout,
  .base-config-summary {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .base-config-panel__head,
  .base-config-panel__actions,
  .base-config-section__head,
  .base-config-section__meta,
  .base-config-footer,
  .base-config-grid,
  .base-config-layout,
  .base-config-summary {
    display: grid;
    grid-template-columns: 1fr;
  }

  .base-config-section__meta {
    justify-content: flex-start;
  }

  .base-config-panel__actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
