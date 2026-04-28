import type {
  SystemMenuCreatePayload,
  SystemMenuManagementNode,
  SystemMenuNode,
  SystemMenuUpdatePayload,
  SystemRole,
  SystemRoleCreatePayload,
  SystemRoleMenuAssignPayload,
  SystemRoleUpdatePayload,
  EntityId,
} from '@/types';
import { apiRequest } from '../request';

export const systemApi = {
  getCurrentUserMenus(): Promise<SystemMenuNode[]> {
    return apiRequest.get<SystemMenuNode[]>('/api/v1/system/menus/current');
  },

  listRoles(): Promise<SystemRole[]> {
    return apiRequest.get<SystemRole[]>('/api/v1/system/roles');
  },

  createRole(payload: SystemRoleCreatePayload): Promise<SystemRole> {
    return apiRequest.post<SystemRole, SystemRoleCreatePayload>('/api/v1/system/roles', payload);
  },

  updateRole(roleId: EntityId, payload: SystemRoleUpdatePayload): Promise<SystemRole> {
    return apiRequest.put<SystemRole, SystemRoleUpdatePayload>(`/api/v1/system/roles/${roleId}`, payload);
  },

  deleteRole(roleId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/system/roles/${roleId}`);
  },

  listRoleMenuIds(roleId: EntityId): Promise<EntityId[]> {
    return apiRequest.get<EntityId[]>(`/api/v1/system/roles/${roleId}/menu-ids`);
  },

  saveRoleMenus(roleId: EntityId, payload: SystemRoleMenuAssignPayload): Promise<void> {
    return apiRequest.put<void, SystemRoleMenuAssignPayload>(`/api/v1/system/roles/${roleId}/menus`, payload);
  },

  listMenuTree(): Promise<SystemMenuManagementNode[]> {
    return apiRequest.get<SystemMenuManagementNode[]>('/api/v1/system/menus/tree');
  },

  createMenu(payload: SystemMenuCreatePayload): Promise<SystemMenuManagementNode> {
    return apiRequest.post<SystemMenuManagementNode, SystemMenuCreatePayload>('/api/v1/system/menus', payload);
  },

  updateMenu(menuId: EntityId, payload: SystemMenuUpdatePayload): Promise<SystemMenuManagementNode> {
    return apiRequest.put<SystemMenuManagementNode, SystemMenuUpdatePayload>(`/api/v1/system/menus/${menuId}`, payload);
  },

  deleteMenu(menuId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/system/menus/${menuId}`);
  },
};
