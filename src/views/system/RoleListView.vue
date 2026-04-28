<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ElTree } from 'element-plus';
import { useAuthSession } from '@/auth/auth-session';
import { systemApi } from '@/api/modules/system';
import type {
  EntityId,
  SystemPermission,
  SystemMenuManagementNode,
  SystemRole,
  SystemRoleCreatePayload,
  SystemRoleUpdatePayload,
} from '@/types';
import { isApiRequestError } from '@/api/request';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type RoleFormMode = 'create' | 'edit';
type PermissionTreeNodeType = 'module' | 'permission';

interface PermissionTreeNode {
  id: string;
  label: string;
  nodeType: PermissionTreeNodeType;
  moduleCode?: string;
  permission?: SystemPermission;
  children?: PermissionTreeNode[];
  disabled?: boolean;
}

const DATA_SCOPE_DESCRIPTIONS = [
  { scope: '全部数据', description: '当前仅保存配置，尚未接入业务查询过滤。' },
  { scope: '本部门', description: '当前仅保存配置，尚未按当前用户部门限制数据。' },
  { scope: '本部门及下级', description: '当前仅保存配置，尚未展开组织树做数据过滤。' },
  { scope: '自定义部门', description: '当前仅保存配置，暂未提供部门范围维护入口。' },
];

const roles = ref<SystemRole[]>([]);
const menuTree = ref<SystemMenuManagementNode[]>([]);
const permissions = ref<SystemPermission[]>([]);
const loading = ref(false);
const saving = ref(false);
const roleDialogVisible = ref(false);
const menuDialogVisible = ref(false);
const permissionDialogVisible = ref(false);
const roleFormMode = ref<RoleFormMode>('create');
const editingRoleId = ref<EntityId | null>(null);
const assigningRole = ref<SystemRole | null>(null);
const menuAuthTreeRef = ref<InstanceType<typeof ElTree> | null>(null);
const permissionAuthTreeRef = ref<InstanceType<typeof ElTree> | null>(null);
const { refreshCurrentUserMenus } = useAuthSession();

const roleForm = reactive<SystemRoleCreatePayload>({
  roleCode: '',
  roleName: '',
  dataScopeType: 'self_dept',
  sortOrder: 10,
  roleStatus: 'enabled',
  remark: '',
});

const roleDialogTitle = computed(() => (roleFormMode.value === 'create' ? '新增角色' : '编辑角色'));
// 接口授权树只承载 api 类型权限，操作和数据范围权限后续由各业务场景单独接入。
const permissionTree = computed(() => buildPermissionTree());
const permissionTreeProps = {
  label: 'label',
  children: 'children',
  disabled: 'disabled',
};
const roleTypeText = (role: SystemRole) => (role.preset ? '预置角色' : '自定义角色');
const statusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const permissionStatusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const dataScopeStatusText = () => '预留';
const dataScopeText = (scope: string) => {
  const labels: Record<string, string> = {
    all: '全部数据',
    self_dept: '本部门',
    self_and_children: '本部门及下级',
    custom_dept: '自定义部门',
  };
  return labels[scope] ?? scope;
};
function moduleNameText(moduleCode: string): string {
  const labels: Record<string, string> = {
    system_auth: '登录鉴权',
    system_user: '用户管理',
    system_role: '角色管理',
    system_dept: '部门管理',
    system_menu: '菜单管理',
    system_permission: '权限管理',
    system_dict: '数据字典',
    ai_model: '模型配置',
    file: '文件管理',
    knowledge: '知识库',
    chat: '智能问答',
    task: '任务中心',
  };
  return labels[moduleCode] ?? moduleCode;
}

function flattenMenus(nodes: SystemMenuManagementNode[]): SystemMenuManagementNode[] {
  return nodes.flatMap((node) => [node, ...flattenMenus(node.children ?? [])]);
}

function menuCodeToModuleCode(menuCode: string): string {
  return menuCode?.trim().split('.').join('_') ?? '';
}

function permissionNodeKey(permissionId: EntityId): string {
  return `permission:${permissionId}`;
}

function buildPermissionTree(): PermissionTreeNode[] {
  // 按菜单树组织接口权限；无菜单承载的历史权限放到兜底分组，避免授权入口丢失。
  const apiPermissions = permissions.value.filter((permission) => permission.permissionType === 'api');
  const groupMap = new Map<string, SystemPermission[]>();
  apiPermissions.forEach((permission) => {
    const moduleCode = permission.moduleCode || '未分组';
    groupMap.set(moduleCode, [...(groupMap.get(moduleCode) ?? []), permission]);
  });

  const usedModules = new Set<string>();
  const menuNodes = menuTree.value
    .map((menu) => buildPermissionMenuNode(menu, groupMap, usedModules))
    .filter((node): node is PermissionTreeNode => node !== null);
  const fallbackNodes = Array.from(groupMap.entries())
    .filter(([moduleCode]) => !usedModules.has(moduleCode))
    .map(([moduleCode, items]) => buildPermissionGroupNode(moduleCode, moduleNameText(moduleCode), items));

  return [...menuNodes, ...fallbackNodes];
}

function buildPermissionMenuNode(
  menu: SystemMenuManagementNode,
  groupMap: Map<string, SystemPermission[]>,
  usedModules: Set<string>,
): PermissionTreeNode | null {
  // 只保留自身或子级存在接口权限的菜单节点，避免授权树出现空目录。
  const moduleCode = menuCodeToModuleCode(menu.menuCode);
  const childNodes = (menu.children ?? [])
    .map((child) => buildPermissionMenuNode(child, groupMap, usedModules))
    .filter((node): node is PermissionTreeNode => node !== null);
  const permissionNodes = buildPermissionLeafNodes(groupMap.get(moduleCode) ?? []);
  if (permissionNodes.length > 0) {
    usedModules.add(moduleCode);
  }
  const children = [...childNodes, ...permissionNodes];
  if (children.length === 0) {
    return null;
  }
  return {
    id: `module:${moduleCode}`,
    label: menu.menuName,
    nodeType: 'module',
    moduleCode,
    children,
  };
}

function buildPermissionGroupNode(
  moduleCode: string,
  moduleName: string,
  items: SystemPermission[],
): PermissionTreeNode {
  return {
    id: `module:${moduleCode}`,
    label: moduleName,
    nodeType: 'module',
    moduleCode,
    children: buildPermissionLeafNodes(items),
  };
}

function buildPermissionLeafNodes(items: SystemPermission[]): PermissionTreeNode[] {
  return items
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.permissionCode.localeCompare(right.permissionCode))
    .map((permission) => ({
      id: permissionNodeKey(permission.permissionId),
      label: permission.permissionName,
      nodeType: 'permission',
      permission,
      disabled: permission.permissionStatus !== 'enabled',
    }));
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

async function loadRoles(): Promise<void> {
  loading.value = true;
  try {
    roles.value = await systemApi.listRoles();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '角色列表加载失败'));
  } finally {
    loading.value = false;
  }
}

async function loadMenuTree(): Promise<void> {
  menuTree.value = await systemApi.listMenuTree();
}

async function loadPermissions(): Promise<void> {
  permissions.value = await systemApi.listPermissions();
}

function resetRoleForm(): void {
  roleForm.roleCode = '';
  roleForm.roleName = '';
  roleForm.dataScopeType = 'self_dept';
  roleForm.sortOrder = 10;
  roleForm.roleStatus = 'enabled';
  roleForm.remark = '';
}

function openCreateRole(): void {
  roleFormMode.value = 'create';
  editingRoleId.value = null;
  resetRoleForm();
  roleDialogVisible.value = true;
}

function openEditRole(role: SystemRole): void {
  roleFormMode.value = 'edit';
  editingRoleId.value = role.roleId;
  roleForm.roleCode = role.roleCode;
  roleForm.roleName = role.roleName;
  roleForm.dataScopeType = role.dataScopeType;
  roleForm.sortOrder = role.sortOrder;
  roleForm.roleStatus = role.roleStatus;
  roleForm.remark = role.remark ?? '';
  roleDialogVisible.value = true;
}

async function submitRole(): Promise<void> {
  saving.value = true;
  try {
    if (roleFormMode.value === 'create') {
      await systemApi.createRole({ ...roleForm });
      showSuccessMessage('角色已新增');
    } else if (editingRoleId.value) {
      const payload: SystemRoleUpdatePayload = {
        roleName: roleForm.roleName,
        dataScopeType: roleForm.dataScopeType,
        sortOrder: roleForm.sortOrder,
        roleStatus: roleForm.roleStatus,
        remark: roleForm.remark,
      };
      await systemApi.updateRole(editingRoleId.value, payload);
      showSuccessMessage('角色已保存');
    }
    roleDialogVisible.value = false;
    await loadRoles();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '角色保存失败'));
  } finally {
    saving.value = false;
  }
}

async function deleteRole(role: SystemRole): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除角色',
    message: `确认删除角色“${role.roleName}”吗？`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.deleteRole(role.roleId);
    showSuccessMessage('角色已删除');
    await loadRoles();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '角色删除失败'));
  }
}

async function openMenuAssign(role: SystemRole): Promise<void> {
  assigningRole.value = role;
  menuDialogVisible.value = true;
  try {
    await loadMenuTree();
    const checkedMenuIds = await systemApi.listRoleMenuIds(role.roleId);
    await nextTick();
    menuAuthTreeRef.value?.setCheckedKeys(checkedMenuIds, false);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '菜单授权加载失败'));
  }
}

async function saveMenuAssign(): Promise<void> {
  if (!assigningRole.value || !menuAuthTreeRef.value) {
    return;
  }
  saving.value = true;
  try {
    // 后端 Long ID 以字符串传输，授权保存不能转 number，避免精度丢失。
    const checkedKeys = menuAuthTreeRef.value.getCheckedKeys(false).map(String);
    const halfCheckedKeys = menuAuthTreeRef.value.getHalfCheckedKeys().map(String);
    const menuIds = Array.from(new Set([...checkedKeys, ...halfCheckedKeys]));
    await systemApi.saveRoleMenus(assigningRole.value.roleId, { menuIds });
    await refreshCurrentUserMenus();
    showSuccessMessage('菜单授权已保存');
    menuDialogVisible.value = false;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '菜单授权保存失败'));
  } finally {
    saving.value = false;
  }
}

async function openPermissionAssign(role: SystemRole): Promise<void> {
  assigningRole.value = role;
  permissionDialogVisible.value = true;
  try {
    await Promise.all([loadMenuTree(), loadPermissions()]);
    const selectedPermissionIds = await systemApi.listRolePermissionIds(role.roleId);
    await nextTick();
    // Element Plus 树节点渲染完成后再回填勾选状态，否则首屏可能无法正确选中。
    permissionAuthTreeRef.value?.setCheckedKeys(selectedPermissionIds.map(permissionNodeKey), false);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '接口权限加载失败'));
  }
}

async function savePermissionAssign(): Promise<void> {
  if (!assigningRole.value || !permissionAuthTreeRef.value) {
    return;
  }
  saving.value = true;
  try {
    // 接口权限独立保存，不再跟随菜单授权，避免菜单维护承担权限职责。
    const permissionIds = permissionAuthTreeRef.value
      .getCheckedKeys(false)
      .map(String)
      // 树中模块节点不可作为授权数据提交，只提取真实权限叶子节点。
      .filter((key) => key.startsWith('permission:'))
      .map((key) => key.replace('permission:', ''));
    await systemApi.saveRolePermissions(assigningRole.value.roleId, {
      permissionIds,
    });
    showSuccessMessage('接口权限已保存');
    permissionDialogVisible.value = false;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '接口权限保存失败'));
  } finally {
    saving.value = false;
  }
}

onMounted(loadRoles);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">角色管理</h2>
        <p class="section-heading__desc">维护角色基础信息，并分别配置菜单入口和后端接口权限。</p>
      </div>
      <el-button type="primary" @click="openCreateRole">新增角色</el-button>
    </div>

    <el-table v-loading="loading" :data="roles" border row-key="roleId" class="system-page__table">
      <el-table-column prop="roleName" label="角色名称" min-width="150" />
      <el-table-column prop="roleCode" label="角色编码" min-width="160" />
      <el-table-column label="角色类型" width="110">
        <template #default="{ row }">
          <el-tag :type="row.preset ? 'warning' : 'info'">{{ roleTypeText(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="数据范围" min-width="130">
        <template #default="{ row }">
          <div class="role-data-scope-cell">
            <span>{{ dataScopeText(row.dataScopeType) }}</span>
            <el-tag size="small" type="info">{{ dataScopeStatusText() }}</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.roleStatus === 'enabled' ? 'success' : 'danger'">{{ statusText(row.roleStatus) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column prop="remark" label="备注" min-width="180" />
      <el-table-column label="操作" width="290" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEditRole(row)">编辑</el-button>
          <el-button link type="primary" @click="openMenuAssign(row)">菜单授权</el-button>
          <el-button link type="primary" @click="openPermissionAssign(row)">接口权限</el-button>
          <el-button link type="danger" :disabled="row.preset" @click="deleteRole(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="roleDialogVisible" :title="roleDialogTitle" width="560px">
      <el-form label-width="96px">
        <el-form-item label="角色编码" required>
          <el-input v-model="roleForm.roleCode" :disabled="roleFormMode === 'edit'" maxlength="64" />
        </el-form-item>
        <el-form-item label="角色名称" required>
          <el-input v-model="roleForm.roleName" maxlength="128" />
        </el-form-item>
        <el-form-item label="数据范围">
          <el-select v-model="roleForm.dataScopeType" class="system-page__control">
            <el-option label="全部数据" value="all" />
            <el-option label="本部门" value="self_dept" />
            <el-option label="本部门及下级" value="self_and_children" />
            <el-option label="自定义部门" value="custom_dept" />
          </el-select>
        </el-form-item>
        <div class="role-data-scope-help">
          <div v-for="item in DATA_SCOPE_DESCRIPTIONS" :key="item.scope" class="role-data-scope-help__item">
            <strong>{{ item.scope }}</strong>
            <el-tag size="small" type="info">预留</el-tag>
            <span>{{ item.description }}</span>
          </div>
        </div>
        <el-form-item label="状态" required>
          <el-radio-group v-model="roleForm.roleStatus">
            <el-radio-button label="enabled">启用</el-radio-button>
            <el-radio-button label="disabled">停用</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="排序" required>
          <el-input-number v-model="roleForm.sortOrder" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="roleForm.remark" type="textarea" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitRole">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="menuDialogVisible" title="菜单授权" width="640px">
      <p class="system-page__hint">当前角色：{{ assigningRole?.roleName }}</p>
      <p class="system-page__hint">菜单授权只控制左侧导航和页面入口，不再自动授予接口权限。</p>
      <el-tree
        ref="menuAuthTreeRef"
        :data="menuTree"
        show-checkbox
        node-key="menuId"
        default-expand-all
        :props="{ label: 'menuName', children: 'children' }"
      />
      <template #footer>
        <el-button @click="menuDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveMenuAssign">保存授权</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="permissionDialogVisible" title="接口权限" width="860px">
      <p class="system-page__hint">当前角色：{{ assigningRole?.roleName }}</p>
      <p class="system-page__hint">仅展示已登记的接口权限；操作权限和数据范围权限暂不参与这里的接口授权。</p>
      <el-tree
        ref="permissionAuthTreeRef"
        :data="permissionTree"
        show-checkbox
        node-key="id"
        default-expand-all
        :props="permissionTreeProps"
        class="permission-auth-tree"
      >
        <template #default="{ data }">
          <span
            class="permission-tree-node"
            :class="{ 'permission-tree-node--permission': data.nodeType === 'permission' }"
          >
            <span class="permission-tree-node__label">{{ data.label }}</span>
            <template v-if="data.permission">
              <span class="permission-tree-node__meta">
                {{ data.permission.httpMethod || '全部方法' }} {{ data.permission.resourcePath || '无路径' }}
              </span>
              <span class="permission-tree-node__code">{{ data.permission.permissionCode }}</span>
              <el-tag size="small" :type="data.permission.permissionStatus === 'enabled' ? 'success' : 'danger'">
                {{ permissionStatusText(data.permission.permissionStatus) }}
              </el-tag>
            </template>
          </span>
        </template>
      </el-tree>
      <template #footer>
        <el-button @click="permissionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePermissionAssign">保存权限</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.role-data-scope-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.role-data-scope-help {
  display: grid;
  gap: 8px;
  margin: 0 0 18px 96px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.role-data-scope-help__item {
  display: grid;
  grid-template-columns: 96px 56px minmax(0, 1fr);
  gap: 8px;
  align-items: flex-start;
}

.role-data-scope-help__item strong {
  color: var(--el-text-color-primary);
}

.permission-auth-tree {
  max-height: 560px;
  overflow-y: auto;
  padding-right: 6px;
}

.permission-tree-node {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  line-height: 1.5;
}

.permission-tree-node--permission {
  width: min(680px, 100%);
}

.permission-tree-node__label {
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.permission-tree-node__meta,
.permission-tree-node__code {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.permission-tree-node__meta {
  flex: 1;
}

.permission-tree-node__code {
  font-family: Consolas, "Courier New", monospace;
}

@media (max-width: 760px) {
  .role-data-scope-help {
    margin-left: 0;
  }

  .role-data-scope-help__item {
    grid-template-columns: 1fr;
  }
}
</style>
