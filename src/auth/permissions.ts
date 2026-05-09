import { computed } from 'vue';
import { useAuthSession } from './auth-session';

export function usePermission() {
  const { currentUser } = useAuthSession();
  const permissionCodeSet = computed(() => new Set(currentUser.value?.permissionCodes ?? []));

  function hasPermission(permissionCode: string): boolean {
    const normalizedPermissionCode = permissionCode.trim();
    const user = currentUser.value;
    if (!normalizedPermissionCode || !user) {
      return false;
    }
    // 前端按钮显隐只是减少误操作，接口访问仍以后端 RBAC 鉴权为准。
    return user.superAdmin || permissionCodeSet.value.has(normalizedPermissionCode);
  }

  function hasAnyPermission(permissionCodes: string[]): boolean {
    return permissionCodes.some((permissionCode) => hasPermission(permissionCode));
  }

  function hasAllPermissions(permissionCodes: string[]): boolean {
    return permissionCodes.every((permissionCode) => hasPermission(permissionCode));
  }

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
