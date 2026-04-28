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
