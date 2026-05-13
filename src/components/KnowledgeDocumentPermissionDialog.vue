<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { knowledgeApi } from '@/api';
import { usePermission } from '@/auth/permissions';
import type {
  EntityId,
  KnowledgeDocumentPermissionAssignPayload,
  KnowledgeDocumentPermissionAuthorization,
  KnowledgeDocumentPermissionStrategy,
} from '@/types';

const props = defineProps<{
  modelValue: boolean;
  documentId: EntityId | null;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'saved'): void;
}>();

const { hasPermission } = usePermission();
const loading = ref(false);
const saving = ref(false);
const authorization = ref<KnowledgeDocumentPermissionAuthorization | null>(null);
const permissionStrategy = ref<KnowledgeDocumentPermissionStrategy>('inherit_knowledge_base');
const selectedDeptIds = ref<EntityId[]>([]);
const selectedRoleIds = ref<EntityId[]>([]);
const selectedUserIds = ref<EntityId[]>([]);

const canSavePermission = computed(() => hasPermission('knowledge:document:permission-save'));
const canEditCustomScopes = computed(() => permissionStrategy.value === 'custom' && canSavePermission.value);
const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

function strategyText(strategy: KnowledgeDocumentPermissionStrategy): string {
  const labels: Record<KnowledgeDocumentPermissionStrategy, string> = {
    inherit_knowledge_base: '继承知识库',
    custom: '自定义授权',
    public: '登录用户可见',
    creator_only: '仅创建人或负责人可见',
  };
  return labels[strategy];
}

function fillAuthorization(payload: KnowledgeDocumentPermissionAuthorization): void {
  authorization.value = payload;
  permissionStrategy.value = payload.permissionStrategy;
  selectedDeptIds.value = [...payload.assignedDeptIds];
  selectedRoleIds.value = [...payload.assignedRoleIds];
  selectedUserIds.value = [...payload.assignedUserIds];
}

async function loadAuthorization(): Promise<void> {
  if (!props.documentId) {
    authorization.value = null;
    return;
  }
  loading.value = true;
  try {
    // 授权弹窗只依赖聚合接口，避免用户没有普通列表权限时无法查看授权回显。
    fillAuthorization(await knowledgeApi.getDocumentPermissionAuthorization(props.documentId));
  } finally {
    loading.value = false;
  }
}

async function saveAuthorization(): Promise<void> {
  if (!props.documentId || !authorization.value) {
    return;
  }
  const payload: KnowledgeDocumentPermissionAssignPayload = {
    permissionStrategy: permissionStrategy.value,
    deptIds: selectedDeptIds.value,
    roleIds: selectedRoleIds.value,
    userIds: selectedUserIds.value,
  };
  saving.value = true;
  try {
    await knowledgeApi.saveDocumentPermissionScopes(props.documentId, payload);
    ElMessage.success('文档权限已保存');
    emit('saved');
    dialogVisible.value = false;
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.modelValue, props.documentId] as const,
  ([visible]) => {
    if (visible) {
      void loadAuthorization();
    }
  },
);
</script>

<template>
  <el-dialog v-model="dialogVisible" title="文档权限" width="720px">
    <el-skeleton v-if="loading" :rows="5" animated />
    <template v-else-if="authorization">
      <div class="doc-permission-title">{{ authorization.title }}</div>
      <el-form label-width="96px">
        <el-form-item label="权限策略">
          <el-select v-model="permissionStrategy" :disabled="!canSavePermission">
            <el-option label="继承知识库" value="inherit_knowledge_base" />
            <el-option label="自定义授权" value="custom" />
            <el-option label="登录用户可见" value="public" />
            <el-option label="仅创建人或负责人可见" value="creator_only" />
          </el-select>
        </el-form-item>
        <el-alert
          v-if="permissionStrategy !== 'custom'"
          :title="strategyText(permissionStrategy)"
          type="info"
          :closable="false"
          show-icon
        />
        <template v-else>
          <el-form-item label="授权部门">
            <el-tree-select
              v-model="selectedDeptIds"
              :data="authorization.departments"
              node-key="deptId"
              multiple
              show-checkbox
              check-strictly
              default-expand-all
              :props="{ label: 'deptName', children: 'children' }"
              :disabled="!canEditCustomScopes"
            />
          </el-form-item>
          <el-form-item label="授权角色">
            <el-select v-model="selectedRoleIds" multiple filterable :disabled="!canEditCustomScopes">
              <el-option
                v-for="role in authorization.roles"
                :key="role.roleId"
                :label="role.roleName"
                :value="role.roleId"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="授权用户">
            <el-select v-model="selectedUserIds" multiple filterable :disabled="!canEditCustomScopes">
              <el-option
                v-for="user in authorization.users"
                :key="user.userId"
                :label="`${user.displayName}（${user.username}）`"
                :value="user.userId"
              />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
    </template>
    <el-empty v-else description="未选择文档" />
    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
      <el-button v-if="canSavePermission" type="primary" :loading="saving" @click="saveAuthorization">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.doc-permission-title {
  margin-bottom: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
</style>
