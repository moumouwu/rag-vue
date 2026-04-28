<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type {
  EntityId,
  SystemMenuManagementNode,
  SystemPermission,
  SystemPermissionCreatePayload,
  SystemPermissionUpdatePayload,
} from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type PermissionFormMode = 'create' | 'edit';
type ModuleOptionSource = 'menu' | 'history';

interface ModuleOption {
  key: string;
  moduleCode: string;
  moduleName: string;
  modulePath: string;
  level: number;
  source: ModuleOptionSource;
}

const EMPTY_MODULE_KEY = '__empty_module__';
// 少量权限没有对应菜单入口，只作为历史或基础能力兼容展示。
const MENULESS_MODULE_LABELS: Record<string, string> = {
  system_auth: '登录鉴权',
};
const PERMISSION_TYPE_DESCRIPTIONS = [
  { type: '接口', status: '已生效', description: '控制后端 API 访问，命中方法和路径后按角色接口权限放行。' },
  { type: '操作', status: '预留', description: '用于按钮、导入导出等业务动作授权，目前仅维护清单，不参与后端接口鉴权。' },
  { type: '数据范围', status: '预留', description: '用于部门、本人或自定义范围等数据边界，目前仅维护清单，具体过滤由后续业务接入。' },
];

const permissions = ref<SystemPermission[]>([]);
const menuTree = ref<SystemMenuManagementNode[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const formMode = ref<PermissionFormMode>('create');
const editingPermissionId = ref<EntityId | null>(null);
const selectedModuleKey = ref('');
const keyword = ref('');

const permissionForm = reactive<SystemPermissionCreatePayload>({
  permissionCode: '',
  permissionName: '',
  moduleCode: 'system_permission',
  permissionType: 'api',
  httpMethod: 'GET',
  resourcePath: '',
  sortOrder: 10,
  permissionStatus: 'enabled',
  remark: '',
});

const moduleOptions = computed(() => {
  const moduleMap = new Map<string, ModuleOption>();
  // 所属模块以下拉方式维护，优先使用菜单树路径，避免手写模块编码漂移。
  buildMenuModuleOptions(menuTree.value).forEach((module) => {
    moduleMap.set(module.key, module);
  });
  permissions.value.forEach((permission) => {
    const moduleCode = permission.moduleCode?.trim() || '';
    const key = moduleKey(moduleCode);
    if (!moduleMap.has(key)) {
      const moduleName = MENULESS_MODULE_LABELS[moduleCode] ?? (moduleCode || '未分组');
      moduleMap.set(key, {
        key,
        moduleCode,
        moduleName,
        modulePath: moduleName,
        level: 0,
        source: 'history',
      });
    }
  });
  return Array.from(moduleMap.values());
});
const formModuleOptions = computed(() => moduleOptions.value.filter((module) => module.key !== EMPTY_MODULE_KEY));

const filteredPermissions = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase();
  return permissions.value.filter((permission) => {
    const moduleMatched = !selectedModuleKey.value || moduleKey(permission.moduleCode) === selectedModuleKey.value;
    const keywordMatched =
      !normalizedKeyword ||
      safeText(permission.permissionName).toLowerCase().includes(normalizedKeyword) ||
      safeText(permission.permissionCode).toLowerCase().includes(normalizedKeyword) ||
      safeText(permission.resourcePath).toLowerCase().includes(normalizedKeyword);
    return moduleMatched && keywordMatched;
  });
});

const enabledCount = computed(
  () => permissions.value.filter((permission) => permission.permissionStatus === 'enabled').length,
);
const dialogTitle = computed(() => (formMode.value === 'create' ? '新增权限' : '编辑权限'));
const resourceLabel = computed(() => (permissionForm.permissionType === 'api' ? '资源路径' : '资源标识'));
const resourcePlaceholder = computed(() =>
  permissionForm.permissionType === 'api' ? '例如 /api/v1/system/roles' : '例如 system:role:export',
);
const httpMethodDisabled = computed(() => permissionForm.permissionType !== 'api');

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function moduleNameText(moduleCode: string): string {
  if (!moduleCode) {
    return '未分组';
  }
  return moduleOptions.value.find((module) => module.key === moduleKey(moduleCode))?.modulePath
    ?? MENULESS_MODULE_LABELS[moduleCode]
    ?? moduleCode;
}

function moduleKey(moduleCode: string): string {
  return moduleCode?.trim() || EMPTY_MODULE_KEY;
}

function permissionTypeText(permissionType: string): string {
  const labels: Record<string, string> = {
    api: '接口',
    operation: '操作',
    data_scope: '数据范围',
  };
  return labels[permissionType] ?? permissionType;
}

function statusText(status: string): string {
  return status === 'enabled' ? '启用' : '停用';
}

function safeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function buildMenuModuleOptions(
  nodes: SystemMenuManagementNode[],
  parentNames: string[] = [],
): ModuleOption[] {
  // 下拉项保留完整菜单路径，用于区分一、二、三级同名菜单来源。
  return nodes.flatMap((node) => {
    const moduleCode = menuCodeToModuleCode(node.menuCode);
    const moduleNames = [...parentNames, node.menuName].filter((name) => name.trim());
    const children = buildMenuModuleOptions(node.children ?? [], moduleNames);
    if (!moduleCode) {
      return children;
    }
    return [
      {
        key: moduleKey(moduleCode),
        moduleCode,
        moduleName: node.menuName,
        modulePath: moduleNames.join(' / '),
        level: Math.max(moduleNames.length - 1, 0),
        source: 'menu' as ModuleOptionSource,
      },
      ...children,
    ];
  });
}

function menuCodeToModuleCode(menuCode: string): string {
  return safeText(menuCode).split('.').join('_');
}

async function loadPageData(): Promise<void> {
  loading.value = true;
  try {
    permissions.value = await systemApi.listPermissions();
    try {
      menuTree.value = await systemApi.listMenuTree();
    } catch (error) {
      /*
       * 所属模块优先来自菜单树；如果当前角色没有菜单树权限，
       * 仍允许用已有权限模块兼容展示，避免页面完全不可用。
       */
      menuTree.value = [];
      showErrorMessage(resolveErrorMessage(error, '菜单模块加载失败，已使用权限历史模块展示'));
    }
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '权限列表加载失败'));
  } finally {
    loading.value = false;
  }
}

function resetPermissionForm(): void {
  permissionForm.permissionCode = '';
  permissionForm.permissionName = '';
  permissionForm.moduleCode = 'system_permission';
  permissionForm.permissionType = 'api';
  permissionForm.httpMethod = 'GET';
  permissionForm.resourcePath = '';
  permissionForm.sortOrder = 10;
  permissionForm.permissionStatus = 'enabled';
  permissionForm.remark = '';
}

watch(
  () => permissionForm.permissionType,
  (permissionType) => {
    // 非接口权限当前不参与后端 API 匹配，提交时清空 HTTP 方法避免误导。
    if (permissionType === 'api' && !permissionForm.httpMethod) {
      permissionForm.httpMethod = 'GET';
      return;
    }
    if (permissionType !== 'api') {
      permissionForm.httpMethod = '';
    }
  },
);

function openCreatePermission(): void {
  formMode.value = 'create';
  editingPermissionId.value = null;
  resetPermissionForm();
  dialogVisible.value = true;
}

function openEditPermission(permission: SystemPermission): void {
  formMode.value = 'edit';
  editingPermissionId.value = permission.permissionId;
  permissionForm.permissionCode = permission.permissionCode;
  permissionForm.permissionName = permission.permissionName;
  permissionForm.moduleCode = permission.moduleCode;
  permissionForm.permissionType = permission.permissionType;
  permissionForm.httpMethod = permission.httpMethod || 'GET';
  permissionForm.resourcePath = permission.resourcePath;
  permissionForm.sortOrder = permission.sortOrder;
  permissionForm.permissionStatus = permission.permissionStatus;
  permissionForm.remark = permission.remark ?? '';
  dialogVisible.value = true;
}

function buildPermissionPayload(): SystemPermissionCreatePayload | null {
  // 这里只做前端必填拦截，编码唯一性、预置保护等规则仍以后端为准。
  const payload: SystemPermissionCreatePayload = {
    permissionCode: permissionForm.permissionCode.trim(),
    permissionName: permissionForm.permissionName.trim(),
    moduleCode: permissionForm.moduleCode.trim(),
    permissionType: permissionForm.permissionType,
    httpMethod: permissionForm.httpMethod.trim(),
    resourcePath: permissionForm.resourcePath.trim(),
    sortOrder: permissionForm.sortOrder,
    permissionStatus: permissionForm.permissionStatus,
    remark: permissionForm.remark.trim(),
  };
  if (!payload.permissionName || !payload.moduleCode || !payload.permissionType || !payload.resourcePath) {
    showErrorMessage('请完整填写权限名称、所属模块、权限类型和资源路径');
    return null;
  }
  if (formMode.value === 'create' && !payload.permissionCode) {
    showErrorMessage('请填写权限编码');
    return null;
  }
  return payload;
}

async function submitPermission(): Promise<void> {
  const payload = buildPermissionPayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await systemApi.createPermission(payload);
      showSuccessMessage('权限已新增');
    } else if (editingPermissionId.value) {
      const updatePayload: SystemPermissionUpdatePayload = {
        permissionName: payload.permissionName,
        moduleCode: payload.moduleCode,
        permissionType: payload.permissionType,
        httpMethod: payload.httpMethod,
        resourcePath: payload.resourcePath,
        sortOrder: payload.sortOrder,
        permissionStatus: payload.permissionStatus,
        remark: payload.remark,
      };
      await systemApi.updatePermission(editingPermissionId.value, updatePayload);
      showSuccessMessage('权限已保存');
    }
    dialogVisible.value = false;
    await loadPageData();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '权限保存失败'));
  } finally {
    saving.value = false;
  }
}

async function deletePermission(permission: SystemPermission): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除权限',
    message: `确认删除权限“${permission.permissionName}”吗？`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.deletePermission(permission.permissionId);
    showSuccessMessage('权限已删除');
    await loadPageData();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '权限删除失败'));
  }
}

onMounted(loadPageData);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">权限管理</h2>
        <p class="section-heading__desc">维护接口权限和业务权限清单，角色授权在角色管理中配置。</p>
      </div>
      <div class="permission-actions">
        <el-button @click="loadPageData">刷新</el-button>
        <el-button type="primary" @click="openCreatePermission">新增权限</el-button>
      </div>
    </div>

    <div class="permission-toolbar">
      <el-select v-model="selectedModuleKey" clearable placeholder="全部模块" class="permission-toolbar__module">
        <el-option
          v-for="module in moduleOptions"
          :key="module.key"
          :label="module.modulePath"
          :value="module.key"
        >
          <span class="module-option" :style="{ paddingLeft: `${module.level * 14}px` }">
            <span class="module-option__name">{{ module.moduleName }}</span>
            <span class="module-option__path">{{ module.modulePath }}</span>
            <el-tag v-if="module.source === 'history'" size="small" type="info">历史</el-tag>
          </span>
        </el-option>
      </el-select>
      <el-input v-model="keyword" clearable placeholder="搜索权限名称、编码或路径" class="permission-toolbar__search" />
      <div class="permission-toolbar__count">
        <span>共 {{ permissions.length }} 项</span>
        <span>启用 {{ enabledCount }} 项</span>
      </div>
    </div>

    <el-table v-loading="loading" :data="filteredPermissions" border row-key="permissionId" class="system-page__table">
      <el-table-column prop="permissionName" label="权限名称" min-width="170" />
      <el-table-column prop="permissionCode" label="权限编码" min-width="210" show-overflow-tooltip />
      <el-table-column label="所属模块" min-width="120">
        <template #default="{ row }">{{ moduleNameText(row.moduleCode) }}</template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag>{{ permissionTypeText(row.permissionType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="httpMethod" label="方法" width="90" />
      <el-table-column prop="resourcePath" label="资源路径" min-width="260" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.permissionStatus === 'enabled' ? 'success' : 'danger'">
            {{ statusText(row.permissionStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="预置" width="90">
        <template #default="{ row }">{{ row.preset ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEditPermission(row)">编辑</el-button>
          <el-button link type="danger" :disabled="row.preset" @click="deletePermission(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="840px" class="permission-edit-dialog">
      <el-form :model="permissionForm" label-position="top" class="permission-form">
        <section class="permission-form__section">
          <h3 class="permission-form__section-title">基础信息</h3>
          <div class="permission-form__grid">
            <el-form-item label="权限编码" required>
              <el-input
                v-model="permissionForm.permissionCode"
                :disabled="formMode === 'edit'"
                maxlength="128"
                placeholder="例如 system:role:query"
              />
            </el-form-item>
            <el-form-item label="权限名称" required>
              <el-input v-model="permissionForm.permissionName" maxlength="128" placeholder="例如 查询角色列表" />
            </el-form-item>
            <el-form-item label="所属模块" required>
              <el-select v-model="permissionForm.moduleCode" filterable class="permission-form__control">
                <el-option
                v-for="module in formModuleOptions"
                :key="module.key"
                :label="module.modulePath"
                :value="module.key"
              >
                <span class="module-option" :style="{ paddingLeft: `${module.level * 14}px` }">
                  <span class="module-option__name">{{ module.moduleName }}</span>
                  <span class="module-option__path">{{ module.modulePath }}</span>
                  <el-tag v-if="module.source === 'history'" size="small" type="info">历史</el-tag>
                </span>
              </el-option>
            </el-select>
          </el-form-item>
            <el-form-item label="权限类型" required>
              <el-select v-model="permissionForm.permissionType" class="permission-form__control">
                <el-option label="接口" value="api" />
                <el-option label="操作" value="operation" />
                <el-option label="数据范围" value="data_scope" />
              </el-select>
            </el-form-item>
          </div>
        </section>

        <section class="permission-form__section permission-form__section--wide">
          <h3 class="permission-form__section-title">类型说明</h3>
          <div class="permission-type-help">
            <div v-for="item in PERMISSION_TYPE_DESCRIPTIONS" :key="item.type" class="permission-type-help__item">
              <strong>{{ item.type }}</strong>
              <el-tag size="small" :type="item.status === '已生效' ? 'success' : 'info'">{{ item.status }}</el-tag>
              <span>{{ item.description }}</span>
            </div>
          </div>
        </section>

        <section class="permission-form__section">
          <h3 class="permission-form__section-title">匹配规则</h3>
          <div class="permission-form__grid">
            <el-form-item label="HTTP 方法">
              <el-select
                v-model="permissionForm.httpMethod"
                :disabled="httpMethodDisabled"
                class="permission-form__control"
              >
                <el-option label="GET" value="GET" />
                <el-option label="POST" value="POST" />
                <el-option label="PUT" value="PUT" />
                <el-option label="DELETE" value="DELETE" />
                <el-option label="全部方法" value="*" />
                <el-option label="不限定" value="" />
              </el-select>
            </el-form-item>
            <el-form-item :label="resourceLabel" required>
              <el-input v-model="permissionForm.resourcePath" maxlength="255" :placeholder="resourcePlaceholder" />
            </el-form-item>
            <el-form-item label="状态" required>
              <el-radio-group v-model="permissionForm.permissionStatus" class="permission-form__radio">
                <el-radio-button label="enabled">启用</el-radio-button>
                <el-radio-button label="disabled">停用</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="排序" required>
              <el-input-number
                v-model="permissionForm.sortOrder"
                :min="0"
                :max="999999"
                controls-position="right"
                class="permission-form__number"
              />
            </el-form-item>
          </div>
        </section>

        <section class="permission-form__section permission-form__section--wide">
          <el-form-item label="备注">
            <el-input v-model="permissionForm.remark" type="textarea" maxlength="500" show-word-limit />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitPermission">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.permission-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.permission-toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.permission-toolbar__module,
.permission-toolbar__search {
  width: 100%;
}

.permission-toolbar__count {
  display: flex;
  gap: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  white-space: nowrap;
}

.module-option {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.module-option__name {
  flex: 0 0 auto;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.module-option__path {
  min-width: 0;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 18px;
}

.permission-form__section {
  margin-bottom: 18px;
}

.permission-form__section--wide {
  margin-bottom: 14px;
}

.permission-form__section-title {
  margin: 0 0 12px;
  padding-left: 10px;
  border-left: 3px solid var(--el-color-primary);
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 700;
}

.permission-form__control,
.permission-form__number {
  width: 100%;
}

.permission-form__full {
  grid-column: 1 / -1;
}

.permission-type-help {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.permission-type-help__item {
  display: grid;
  grid-template-columns: 64px 56px minmax(0, 1fr);
  gap: 8px;
  align-items: flex-start;
}

.permission-type-help__item strong {
  color: var(--el-text-color-primary);
}

@media (max-width: 760px) {
  .permission-toolbar {
    grid-template-columns: 1fr;
  }

  .permission-toolbar__count {
    justify-content: flex-start;
  }

  .permission-actions,
  .permission-form__grid {
    grid-template-columns: 1fr;
  }

  .permission-type-help__item {
    grid-template-columns: 1fr;
  }

  .permission-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
