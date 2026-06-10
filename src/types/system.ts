import type { PageRequest } from './common';

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

export interface SystemUser {
  userId: EntityId;
  userCode: string;
  username: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  employeeNo: string | null;
  jobTitle: string;
  departmentId: EntityId | null;
  departmentName: string | null;
  superAdmin: boolean;
  userStatus: 'enabled' | 'disabled';
  lastLoginTime: string | null;
  remark: string;
}

export interface SystemUserQuery extends Partial<PageRequest> {
  username?: string;
  displayName?: string;
  departmentId?: EntityId | null;
  userStatus?: 'enabled' | 'disabled' | '';
}

export interface SystemUserDetail extends SystemUser {
  roleIds: EntityId[];
  createdBy: EntityId | null;
  createdByName: string | null;
  createdTime: string | null;
  updatedBy: EntityId | null;
  updatedByName: string | null;
  updatedTime: string | null;
}

export interface SystemUserCreatePayload {
  username: string;
  password: string;
  displayName: string;
  mobile: string;
  email: string;
  employeeNo: string;
  jobTitle: string;
  departmentId: EntityId | null;
  userStatus: 'enabled' | 'disabled';
  roleIds: EntityId[];
  remark: string;
}

export type SystemUserUpdatePayload = Omit<SystemUserCreatePayload, 'username' | 'password' | 'roleIds'>;

export interface SystemUserStatusUpdatePayload {
  userStatus: 'enabled' | 'disabled';
}

export interface SystemUserRoleAssignPayload {
  roleIds: EntityId[];
}

export interface SystemUserRoleAuthorization {
  roles: SystemRole[];
  assignedRoleIds: EntityId[];
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

export interface SystemRoleMenuAuthorization {
  menus: SystemMenuManagementNode[];
  assignedMenuIds: EntityId[];
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

export interface SystemPermissionQuery extends PageRequest {
  keyword?: string;
  moduleCode?: string;
  moduleCodes?: string[];
  permissionType?: 'api' | 'operation' | 'data_scope' | '';
  permissionStatus?: 'enabled' | 'disabled' | '';
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

export interface SystemDictType {
  dictTypeId: EntityId;
  dictTypeCode: string;
  dictTypeName: string;
  sortOrder: number;
  typeStatus: 'enabled' | 'disabled';
  preset: boolean;
  remark: string;
}

export interface SystemDictTypeQuery extends PageRequest {
  keyword?: string;
  typeStatus?: 'enabled' | 'disabled' | '';
}

export interface SystemDictTypeCreatePayload {
  dictTypeCode: string;
  dictTypeName: string;
  sortOrder: number;
  typeStatus: 'enabled' | 'disabled';
  remark: string;
}

export type SystemDictTypeUpdatePayload = Omit<SystemDictTypeCreatePayload, 'dictTypeCode'>;

export interface SystemDictItem {
  dictItemId: EntityId;
  dictTypeId: EntityId;
  itemValue: string;
  itemLabel: string;
  sortOrder: number;
  itemStatus: 'enabled' | 'disabled';
  preset: boolean;
  remark: string;
}

export interface SystemLoginLog {
  loginLogId: EntityId;
  userId: EntityId | null;
  username: string;
  displayName: string;
  loginMethod: 'password' | 'sso' | 'token';
  eventType: string;
  result: 'success' | 'failure';
  failureReason: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  eventTime: string;
}

export interface SystemLoginLogQuery extends Partial<PageRequest> {
  userId?: EntityId | null;
  username?: string;
  loginMethod?: 'password' | 'sso' | 'token' | '';
  eventType?: string;
  result?: 'success' | 'failure' | '';
  ipAddress?: string;
  requestId?: string;
  startTime?: string;
  endTime?: string;
}

export interface SystemLoginLogArchive {
  archiveLogId: EntityId;
  sourceLogId: EntityId;
  archiveBatchNo: string;
  archivedAt: string;
  userId: EntityId | null;
  username: string;
  displayName: string;
  loginMethod: 'password' | 'sso' | 'token';
  eventType: string;
  result: 'success' | 'failure';
  failureReason: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  eventTime: string;
}

export interface SystemLoginLogArchiveQuery extends SystemLoginLogQuery {
  sourceLogId?: EntityId | null;
  archiveBatchNo?: string;
  archiveStartTime?: string;
  archiveEndTime?: string;
}

export interface SystemOperationLog {
  operationLogId: EntityId;
  operatorId: EntityId | null;
  operatorName: string;
  moduleCode: string;
  moduleName: string;
  operationType: string;
  targetType: string;
  targetId: string;
  targetName: string;
  result: 'success' | 'failure';
  failureReason: string;
  requestMethod: string;
  requestPath: string;
  requestParams: string;
  responseParams: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  eventTime: string;
}

export interface SystemOperationLogQuery extends Partial<PageRequest> {
  operatorId?: EntityId | null;
  operatorName?: string;
  moduleCode?: string;
  operationType?: string;
  targetType?: string;
  targetId?: string;
  result?: 'success' | 'failure' | '';
  requestId?: string;
  startTime?: string;
  endTime?: string;
}

export interface SystemOperationLogArchive {
  archiveLogId: EntityId;
  sourceLogId: EntityId;
  archiveBatchNo: string;
  archivedAt: string;
  operatorId: EntityId | null;
  operatorName: string;
  moduleCode: string;
  moduleName: string;
  operationType: string;
  targetType: string;
  targetId: string;
  targetName: string;
  result: 'success' | 'failure';
  failureReason: string;
  requestMethod: string;
  requestPath: string;
  requestParams: string;
  responseParams: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  eventTime: string;
}

export interface SystemOperationLogArchiveQuery extends SystemOperationLogQuery {
  sourceLogId?: EntityId | null;
  archiveBatchNo?: string;
  archiveStartTime?: string;
  archiveEndTime?: string;
}

export interface SystemDictItemCreatePayload {
  itemValue: string;
  itemLabel: string;
  sortOrder: number;
  itemStatus: 'enabled' | 'disabled';
  remark: string;
}

export type SystemDictItemUpdatePayload = Omit<SystemDictItemCreatePayload, 'itemValue'>;

export interface SystemRolePermissionAssignPayload {
  permissionIds: EntityId[];
}

export interface SystemRolePermissionAuthorization {
  menus: SystemMenuManagementNode[];
  permissions: SystemPermission[];
  assignedPermissionIds: EntityId[];
}

export interface SystemRoleDeptScopeAssignPayload {
  deptIds: EntityId[];
}

export interface SystemRoleDeptScopeAuthorization {
  departments: SystemDept[];
  assignedDeptIds: EntityId[];
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
  leaderUserName: string | null;
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
