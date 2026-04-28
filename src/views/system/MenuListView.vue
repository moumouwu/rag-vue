<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type { EntityId, SystemMenuCreatePayload, SystemMenuManagementNode, SystemMenuUpdatePayload } from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type MenuFormMode = 'create' | 'edit';

const menuTree = ref<SystemMenuManagementNode[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const formMode = ref<MenuFormMode>('create');
const editingMenuId = ref<EntityId | null>(null);

const menuForm = reactive<SystemMenuCreatePayload>({
  menuCode: '',
  parentId: '0',
  menuType: 'menu',
  menuName: '',
  routeName: '',
  routePath: '',
  componentPath: '',
  icon: '',
  externalLinkUrl: '',
  visibleFlag: true,
  cacheFlag: false,
  alwaysShowFlag: false,
  sortOrder: 10,
  menuStatus: 'enabled',
  remark: '',
});

const dialogTitle = computed(() => (formMode.value === 'create' ? '新增菜单' : '编辑菜单'));
const menuTypeText = (type: string) => ({ directory: '目录', menu: '菜单', button: '按钮' }[type] ?? type);
const statusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const emptyText = (value: string | null | undefined) => value?.trim() || '未设置';
const settingTagType = (enabled: boolean) => (enabled ? 'success' : 'info');

const parentOptions = computed(() => {
  const options: Array<{ menuId: EntityId; label: string }> = [{ menuId: '0', label: '根目录' }];
  flattenMenus(menuTree.value).forEach((menu) => {
    if (menu.menuId !== editingMenuId.value) {
      // 全角空格只用于下拉层级展示，不参与提交值，避免污染菜单名称。
      options.push({ menuId: menu.menuId, label: `${'　'.repeat(resolveLevel(menu))}${menu.menuName}` });
    }
  });
  return options;
});

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function flattenMenus(nodes: SystemMenuManagementNode[]): SystemMenuManagementNode[] {
  return nodes.flatMap((node) => [node, ...flattenMenus(node.children ?? [])]);
}

function resolveLevel(menu: SystemMenuManagementNode): number {
  return menu.ancestors ? Math.max(menu.ancestors.split(',').length - 1, 0) : 0;
}

async function loadMenuTree(): Promise<void> {
  loading.value = true;
  try {
    menuTree.value = await systemApi.listMenuTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '菜单树加载失败'));
  } finally {
    loading.value = false;
  }
}

function resetMenuForm(parentId: EntityId = '0'): void {
  menuForm.menuCode = '';
  menuForm.parentId = parentId;
  menuForm.menuType = 'menu';
  menuForm.menuName = '';
  menuForm.routeName = '';
  menuForm.routePath = '';
  menuForm.componentPath = '';
  menuForm.icon = '';
  menuForm.externalLinkUrl = '';
  menuForm.visibleFlag = true;
  menuForm.cacheFlag = false;
  menuForm.alwaysShowFlag = false;
  menuForm.sortOrder = 10;
  menuForm.menuStatus = 'enabled';
  menuForm.remark = '';
}

function openCreateMenu(parentId: EntityId = '0'): void {
  formMode.value = 'create';
  editingMenuId.value = null;
  resetMenuForm(parentId);
  dialogVisible.value = true;
}

function openEditMenu(menu: SystemMenuManagementNode): void {
  formMode.value = 'edit';
  editingMenuId.value = menu.menuId;
  menuForm.menuCode = menu.menuCode;
  menuForm.parentId = menu.parentId;
  menuForm.menuType = menu.menuType;
  menuForm.menuName = menu.menuName;
  menuForm.routeName = menu.routeName;
  menuForm.routePath = menu.routePath;
  menuForm.componentPath = menu.componentPath;
  menuForm.icon = menu.icon;
  menuForm.externalLinkUrl = menu.externalLinkUrl;
  menuForm.visibleFlag = menu.visibleFlag;
  menuForm.cacheFlag = menu.cacheFlag;
  menuForm.alwaysShowFlag = menu.alwaysShowFlag;
  menuForm.sortOrder = menu.sortOrder;
  menuForm.menuStatus = menu.menuStatus;
  menuForm.remark = menu.remark ?? '';
  dialogVisible.value = true;
}

async function submitMenu(): Promise<void> {
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await systemApi.createMenu({ ...menuForm });
      showSuccessMessage('菜单已新增');
    } else if (editingMenuId.value) {
      // 菜单编码创建后不可修改，编辑请求只提交可维护字段。
      const payload: SystemMenuUpdatePayload = {
        parentId: menuForm.parentId,
        menuType: menuForm.menuType,
        menuName: menuForm.menuName,
        routeName: menuForm.routeName,
        routePath: menuForm.routePath,
        componentPath: menuForm.componentPath,
        icon: menuForm.icon,
        externalLinkUrl: menuForm.externalLinkUrl,
        visibleFlag: menuForm.visibleFlag,
        cacheFlag: menuForm.cacheFlag,
        alwaysShowFlag: menuForm.alwaysShowFlag,
        sortOrder: menuForm.sortOrder,
        menuStatus: menuForm.menuStatus,
        remark: menuForm.remark,
      };
      await systemApi.updateMenu(editingMenuId.value, payload);
      showSuccessMessage('菜单已保存');
    }
    dialogVisible.value = false;
    await loadMenuTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '菜单保存失败'));
  } finally {
    saving.value = false;
  }
}

async function deleteMenu(menu: SystemMenuManagementNode): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除菜单',
    message: `确认删除菜单“${menu.menuName}”吗？`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.deleteMenu(menu.menuId);
    showSuccessMessage('菜单已删除');
    await loadMenuTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '菜单删除失败'));
  }
}

onMounted(loadMenuTree);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">菜单管理</h2>
        <p class="section-heading__desc">维护目录、菜单和按钮入口，菜单授权只影响角色可访问导航。</p>
      </div>
      <el-button type="primary" @click="openCreateMenu()">新增根菜单</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="menuTree"
      row-key="menuId"
      border
      default-expand-all
      class="system-page__table"
    >
      <el-table-column prop="menuName" label="菜单名称" min-width="180" />
      <el-table-column prop="menuCode" label="菜单编码" min-width="170" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag>{{ menuTypeText(row.menuType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="路由路径" min-width="160">
        <template #default="{ row }">{{ emptyText(row.routePath) }}</template>
      </el-table-column>
      <el-table-column label="组件路径" min-width="180">
        <template #default="{ row }">{{ emptyText(row.componentPath) }}</template>
      </el-table-column>
      <el-table-column label="显示设置" min-width="210">
        <template #default="{ row }">
          <div class="menu-table-settings">
            <el-tag size="small" :type="settingTagType(row.visibleFlag)">
              {{ row.visibleFlag ? '菜单显示' : '菜单隐藏' }}
            </el-tag>
            <el-tag size="small" :type="settingTagType(row.cacheFlag)">
              {{ row.cacheFlag ? '页面缓存' : '不缓存' }}
            </el-tag>
            <el-tag size="small" :type="settingTagType(row.alwaysShowFlag)">
              {{ row.alwaysShowFlag ? '固定展开' : '手动展开' }}
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.menuStatus === 'enabled' ? 'success' : 'danger'">
            {{ statusText(row.menuStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openCreateMenu(row.menuId)">新增子级</el-button>
          <el-button link type="primary" @click="openEditMenu(row)">编辑</el-button>
          <el-button link type="danger" @click="deleteMenu(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="860px" class="menu-edit-dialog">
      <el-form :model="menuForm" label-position="top" class="menu-form">
        <section class="menu-form__section">
          <h3 class="menu-form__section-title">基础信息</h3>
          <div class="menu-form__grid">
            <el-form-item label="菜单编码" required>
              <el-input v-model="menuForm.menuCode" :disabled="formMode === 'edit'" maxlength="64" />
            </el-form-item>
            <el-form-item label="菜单名称" required>
              <el-input v-model="menuForm.menuName" maxlength="128" />
            </el-form-item>
            <el-form-item label="父级菜单" required>
              <el-select v-model="menuForm.parentId" filterable class="system-page__control">
                <el-option
                  v-for="option in parentOptions"
                  :key="option.menuId"
                  :label="option.label"
                  :value="option.menuId"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="菜单类型" required>
              <el-radio-group v-model="menuForm.menuType" class="menu-form__radio">
                <el-radio-button label="directory">目录</el-radio-button>
                <el-radio-button label="menu">菜单</el-radio-button>
                <el-radio-button label="button">按钮</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="状态" required>
              <el-radio-group v-model="menuForm.menuStatus" class="menu-form__radio">
                <el-radio-button label="enabled">启用</el-radio-button>
                <el-radio-button label="disabled">停用</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="排序" required>
              <el-input-number
                v-model="menuForm.sortOrder"
                :min="0"
                :max="9999"
                controls-position="right"
                class="menu-form__number"
              />
            </el-form-item>
          </div>
        </section>

        <section class="menu-form__section">
          <h3 class="menu-form__section-title">路由配置</h3>
          <div class="menu-form__grid">
            <el-form-item label="路由名称">
              <el-input v-model="menuForm.routeName" />
            </el-form-item>
            <el-form-item label="路由路径">
              <el-input v-model="menuForm.routePath" />
            </el-form-item>
            <el-form-item label="组件路径">
              <el-input v-model="menuForm.componentPath" />
            </el-form-item>
            <el-form-item label="图标">
              <el-input v-model="menuForm.icon" />
            </el-form-item>
            <el-form-item label="外链地址" class="menu-form__full">
              <el-input v-model="menuForm.externalLinkUrl" />
            </el-form-item>
          </div>
        </section>

        <section class="menu-form__section menu-form__section--wide">
          <h3 class="menu-form__section-title">显示设置</h3>
          <div class="menu-setting-grid">
            <label class="menu-setting-item">
              <span class="menu-setting-item__text">
                <strong>左侧菜单显示</strong>
                <small>关闭后不会进入用户导航菜单</small>
              </span>
              <el-switch v-model="menuForm.visibleFlag" inline-prompt active-text="显示" inactive-text="隐藏" />
            </label>
            <label class="menu-setting-item">
              <span class="menu-setting-item__text">
                <strong>页面状态缓存</strong>
                <small>开启后页签切换会保留页面状态</small>
              </span>
              <el-switch v-model="menuForm.cacheFlag" inline-prompt active-text="缓存" inactive-text="关闭" />
            </label>
            <label class="menu-setting-item">
              <span class="menu-setting-item__text">
                <strong>目录固定展开</strong>
                <small>开启后侧边栏该目录始终展开</small>
              </span>
              <el-switch v-model="menuForm.alwaysShowFlag" inline-prompt active-text="展开" inactive-text="手动" />
            </label>
          </div>
        </section>

        <section class="menu-form__section menu-form__section--wide">
          <el-form-item label="备注" class="menu-form__remark">
            <el-input v-model="menuForm.remark" type="textarea" maxlength="500" show-word-limit />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitMenu">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>
