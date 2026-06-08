<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { chatApi } from '@/api';
import { isApiRequestError } from '@/api/request';
import { usePermission } from '@/auth/permissions';
import type { ChatConfigData, ChatConfigSavePayload } from '@/types';
import { showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

const { hasPermission } = usePermission();
const loading = ref(false);
const saving = ref(false);
const config = ref<ChatConfigData | null>(null);

const configForm = reactive<ChatConfigSavePayload>({
  retentionEnabled: true,
  retentionDays: 30,
  memoryEnabled: true,
  memoryRounds: 5,
  memoryMaxRounds: 10,
  contextTruncationEnabled: true,
  contextTokenBudget: 6000,
  remark: '',
});

const canViewConfig = computed(() => hasPermission('chat:config:detail'));
const canSaveConfig = computed(() => hasPermission('chat:config:save'));

// 只对接口异常透出后端文案，未知异常使用业务场景默认提示。
function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

// 用后端返回值回填表单，空值按治理配置默认范围兜底。
function fillForm(nextConfig: ChatConfigData): void {
  configForm.retentionEnabled = Boolean(nextConfig.retentionEnabled);
  configForm.retentionDays = nextConfig.retentionDays ?? 30;
  configForm.memoryEnabled = Boolean(nextConfig.memoryEnabled);
  configForm.memoryRounds = nextConfig.memoryRounds ?? 5;
  configForm.memoryMaxRounds = nextConfig.memoryMaxRounds ?? 10;
  configForm.contextTruncationEnabled = Boolean(nextConfig.contextTruncationEnabled);
  configForm.contextTokenBudget = nextConfig.contextTokenBudget ?? 6000;
  configForm.remark = nextConfig.remark ?? '';
}

// 保存前只做明显前端边界拦截，最终配置合法性仍以后端为准。
function buildPayload(): ChatConfigSavePayload | null {
  // 前端只做明显边界拦截，精确范围和默认值仍以后端治理服务为准。
  if (configForm.memoryRounds > configForm.memoryMaxRounds) {
    showErrorMessage('短期记忆默认轮数不能超过最大轮数');
    return null;
  }
  return {
    retentionEnabled: configForm.retentionEnabled,
    retentionDays: configForm.retentionDays,
    memoryEnabled: configForm.memoryEnabled,
    memoryRounds: configForm.memoryRounds,
    memoryMaxRounds: configForm.memoryMaxRounds,
    contextTruncationEnabled: configForm.contextTruncationEnabled,
    contextTokenBudget: configForm.contextTokenBudget,
    remark: configForm.remark?.trim() || null,
  };
}

// 按按钮级权限加载配置，无查询权限时不触发后端请求。
async function loadConfig(): Promise<void> {
  if (!canViewConfig.value) {
    config.value = null;
    return;
  }
  loading.value = true;
  try {
    const nextConfig = await chatApi.getConfig();
    config.value = nextConfig;
    fillForm(nextConfig);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '聊天配置加载失败'));
  } finally {
    loading.value = false;
  }
}

// 保存全局聊天治理配置，成功后以后端归一化结果刷新表单。
async function saveConfig(): Promise<void> {
  const payload = buildPayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    const savedConfig = await chatApi.saveConfig(payload);
    config.value = savedConfig;
    fillForm(savedConfig);
    showSuccessMessage('聊天配置已保存');
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '聊天配置保存失败'));
  } finally {
    saving.value = false;
  }
}

onMounted(loadConfig);
</script>

<template>
  <section class="workspace-card system-page chat-config-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">聊天配置</h2>
        <p class="section-heading__desc">维护会话留存、短期记忆、上下文截断和摘要预留状态。</p>
      </div>
      <div class="chat-config-actions">
        <el-button :disabled="!canViewConfig" @click="loadConfig">刷新</el-button>
        <el-button v-if="canSaveConfig" type="primary" :loading="saving" @click="saveConfig">保存</el-button>
      </div>
    </div>

    <el-empty v-if="!canViewConfig" description="暂无聊天配置查询权限" />
    <el-form v-else v-loading="loading" :model="configForm" label-position="top" class="chat-config-form">
      <div class="chat-config-summary">
        <div>
          <span>配置 ID</span>
          <strong>{{ config?.configId || '默认配置' }}</strong>
        </div>
        <div>
          <span>摘要能力</span>
          <strong>{{ config?.summaryEnabled ? '已启用' : '仅预留' }}</strong>
        </div>
      </div>

      <div class="chat-config-grid">
        <section class="chat-config-section">
          <h3>会话留存</h3>
          <el-form-item label="自动归档">
            <el-switch v-model="configForm.retentionEnabled" :disabled="!canSaveConfig" active-text="启用" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="热会话留存天数">
            <el-input-number
              v-model="configForm.retentionDays"
              :disabled="!canSaveConfig"
              :min="1"
              :max="3650"
              controls-position="right"
            />
          </el-form-item>
        </section>

        <section class="chat-config-section">
          <h3>短期记忆</h3>
          <el-form-item label="短期记忆">
            <el-switch v-model="configForm.memoryEnabled" :disabled="!canSaveConfig" active-text="启用" inactive-text="关闭" />
          </el-form-item>
          <div class="chat-config-section__row">
            <el-form-item label="默认轮数">
              <el-input-number
                v-model="configForm.memoryRounds"
                :disabled="!canSaveConfig"
                :min="1"
                :max="10"
                controls-position="right"
              />
            </el-form-item>
            <el-form-item label="最大轮数">
              <el-input-number
                v-model="configForm.memoryMaxRounds"
                :disabled="!canSaveConfig"
                :min="1"
                :max="10"
                controls-position="right"
              />
            </el-form-item>
          </div>
        </section>

        <section class="chat-config-section">
          <h3>上下文截断</h3>
          <el-form-item label="截断策略">
            <el-switch
              v-model="configForm.contextTruncationEnabled"
              :disabled="!canSaveConfig"
              active-text="启用"
              inactive-text="关闭"
            />
          </el-form-item>
          <el-form-item label="上下文预算 token">
            <el-input-number
              v-model="configForm.contextTokenBudget"
              :disabled="!canSaveConfig"
              :min="512"
              :max="32000"
              :step="512"
              controls-position="right"
            />
          </el-form-item>
        </section>

        <section class="chat-config-section">
          <h3>备注</h3>
          <el-form-item label="配置说明">
            <el-input
              v-model="configForm.remark"
              :disabled="!canSaveConfig"
              type="textarea"
              maxlength="500"
              show-word-limit
              :rows="7"
              placeholder="说明本次配置变更原因"
            />
          </el-form-item>
        </section>
      </div>
    </el-form>
  </section>
</template>

<style scoped>
.chat-config-actions,
.chat-config-summary {
  display: flex;
  gap: 10px;
  align-items: center;
}

.chat-config-form {
  display: grid;
  gap: 16px;
}

.chat-config-summary {
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.chat-config-summary div {
  min-width: 180px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.chat-config-summary span,
.chat-config-section h3 {
  display: block;
}

.chat-config-summary span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.chat-config-summary strong {
  display: block;
  margin-top: 6px;
  color: var(--el-text-color-primary);
}

.chat-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.chat-config-section {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.chat-config-section h3 {
  margin: 0 0 14px;
  color: var(--el-text-color-primary);
  font-size: 16px;
}

.chat-config-section__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.chat-config-form :deep(.el-input-number) {
  width: 100%;
}

@media (max-width: 820px) {
  .chat-config-actions,
  .chat-config-grid,
  .chat-config-section__row {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
