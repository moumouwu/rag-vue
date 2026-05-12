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
  SystemLoginLog,
  SystemLoginLogArchive,
  SystemLoginLogArchiveQuery,
  SystemLoginLogQuery,
  SystemOperationLog,
  SystemOperationLogArchive,
  SystemOperationLogArchiveQuery,
  SystemOperationLogQuery,
  SystemDictItem,
  SystemDictItemCreatePayload,
  SystemDictItemUpdatePayload,
  SystemDictType,
  SystemDictTypeCreatePayload,
  SystemDictTypeQuery,
  SystemDictTypeUpdatePayload,
  SystemUser,
  SystemUserCreatePayload,
  SystemUserDetail,
  SystemUserQuery,
  SystemUserRoleAuthorization,
  SystemUserRoleAssignPayload,
  SystemUserStatusUpdatePayload,
  SystemUserUpdatePayload,
  SystemDept,
  SystemDeptCreatePayload,
  SystemDeptStatusUpdatePayload,
  SystemDeptUpdatePayload,
  SystemRole,
  SystemRoleCreatePayload,
  SystemRoleDeptScopeAuthorization,
  SystemRoleDeptScopeAssignPayload,
  SystemRoleMenuAuthorization,
  SystemRoleMenuAssignPayload,
  SystemRolePermissionAuthorization,
  SystemRolePermissionAssignPayload,
  SystemRoleUpdatePayload,
  EntityId,
} from '@/types';
import { buildQueryUrl } from '../query';
import { apiRequest } from '../request';

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

  // 用户详情用于编辑表单和角色授权回显，后端会返回审计字段和有效角色 ID。
  getUser(userId: EntityId): Promise<SystemUserDetail> {
    return apiRequest.get<SystemUserDetail>(`/api/v1/system/users/${userId}`);
  },

  // 创建用户时只提交初始明文密码，后端负责生成摘要并写入首批角色关系。
  createUser(payload: SystemUserCreatePayload): Promise<SystemUserDetail> {
    return apiRequest.post<SystemUserDetail, SystemUserCreatePayload>('/api/v1/system/users', payload);
  },

  // 编辑用户不允许改用户名和密码，避免登录标识在历史审计中漂移。
  updateUser(userId: EntityId, payload: SystemUserUpdatePayload): Promise<SystemUserDetail> {
    return apiRequest.put<SystemUserDetail, SystemUserUpdatePayload>(`/api/v1/system/users/${userId}`, payload);
  },

  // 启停用户走独立接口，停用后的登录和受保护接口访问由后端认证链路拦截。
  updateUserStatus(userId: EntityId, payload: SystemUserStatusUpdatePayload): Promise<SystemUserDetail> {
    return apiRequest.put<SystemUserDetail, SystemUserStatusUpdatePayload>(
      `/api/v1/system/users/${userId}/status`,
      payload,
    );
  },

  // 用户角色授权查询直接返回可选角色和已选 ID，避免授权弹窗额外依赖角色列表接口权限。
  getUserRoleAuthorization(userId: EntityId): Promise<SystemUserRoleAuthorization> {
    return apiRequest.get<SystemUserRoleAuthorization>(`/api/v1/system/users/${userId}/role-authorization`);
  },

  // 保存用户角色关系采用覆盖语义，空数组表示清空用户角色。
  saveUserRoles(userId: EntityId, payload: SystemUserRoleAssignPayload): Promise<void> {
    return apiRequest.put<void, SystemUserRoleAssignPayload>(`/api/v1/system/users/${userId}/roles`, payload);
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

  // 角色菜单授权查询聚合菜单树和已选 ID，不能再依赖菜单管理树接口权限。
  getRoleMenuAuthorization(roleId: EntityId): Promise<SystemRoleMenuAuthorization> {
    return apiRequest.get<SystemRoleMenuAuthorization>(`/api/v1/system/roles/${roleId}/menu-authorization`);
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

  // 权限管理页仍按分页维护；授权弹窗使用聚合授权接口，不再调用本方法。
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

  // 登录日志只提供分页查询，日志写入由后端认证链路统一完成，前端不得手动构造日志数据。
  listLoginLogs(query: SystemLoginLogQuery): Promise<PageData<SystemLoginLog>> {
    return apiRequest.get<PageData<SystemLoginLog>>(buildQueryUrl('/api/v1/system/logs/login', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      userId: query.userId,
      username: query.username,
      loginMethod: query.loginMethod,
      eventType: query.eventType,
      result: query.result,
      ipAddress: query.ipAddress,
      requestId: query.requestId,
      startTime: query.startTime,
      endTime: query.endTime,
    }));
  },

  // 归档登录日志属于冷数据，必须使用独立权限，避免热日志查询权限扩大到长期归档数据。
  listLoginLogArchives(query: SystemLoginLogArchiveQuery): Promise<PageData<SystemLoginLogArchive>> {
    return apiRequest.get<PageData<SystemLoginLogArchive>>(buildQueryUrl('/api/v1/system/logs/login/archive', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      sourceLogId: query.sourceLogId,
      archiveBatchNo: query.archiveBatchNo,
      archiveStartTime: query.archiveStartTime,
      archiveEndTime: query.archiveEndTime,
      userId: query.userId,
      username: query.username,
      loginMethod: query.loginMethod,
      eventType: query.eventType,
      result: query.result,
      ipAddress: query.ipAddress,
      requestId: query.requestId,
      startTime: query.startTime,
      endTime: query.endTime,
    }));
  },

  // 操作日志只展示后端写入的操作摘要，不能依赖前端自行拼接操作记录。
  listOperationLogs(query: SystemOperationLogQuery): Promise<PageData<SystemOperationLog>> {
    return apiRequest.get<PageData<SystemOperationLog>>(buildQueryUrl('/api/v1/system/logs/operations', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      operatorId: query.operatorId,
      operatorName: query.operatorName,
      moduleCode: query.moduleCode,
      operationType: query.operationType,
      targetType: query.targetType,
      targetId: query.targetId,
      result: query.result,
      requestId: query.requestId,
      startTime: query.startTime,
      endTime: query.endTime,
    }));
  },

  // 归档操作日志用于长期审计回查，前端只做查询，不提供恢复、导出或物理清理入口。
  listOperationLogArchives(query: SystemOperationLogArchiveQuery): Promise<PageData<SystemOperationLogArchive>> {
    return apiRequest.get<PageData<SystemOperationLogArchive>>(buildQueryUrl('/api/v1/system/logs/operations/archive', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      sourceLogId: query.sourceLogId,
      archiveBatchNo: query.archiveBatchNo,
      archiveStartTime: query.archiveStartTime,
      archiveEndTime: query.archiveEndTime,
      operatorId: query.operatorId,
      operatorName: query.operatorName,
      moduleCode: query.moduleCode,
      operationType: query.operationType,
      targetType: query.targetType,
      targetId: query.targetId,
      result: query.result,
      requestId: query.requestId,
      startTime: query.startTime,
      endTime: query.endTime,
    }));
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

  // 角色接口权限授权查询聚合菜单分组、接口权限和已选 ID，避免弹窗额外依赖权限列表或菜单树权限。
  getRolePermissionAuthorization(roleId: EntityId): Promise<SystemRolePermissionAuthorization> {
    return apiRequest.get<SystemRolePermissionAuthorization>(
      `/api/v1/system/roles/${roleId}/permission-authorization`,
    );
  },

  // 保存接口权限授权直接维护角色-权限关系，不依赖菜单。
  saveRolePermissions(roleId: EntityId, payload: SystemRolePermissionAssignPayload): Promise<void> {
    return apiRequest.put<void, SystemRolePermissionAssignPayload>(
      `/api/v1/system/roles/${roleId}/permissions`,
      payload,
    );
  },

  // 角色数据范围授权查询聚合部门树和已选 ID，避免弹窗额外依赖部门树接口权限。
  getRoleDeptScopeAuthorization(roleId: EntityId): Promise<SystemRoleDeptScopeAuthorization> {
    return apiRequest.get<SystemRoleDeptScopeAuthorization>(
      `/api/v1/system/roles/${roleId}/dept-scope-authorization`,
    );
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
    return apiRequest.get<SystemDept[]>('/api/v1/system/depts/tree', { suppressForbiddenRedirect: true });
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
