import type {
  PageData,
  SystemMenuCreatePayload,
  SystemMenuManagementNode,
  SystemMenuNode,
  SystemMenuUpdatePayload,
  SystemPermission,
  SystemPermissionCreatePayload,
  SystemPermissionQuery,
  SystemPermissionUpdatePayload,
  SystemDictItem,
  SystemDictItemCreatePayload,
  SystemDictItemUpdatePayload,
  SystemDictType,
  SystemDictTypeCreatePayload,
  SystemDictTypeQuery,
  SystemDictTypeUpdatePayload,
  SystemUser,
  SystemUserQuery,
  SystemDept,
  SystemDeptCreatePayload,
  SystemDeptStatusUpdatePayload,
  SystemDeptUpdatePayload,
  SystemRole,
  SystemRoleCreatePayload,
  SystemRoleDeptScopeAssignPayload,
  SystemRoleMenuAssignPayload,
  SystemRolePermissionAssignPayload,
  SystemRoleUpdatePayload,
  EntityId,
} from '@/types';
import { apiRequest } from '../request';

function buildQueryUrl(path: string, params: Record<string, string | number | null | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    // 过滤空参数，避免后端把空字符串误判为有效筛选条件。
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      searchParams.set(key, String(value).trim());
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export const systemApi = {
  // 当前用户菜单用于动态路由、左侧菜单和页签权限判断。
  getCurrentUserMenus(): Promise<SystemMenuNode[]> {
    return apiRequest.get<SystemMenuNode[]>('/api/v1/system/menus/current');
  },

  // 用户列表会按当前登录人的角色数据范围过滤，并使用后端分页避免一次性加载大量用户。
  listUsers(query: SystemUserQuery = {}): Promise<PageData<SystemUser>> {
    return apiRequest.get<PageData<SystemUser>>(buildQueryUrl('/api/v1/system/users', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      username: query.username,
      displayName: query.displayName,
      departmentId: query.departmentId,
      userStatus: query.userStatus,
    }));
  },

  // 角色列表承载角色基础信息，数据范围规则已可维护，业务列表需接入后才会生效。
  listRoles(): Promise<SystemRole[]> {
    return apiRequest.get<SystemRole[]>('/api/v1/system/roles');
  },

  // 创建角色只维护基础资料，菜单和接口权限需走独立授权接口。
  createRole(payload: SystemRoleCreatePayload): Promise<SystemRole> {
    return apiRequest.post<SystemRole, SystemRoleCreatePayload>('/api/v1/system/roles', payload);
  },

  // 角色编码创建后不可改，编辑请求不包含 roleCode。
  updateRole(roleId: EntityId, payload: SystemRoleUpdatePayload): Promise<SystemRole> {
    return apiRequest.put<SystemRole, SystemRoleUpdatePayload>(`/api/v1/system/roles/${roleId}`, payload);
  },

  // 删除角色受后端预置角色、用户绑定和授权关系保护。
  deleteRole(roleId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/system/roles/${roleId}`);
  },

  // 查询角色已授权菜单 ID，用于菜单树回显勾选状态。
  listRoleMenuIds(roleId: EntityId): Promise<EntityId[]> {
    return apiRequest.get<EntityId[]>(`/api/v1/system/roles/${roleId}/menu-ids`);
  },

  // 保存菜单授权只影响导航入口，不同步接口权限。
  saveRoleMenus(roleId: EntityId, payload: SystemRoleMenuAssignPayload): Promise<void> {
    return apiRequest.put<void, SystemRoleMenuAssignPayload>(`/api/v1/system/roles/${roleId}/menus`, payload);
  },

  // 权限管理页使用后端分页和筛选，避免权限清单增长后一次性加载。
  pagePermissions(query: SystemPermissionQuery): Promise<PageData<SystemPermission>> {
    return apiRequest.get<PageData<SystemPermission>>(buildQueryUrl('/api/v1/system/permissions', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      keyword: query.keyword,
      moduleCode: query.moduleCode,
      permissionType: query.permissionType,
      permissionStatus: query.permissionStatus,
    }));
  },

  // 角色授权树需要完整接口权限清单；通过分页循环拉取，避免依赖后端一次性全量返回。
  async listPermissions(): Promise<SystemPermission[]> {
    const pageSize = 100;
    const firstPage = await systemApi.pagePermissions({ pageNo: 1, pageSize, permissionType: 'api' });
    const permissions = [...firstPage.list];
    for (let pageNo = 2; permissions.length < firstPage.total; pageNo += 1) {
      const pageData = await systemApi.pagePermissions({ pageNo, pageSize, permissionType: 'api' });
      if (pageData.list.length === 0) {
        break;
      }
      permissions.push(...pageData.list);
    }
    return permissions;
  },

  // 手动新增权限默认用于补充接口权限清单或后续操作权限预留。
  createPermission(payload: SystemPermissionCreatePayload): Promise<SystemPermission> {
    return apiRequest.post<SystemPermission, SystemPermissionCreatePayload>('/api/v1/system/permissions', payload);
  },

  // 权限编码创建后不可改，编辑只维护展示、类型、路径和状态。
  updatePermission(permissionId: EntityId, payload: SystemPermissionUpdatePayload): Promise<SystemPermission> {
    return apiRequest.put<SystemPermission, SystemPermissionUpdatePayload>(
      `/api/v1/system/permissions/${permissionId}`,
      payload,
    );
  },

  // 删除权限受预置权限和角色授权引用保护。
  deletePermission(permissionId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/system/permissions/${permissionId}`);
  },

  // 字典类型会持续增长，列表必须走后端分页，前端只传筛选条件不自行裁剪全量数据。
  listDictTypes(query: SystemDictTypeQuery): Promise<PageData<SystemDictType>> {
    return apiRequest.get<PageData<SystemDictType>>(buildQueryUrl('/api/v1/system/dicts/types', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      keyword: query.keyword,
      typeStatus: query.typeStatus,
    }));
  },

  // 创建字典类型时只提交展示与状态字段，预置标记由后端控制。
  createDictType(payload: SystemDictTypeCreatePayload): Promise<SystemDictType> {
    return apiRequest.post<SystemDictType, SystemDictTypeCreatePayload>('/api/v1/system/dicts/types', payload);
  },

  // 更新字典类型不允许修改编码，避免历史业务数据引用漂移。
  updateDictType(typeId: EntityId, payload: SystemDictTypeUpdatePayload): Promise<SystemDictType> {
    return apiRequest.put<SystemDictType, SystemDictTypeUpdatePayload>(
      `/api/v1/system/dicts/types/${typeId}`,
      payload,
    );
  },

  // 删除字典类型由后端校验预置保护和字典项占用，前端不做乐观删除。
  deleteDictType(typeId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/system/dicts/types/${typeId}`);
  },

  // 字典项按类型加载，包含停用项，便于管理员维护历史取值展示。
  listDictItems(typeId: EntityId): Promise<SystemDictItem[]> {
    return apiRequest.get<SystemDictItem[]>(`/api/v1/system/dicts/types/${typeId}/items`);
  },

  // 创建字典项时 itemValue 是业务保存值，创建后不可修改。
  createDictItem(typeId: EntityId, payload: SystemDictItemCreatePayload): Promise<SystemDictItem> {
    return apiRequest.post<SystemDictItem, SystemDictItemCreatePayload>(
      `/api/v1/system/dicts/types/${typeId}/items`,
      payload,
    );
  },

  // 更新字典项只维护中文标签、状态、排序和备注，避免改动业务保存值。
  updateDictItem(
    typeId: EntityId,
    itemId: EntityId,
    payload: SystemDictItemUpdatePayload,
  ): Promise<SystemDictItem> {
    return apiRequest.put<SystemDictItem, SystemDictItemUpdatePayload>(
      `/api/v1/system/dicts/types/${typeId}/items/${itemId}`,
      payload,
    );
  },

  // 删除字典项受后端预置保护，真实删除仍走逻辑删除审计。
  deleteDictItem(typeId: EntityId, itemId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/system/dicts/types/${typeId}/items/${itemId}`);
  },

  // 查询角色已授权接口权限 ID，用于接口权限树回显。
  listRolePermissionIds(roleId: EntityId): Promise<EntityId[]> {
    return apiRequest.get<EntityId[]>(`/api/v1/system/roles/${roleId}/permission-ids`);
  },

  // 保存接口权限授权直接维护角色-权限关系，不依赖菜单。
  saveRolePermissions(roleId: EntityId, payload: SystemRolePermissionAssignPayload): Promise<void> {
    return apiRequest.put<void, SystemRolePermissionAssignPayload>(
      `/api/v1/system/roles/${roleId}/permissions`,
      payload,
    );
  },

  // 查询角色自定义部门范围，用于数据范围树回显；非 custom_dept 角色只作为兼容查询。
  listRoleDeptScopeIds(roleId: EntityId): Promise<EntityId[]> {
    return apiRequest.get<EntityId[]>(`/api/v1/system/roles/${roleId}/dept-scope-ids`);
  },

  // 保存角色自定义部门范围，只在角色数据范围为 custom_dept 时调用。
  saveRoleDeptScopes(roleId: EntityId, payload: SystemRoleDeptScopeAssignPayload): Promise<void> {
    return apiRequest.put<void, SystemRoleDeptScopeAssignPayload>(
      `/api/v1/system/roles/${roleId}/dept-scopes`,
      payload,
    );
  },

  // 菜单管理树用于菜单维护、权限模块来源和授权树分组。
  listMenuTree(): Promise<SystemMenuManagementNode[]> {
    return apiRequest.get<SystemMenuManagementNode[]>('/api/v1/system/menus/tree');
  },

  // 创建菜单时维护导航结构，接口权限不在菜单里维护。
  createMenu(payload: SystemMenuCreatePayload): Promise<SystemMenuManagementNode> {
    return apiRequest.post<SystemMenuManagementNode, SystemMenuCreatePayload>('/api/v1/system/menus', payload);
  },

  // 菜单编码创建后不可改，编辑只维护父级、路由、显示和状态。
  updateMenu(menuId: EntityId, payload: SystemMenuUpdatePayload): Promise<SystemMenuManagementNode> {
    return apiRequest.put<SystemMenuManagementNode, SystemMenuUpdatePayload>(`/api/v1/system/menus/${menuId}`, payload);
  },

  // 删除菜单受子菜单和角色授权引用保护。
  deleteMenu(menuId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/system/menus/${menuId}`);
  },

  // 平铺部门列表预留给后续选择器，当前页面主要使用树接口。
  listDepartments(): Promise<SystemDept[]> {
    return apiRequest.get<SystemDept[]>('/api/v1/system/depts');
  },

  // 部门树用于组织结构展示和父级部门选择。
  listDepartmentTree(): Promise<SystemDept[]> {
    return apiRequest.get<SystemDept[]>('/api/v1/system/depts/tree');
  },

  // 创建部门允许 deptCode 为空，后端会生成可读部门编码。
  createDepartment(payload: SystemDeptCreatePayload): Promise<SystemDept> {
    return apiRequest.post<SystemDept, SystemDeptCreatePayload>('/api/v1/system/depts', payload);
  },

  // 部门编码创建后不可改，编辑请求只提交组织结构和展示字段。
  updateDepartment(deptId: EntityId, payload: SystemDeptUpdatePayload): Promise<SystemDept> {
    return apiRequest.put<SystemDept, SystemDeptUpdatePayload>(`/api/v1/system/depts/${deptId}`, payload);
  },

  // 启停部门独立接口用于降低误改其他字段的风险。
  updateDepartmentStatus(deptId: EntityId, payload: SystemDeptStatusUpdatePayload): Promise<SystemDept> {
    return apiRequest.put<SystemDept, SystemDeptStatusUpdatePayload>(
      `/api/v1/system/depts/${deptId}/status`,
      payload,
    );
  },

  // 删除部门受子部门和用户引用保护，前端不做乐观删除。
  deleteDepartment(deptId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/system/depts/${deptId}`);
  },
};
