<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ElTree } from 'element-plus';
import { useAuthSession } from '@/auth/auth-session';
import { usePermission } from '@/auth/permissions';
import { systemApi } from '@/api/modules/system';
import type {
  EntityId,
  SystemDept,
  SystemPermission,
  SystemMenuManagementNode,
  SystemRole,
  SystemRoleCreatePayload,
  SystemRoleUpdatePayload,
} from '@/types';
import { isApiRequestError } from '@/api/request';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';
import { systemModuleAuthorizationRootCode, systemModuleNameText } from '@/utils/system-module-labels';

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
  { value: 'all', scope: '全部数据', description: '已定义为全部数据规则，业务查询接入数据范围后不追加部门过滤。' },
  { value: 'self_dept', scope: '本部门', description: '已定义为当前用户所属部门规则，业务查询接入后按本人部门过滤。' },
  {
    value: 'self_and_children',
    scope: '本部门及下级',
    description: '已定义为当前用户部门及下级规则，后端会按部门树解析可访问部门。',
  },
  { value: 'custom_dept', scope: '自定义部门', description: '已支持维护部门范围，业务查询接入后按勾选部门过滤。' },
];

const roles = ref<SystemRole[]>([]);
const menuTree = ref<SystemMenuManagementNode[]>([]);
const deptTree = ref<SystemDept[]>([]);
const permissions = ref<SystemPermission[]>([]);
const loading = ref(false);
const saving = ref(false);
const roleDialogVisible = ref(false);
const menuDialogVisible = ref(false);
const permissionDialogVisible = ref(false);
const dataScopeDialogVisible = ref(false);
const roleFormMode = ref<RoleFormMode>('create');
const editingRoleId = ref<EntityId | null>(null);
const assigningRole = ref<SystemRole | null>(null);
const menuAuthTreeRef = ref<InstanceType<typeof ElTree> | null>(null);
const permissionAuthTreeRef = ref<InstanceType<typeof ElTree> | null>(null);
const deptScopeTreeRef = ref<InstanceType<typeof ElTree> | null>(null);
const { refreshCurrentUserMenus } = useAuthSession();
const { hasPermission } = usePermission();

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
  disabled: (data: unknown) => !canSaveRolePermissions.value || Boolean((data as PermissionTreeNode).disabled),
};
const menuAuthTreeProps = {
  label: 'menuName',
  children: 'children',
  disabled: () => !canSaveRoleMenus.value,
};
const deptTreeProps = {
  label: 'deptName',
  children: 'children',
  disabled: () => !canSaveRoleDeptScopes.value,
};
const canCreateRole = computed(() => hasPermission('system:role:create'));
const canUpdateRole = computed(() => hasPermission('system:role:update'));
const canDeleteRole = computed(() => hasPermission('system:role:delete'));
const canSaveRoleMenus = computed(() => hasPermission('system:role:menu-save'));
const canSaveRolePermissions = computed(() => hasPermission('system:role:permission-save'));
const canSaveRoleDeptScopes = computed(() => hasPermission('system:role:dept-scope-save'));
// 授权弹窗入口只依赖查询类权限；保存按钮独立依赖写权限，支持只读授权核对场景。
const canViewRoleMenus = computed(() => hasPermission('system:role:menu-query'));
const canViewRolePermissions = computed(() => hasPermission('system:role:permission-query'));
const canViewRoleDeptScopes = computed(() => hasPermission('system:role:dept-scope-query'));
const canOperateRole = computed(() =>
  canUpdateRole.value ||
    canDeleteRole.value ||
    canViewRoleMenus.value ||
    canViewRolePermissions.value ||
    canViewRoleDeptScopes.value,
);
const canSubmitRole = computed(() => (roleFormMode.value === 'create' ? canCreateRole.value : canUpdateRole.value));
const canSaveDeptScope = computed(() =>
  canSaveRoleDeptScopes.value && assigningRole.value?.dataScopeType === 'custom_dept',
);
const roleTypeText = (role: SystemRole) => (role.preset ? '预置角色' : '自定义角色');
const statusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const permissionStatusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const dataScopeStatusText = (scope: string) => (scope === 'custom_dept' ? '可维护' : '规则已定义');
const dataScopeTagType = (scope: string) => (scope === 'custom_dept' ? 'success' : 'info');
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
  return systemModuleNameText(moduleCode);
}

function flattenMenus(nodes: SystemMenuManagementNode[]): SystemMenuManagementNode[] {
  return nodes.flatMap((node) => [node, ...flattenMenus(node.children ?? [])]);
}

function hasSelectedDescendant(menu: SystemMenuManagementNode, selectedIds: Set<string>): boolean {
  return (menu.children ?? []).some((child) => selectedIds.has(String(child.menuId)) || hasSelectedDescendant(child, selectedIds));
}

function resolveMenuCheckedKeys(menuIds: EntityId[]): string[] {
  const selectedIds = new Set(menuIds.map(String));
  /*
   * 历史数据可能同时保存了父菜单和子菜单。
   * 回显时跳过已有子级授权的父菜单，让父级只作为半选展示，重新保存后可自然清理旧父级授权。
   */
  return flattenMenus(menuTree.value)
    .filter((menu) => selectedIds.has(String(menu.menuId)) && !hasSelectedDescendant(menu, selectedIds))
    .map((menu) => String(menu.menuId));
}

function resolveMenuIdsForSave(menuIds: EntityId[]): string[] {
  const selectedIds = new Set(menuIds.map(String));
  /*
   * 保存时同样剔除被子级覆盖的父菜单。
   * 当前用户菜单查询会补齐祖先目录，数据库授权只记录真正需要开放的菜单节点。
   */
  return flattenMenus(menuTree.value)
    .filter((menu) => selectedIds.has(String(menu.menuId)) && !hasSelectedDescendant(menu, selectedIds))
    .map((menu) => String(menu.menuId));
}

function hasSameMenuIds(leftIds: EntityId[], rightIds: EntityId[]): boolean {
  const left = new Set(leftIds.map(String));
  const right = new Set(rightIds.map(String));
  return left.size === right.size && Array.from(left).every((menuId) => right.has(menuId));
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
  const childModuleNodes = buildChildPermissionGroupNodes(moduleCode, groupMap, usedModules);
  if (permissionNodes.length > 0) {
    usedModules.add(moduleCode);
  }
  const children = [...childNodes, ...childModuleNodes, ...permissionNodes];
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

function buildChildPermissionGroupNodes(
  parentModuleCode: string,
  groupMap: Map<string, SystemPermission[]>,
  usedModules: Set<string>,
): PermissionTreeNode[] {
  // 业务根菜单下的子模块权限统一收敛展示，避免授权树根节点碎片化。
  return Array.from(groupMap.entries())
    .filter(([moduleCode]) =>
      !usedModules.has(moduleCode) &&
      moduleCode !== parentModuleCode &&
      systemModuleAuthorizationRootCode(moduleCode) === parentModuleCode)
    .sort(([leftCode, leftItems], [rightCode, rightItems]) =>
      permissionGroupSortOrder(leftItems) - permissionGroupSortOrder(rightItems)
      || moduleNameText(leftCode).localeCompare(moduleNameText(rightCode), 'zh-CN'))
    .map(([moduleCode, items]) => {
      usedModules.add(moduleCode);
      return buildPermissionGroupNode(moduleCode, moduleNameText(moduleCode), items);
    });
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

function permissionGroupSortOrder(items: SystemPermission[]): number {
  return items.reduce((minimum, permission) => Math.min(minimum, permission.sortOrder), Number.MAX_SAFE_INTEGER);
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (isApiRequestError(error) || error instanceof Error) {
    return error.message;
  }
  return fallback;
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
    const authorization = await systemApi.getRoleMenuAuthorization(role.roleId);
    menuTree.value = authorization.menus;
    const checkedKeys = resolveMenuCheckedKeys(authorization.assignedMenuIds);
    await nextTick();
    menuAuthTreeRef.value?.setCheckedKeys([], false);
    checkedKeys.forEach((menuId) => {
      /*
       * 角色菜单授权必须按数据库中的真实菜单ID精确回显。
       * 不能深度勾选父节点，否则历史父级授权会把同级子菜单一并勾上。
       */
      menuAuthTreeRef.value?.setChecked(menuId, true, false);
    });
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
    /*
     * 只保存真实勾选节点，不提交半选父节点。
     * 半选父节点只是树形展示状态，提交后会在下次回填时联动勾选同级菜单。
     */
    const checkedKeys = menuAuthTreeRef.value.getCheckedKeys(false).map(String);
    const menuIds = resolveMenuIdsForSave(Array.from(new Set(checkedKeys)));
    await systemApi.saveRoleMenus(assigningRole.value.roleId, { menuIds });
    const savedAuthorization = await systemApi.getRoleMenuAuthorization(assigningRole.value.roleId);
    const savedMenuIds = savedAuthorization.assignedMenuIds;
    if (!hasSameMenuIds(menuIds, savedMenuIds)) {
      throw new Error('菜单授权保存后回显不一致，请刷新页面后重新保存');
    }
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
    const authorization = await systemApi.getRolePermissionAuthorization(role.roleId);
    menuTree.value = authorization.menus;
    permissions.value = authorization.permissions;
    await nextTick();
    // Element Plus 树节点渲染完成后再回填勾选状态，否则首屏可能无法正确选中。
    permissionAuthTreeRef.value?.setCheckedKeys(authorization.assignedPermissionIds.map(permissionNodeKey), false);
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
    await refreshCurrentUserMenus();
    showSuccessMessage('接口权限已保存');
    permissionDialogVisible.value = false;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '接口权限保存失败'));
  } finally {
    saving.value = false;
  }
}

async function openDataScopeAssign(role: SystemRole): Promise<void> {
  assigningRole.value = role;
  dataScopeDialogVisible.value = true;
  try {
    const authorization = await systemApi.getRoleDeptScopeAuthorization(role.roleId);
    deptTree.value = authorization.departments;
    await nextTick();
    if (role.dataScopeType !== 'custom_dept') {
      deptScopeTreeRef.value?.setCheckedKeys([], false);
      return;
    }
    deptScopeTreeRef.value?.setCheckedKeys(authorization.assignedDeptIds.map(String), false);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '数据范围加载失败'));
  }
}

async function saveDataScopeAssign(): Promise<void> {
  if (!assigningRole.value || !deptScopeTreeRef.value || assigningRole.value.dataScopeType !== 'custom_dept') {
    return;
  }
  saving.value = true;
  try {
    // 自定义部门范围只提交真实勾选节点，父子联动由 Element Plus 树组件负责。
    const deptIds = deptScopeTreeRef.value.getCheckedKeys(false).map(String);
    await systemApi.saveRoleDeptScopes(assigningRole.value.roleId, { deptIds });
    showSuccessMessage('数据范围已保存');
    dataScopeDialogVisible.value = false;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '数据范围保存失败'));
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
        <p class="section-heading__desc">维护角色基础信息，并分别配置菜单入口、接口权限和数据范围。</p>
      </div>
      <div class="system-page__actions">
        <el-button :loading="loading" @click="loadRoles">刷新</el-button>
        <el-button v-if="canCreateRole" type="primary" @click="openCreateRole">新增角色</el-button>
      </div>
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
            <el-tag size="small" :type="dataScopeTagType(row.dataScopeType)">
              {{ dataScopeStatusText(row.dataScopeType) }}
            </el-tag>
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
      <el-table-column v-if="canOperateRole" label="操作" width="350" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canUpdateRole" link type="primary" @click="openEditRole(row)">编辑</el-button>
          <el-button v-if="canViewRoleMenus" link type="primary" @click="openMenuAssign(row)">菜单授权</el-button>
          <el-button v-if="canViewRolePermissions" link type="primary" @click="openPermissionAssign(row)">
            接口权限
          </el-button>
          <el-button v-if="canViewRoleDeptScopes" link type="primary" @click="openDataScopeAssign(row)">
            数据范围
          </el-button>
          <el-button v-if="canDeleteRole" link type="danger" :disabled="row.preset" @click="deleteRole(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="roleDialogVisible" :title="roleDialogTitle" width="560px" align-center>
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
          <div v-for="item in DATA_SCOPE_DESCRIPTIONS" :key="item.value" class="role-data-scope-help__item">
            <strong>{{ item.scope }}</strong>
            <el-tag size="small" :type="dataScopeTagType(item.value)">
              {{ dataScopeStatusText(item.value) }}
            </el-tag>
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
        <el-button v-if="canSubmitRole" type="primary" :loading="saving" @click="submitRole">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dataScopeDialogVisible" title="数据范围" width="720px" align-center>
      <p class="system-page__hint">当前角色：{{ assigningRole?.roleName }}</p>
      <p class="system-page__hint">当前规则：{{ dataScopeText(assigningRole?.dataScopeType ?? '') }}</p>
      <el-alert
        show-icon
        :closable="false"
        type="info"
        title="数据范围规则已支持保存和解析；用户管理列表已接入过滤，其他业务域仍需逐步接入。"
      />
      <el-tree
        v-if="assigningRole?.dataScopeType === 'custom_dept'"
        ref="deptScopeTreeRef"
        :data="deptTree"
        show-checkbox
        node-key="deptId"
        default-expand-all
        :props="deptTreeProps"
        class="dept-scope-tree"
      />
      <el-empty
        v-else
        description="当前规则由后端按登录人部门自动解析，无需维护部门范围"
        class="dept-scope-empty"
      />
      <template #footer>
        <el-button @click="dataScopeDialogVisible = false">取消</el-button>
        <el-button v-if="canSaveDeptScope" type="primary" :loading="saving" @click="saveDataScopeAssign">
          保存范围
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="menuDialogVisible" title="菜单授权" width="640px" align-center>
      <p class="system-page__hint">当前角色：{{ assigningRole?.roleName }}</p>
      <p class="system-page__hint">菜单授权只控制左侧导航和页面入口，不再自动授予接口权限。</p>
      <el-tree
        ref="menuAuthTreeRef"
        :data="menuTree"
        show-checkbox
        node-key="menuId"
        default-expand-all
        :props="menuAuthTreeProps"
      />
      <template #footer>
        <el-button @click="menuDialogVisible = false">取消</el-button>
        <el-button v-if="canSaveRoleMenus" type="primary" :loading="saving" @click="saveMenuAssign">保存授权</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="permissionDialogVisible" title="接口权限" width="860px" align-center>
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
        <el-button v-if="canSaveRolePermissions" type="primary" :loading="saving" @click="savePermissionAssign">
          保存权限
        </el-button>
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

.dept-scope-tree {
  max-height: 520px;
  margin-top: 14px;
  overflow-y: auto;
  padding-right: 6px;
}

.dept-scope-empty {
  margin-top: 12px;
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
