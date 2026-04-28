import type {
  SystemMenuCreatePayload,
  SystemMenuManagementNode,
  SystemMenuNode,
  SystemMenuUpdatePayload,
  SystemPermission,
  SystemPermissionCreatePayload,
  SystemPermissionUpdatePayload,
  SystemDept,
  SystemDeptCreatePayload,
  SystemDeptStatusUpdatePayload,
  SystemDeptUpdatePayload,
  SystemRole,
  SystemRoleCreatePayload,
  SystemRoleMenuAssignPayload,
  SystemRolePermissionAssignPayload,
  SystemRoleUpdatePayload,
  EntityId,
} from '@/types';
import { apiRequest } from '../request';

export const systemApi = {
  // 当前用户菜单用于动态路由、左侧菜单和页签权限判断。
  getCurrentUserMenus(): Promise<SystemMenuNode[]> {
    return apiRequest.get<SystemMenuNode[]>('/api/v1/system/menus/current');
  },

  // 角色列表承载角色基础信息，数据范围当前只作为配置展示。
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

  // 权限列表同时服务权限管理和角色接口权限授权树。
  listPermissions(): Promise<SystemPermission[]> {
    return apiRequest.get<SystemPermission[]>('/api/v1/system/permissions');
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
