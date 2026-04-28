<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ElTree } from 'element-plus';
import { useAuthSession } from '@/auth/auth-session';
import { systemApi } from '@/api/modules/system';
import type {
  EntityId,
  SystemMenuManagementNode,
  SystemRole,
  SystemRoleCreatePayload,
  SystemRoleUpdatePayload,
} from '@/types';
import { isApiRequestError } from '@/api/request';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type RoleFormMode = 'create' | 'edit';

const roles = ref<SystemRole[]>([]);
const menuTree = ref<SystemMenuManagementNode[]>([]);
const loading = ref(false);
const saving = ref(false);
const roleDialogVisible = ref(false);
const menuDialogVisible = ref(false);
const roleFormMode = ref<RoleFormMode>('create');
const editingRoleId = ref<EntityId | null>(null);
const assigningRole = ref<SystemRole | null>(null);
const menuAuthTreeRef = ref<InstanceType<typeof ElTree> | null>(null);
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
const roleTypeText = (role: SystemRole) => (role.preset ? '预置角色' : '自定义角色');
const statusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const dataScopeText = (scope: string) => {
  const labels: Record<string, string> = {
    all: '全部数据',
    self_dept: '本部门',
    self_and_children: '本部门及下级',
    custom_dept: '自定义部门',
  };
  return labels[scope] ?? scope;
};

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

onMounted(loadRoles);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">角色管理</h2>
        <p class="section-heading__desc">维护角色基础信息，并为角色配置可访问的菜单和功能入口。</p>
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
        <template #default="{ row }">{{ dataScopeText(row.dataScopeType) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.roleStatus === 'enabled' ? 'success' : 'danger'">{{ statusText(row.roleStatus) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column prop="remark" label="备注" min-width="180" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEditRole(row)">编辑</el-button>
          <el-button link type="primary" @click="openMenuAssign(row)">菜单授权</el-button>
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
  </section>
</template>
