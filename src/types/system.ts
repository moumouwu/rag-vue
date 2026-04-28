export type EntityId = string;

export interface SystemMenuNode {
  menuId: EntityId;
  menuCode: string;
  parentId: EntityId;
  menuType: 'directory' | 'menu';
  menuName: string;
  routeName: string;
  routePath: string;
  componentPath: string;
  icon: string;
  externalLinkUrl: string;
  cacheFlag: boolean;
  alwaysShowFlag: boolean;
  sortOrder: number;
  children: SystemMenuNode[];
}

export interface SystemRole {
  roleId: EntityId;
  roleCode: string;
  roleName: string;
  roleType: 'preset' | 'custom';
  dataScopeType: string;
  sortOrder: number;
  roleStatus: 'enabled' | 'disabled';
  preset: boolean;
  remark: string;
}

export interface SystemRoleCreatePayload {
  roleCode: string;
  roleName: string;
  dataScopeType: string;
  sortOrder: number;
  roleStatus: 'enabled' | 'disabled';
  remark: string;
}

export type SystemRoleUpdatePayload = Omit<SystemRoleCreatePayload, 'roleCode'>;

export interface SystemRoleMenuAssignPayload {
  menuIds: EntityId[];
}

export interface SystemPermission {
  permissionId: EntityId;
  permissionCode: string;
  permissionName: string;
  moduleCode: string;
  permissionType: 'api' | 'operation' | 'data_scope';
  httpMethod: string;
  resourcePath: string;
  sortOrder: number;
  permissionStatus: 'enabled' | 'disabled';
  preset: boolean;
  remark: string;
}

export interface SystemPermissionCreatePayload {
  permissionCode: string;
  permissionName: string;
  moduleCode: string;
  permissionType: 'api' | 'operation' | 'data_scope';
  httpMethod: string;
  resourcePath: string;
  sortOrder: number;
  permissionStatus: 'enabled' | 'disabled';
  remark: string;
}

export type SystemPermissionUpdatePayload = Omit<SystemPermissionCreatePayload, 'permissionCode'>;

export interface SystemRolePermissionAssignPayload {
  permissionIds: EntityId[];
}

export interface SystemMenuManagementNode {
  menuId: EntityId;
  menuCode: string;
  parentId: EntityId;
  ancestors: string;
  menuType: 'directory' | 'menu' | 'button';
  menuName: string;
  routeName: string;
  routePath: string;
  componentPath: string;
  icon: string;
  externalLinkUrl: string;
  visibleFlag: boolean;
  cacheFlag: boolean;
  alwaysShowFlag: boolean;
  sortOrder: number;
  menuStatus: 'enabled' | 'disabled';
  remark: string;
  children: SystemMenuManagementNode[];
}

export interface SystemMenuCreatePayload {
  menuCode: string;
  parentId: EntityId;
  menuType: 'directory' | 'menu' | 'button';
  menuName: string;
  routeName: string;
  routePath: string;
  componentPath: string;
  icon: string;
  externalLinkUrl: string;
  visibleFlag: boolean;
  cacheFlag: boolean;
  alwaysShowFlag: boolean;
  sortOrder: number;
  menuStatus: 'enabled' | 'disabled';
  remark: string;
}

export type SystemMenuUpdatePayload = Omit<SystemMenuCreatePayload, 'menuCode'>;

export interface SystemDept {
  deptId: EntityId;
  deptCode: string;
  parentId: EntityId;
  ancestors: string;
  deptName: string;
  leaderUserId: EntityId | null;
  sortOrder: number;
  deptStatus: 'enabled' | 'disabled';
  remark: string;
  children: SystemDept[];
}

export interface SystemDeptCreatePayload {
  deptCode: string;
  parentId: EntityId;
  deptName: string;
  leaderUserId: EntityId | null;
  sortOrder: number;
  deptStatus: 'enabled' | 'disabled';
  remark: string;
}

export type SystemDeptUpdatePayload = Omit<SystemDeptCreatePayload, 'deptCode'>;

export interface SystemDeptStatusUpdatePayload {
  deptStatus: 'enabled' | 'disabled';
}
