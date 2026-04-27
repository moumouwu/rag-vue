export interface SystemMenuNode {
  menuId: number;
  menuCode: string;
  parentId: number;
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
