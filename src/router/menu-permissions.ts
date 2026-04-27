import type { SystemMenuNode } from '@/types';

export type AuthorizedMenuNode = Readonly<Omit<SystemMenuNode, 'children'>> & {
  readonly children?: readonly AuthorizedMenuNode[];
};

export function normalizeRoutePath(routePath: string | undefined | null): string {
  const value = routePath?.trim() ?? '';
  if (!value) {
    return '';
  }

  const path = value.startsWith('/') ? value : `/${value}`;
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

export function flattenMenuTree(menus: readonly AuthorizedMenuNode[]): AuthorizedMenuNode[] {
  return menus.flatMap((menu) => [menu, ...flattenMenuTree(menu.children ?? [])]);
}

export function findFirstAuthorizedMenuPath(menus: readonly AuthorizedMenuNode[]): string | null {
  const flatMenus = flattenMenuTree(menus);
  const firstMenu = flatMenus.find((menu) => menu.menuType === 'menu' && normalizeRoutePath(menu.routePath));
  const firstRoute = firstMenu ?? flatMenus.find((menu) => normalizeRoutePath(menu.routePath));
  return firstRoute ? normalizeRoutePath(firstRoute.routePath) : null;
}

export function findAuthorizedMenuByPath(
  routePath: string,
  menus: readonly AuthorizedMenuNode[],
): AuthorizedMenuNode | null {
  const normalizedPath = normalizeRoutePath(routePath);
  if (!normalizedPath) {
    return null;
  }
  return flattenMenuTree(menus).find((menu) => normalizeRoutePath(menu.routePath) === normalizedPath) ?? null;
}

export function isAuthorizedMenuRoute(
  routePath: string,
  menuCode: string | undefined,
  menus: readonly AuthorizedMenuNode[],
): boolean {
  const normalizedPath = normalizeRoutePath(routePath);
  const flatMenus = flattenMenuTree(menus);

  // 后端菜单是权限来源，前端只做展示和直达路由的兜底拦截。
  return flatMenus.some((menu) => {
    const codeMatched = menuCode ? menu.menuCode === menuCode : false;
    const pathMatched = normalizedPath ? normalizeRoutePath(menu.routePath) === normalizedPath : false;
    return codeMatched || pathMatched;
  });
}
