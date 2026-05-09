import { addCollection } from '@iconify/vue';
import lucideIcons from '@iconify-json/lucide/icons.json';

export interface MenuIconOption {
  value: string;
  label: string;
  categoryKey: MenuIconCategoryKey;
  categoryLabel: string;
  common: boolean;
}

export type MenuIconCategoryKey =
  | 'all'
  | 'common'
  | 'navigation'
  | 'people'
  | 'security'
  | 'data'
  | 'files'
  | 'communication'
  | 'business'
  | 'status'
  | 'system'
  | 'other';

export interface MenuIconCategory {
  key: MenuIconCategoryKey;
  label: string;
}

interface IconifyCollection {
  prefix: string;
  icons: Record<string, unknown>;
}

const lucideCollection = lucideIcons as IconifyCollection;
const lucideIconNames = new Set(Object.keys(lucideCollection.icons));

addCollection(lucideIcons as Parameters<typeof addCollection>[0]);

export const MENU_ICON_PREFIX = lucideCollection.prefix;

export const MENU_ICON_CATEGORIES: MenuIconCategory[] = [
  { key: 'common', label: '常用' },
  { key: 'navigation', label: '导航' },
  { key: 'people', label: '用户' },
  { key: 'security', label: '权限' },
  { key: 'data', label: '数据' },
  { key: 'files', label: '文件' },
  { key: 'communication', label: '消息' },
  { key: 'business', label: '业务' },
  { key: 'status', label: '状态' },
  { key: 'system', label: '系统' },
  { key: 'other', label: '其他' },
  { key: 'all', label: '全部' },
];

const CATEGORY_LABELS = MENU_ICON_CATEGORIES.reduce<Record<MenuIconCategoryKey, string>>((labels, category) => {
  labels[category.key] = category.label;
  return labels;
}, {} as Record<MenuIconCategoryKey, string>);

const COMMON_ICON_NAMES = new Set([
  'activity',
  'bell',
  'book-open',
  'bot',
  'briefcase',
  'building-2',
  'calendar',
  'chart-column',
  'circle-help',
  'clipboard-list',
  'database',
  'file',
  'folder',
  'home',
  'key-round',
  'layout-dashboard',
  'library',
  'list-checks',
  'lock-keyhole',
  'mail',
  'menu',
  'message-circle',
  'panel-left',
  'panel-top',
  'search',
  'settings',
  'shield',
  'table',
  'user',
  'users',
]);

const CATEGORY_KEYWORDS: Array<{ key: Exclude<MenuIconCategoryKey, 'all' | 'common'>; keywords: string[] }> = [
  {
    key: 'people',
    keywords: ['user', 'users', 'contact', 'badge', 'id-card', 'person'],
  },
  {
    key: 'security',
    keywords: ['lock', 'key', 'shield', 'fingerprint', 'scan', 'verified', 'badge-check'],
  },
  {
    key: 'data',
    keywords: ['database', 'table', 'chart', 'list', 'logs', 'server', 'rows', 'columns', 'hard-drive'],
  },
  {
    key: 'files',
    keywords: ['file', 'folder', 'archive', 'book', 'library', 'notebook', 'clipboard', 'sheet'],
  },
  {
    key: 'communication',
    keywords: ['message', 'mail', 'phone', 'bell', 'send', 'inbox', 'at-sign', 'rss'],
  },
  {
    key: 'navigation',
    keywords: ['home', 'menu', 'panel', 'layout', 'sidebar', 'route', 'map', 'waypoint', 'compass', 'navigation', 'arrow', 'chevron', 'corner', 'move', 'locate'],
  },
  {
    key: 'system',
    keywords: ['settings', 'cog', 'wrench', 'cpu', 'bot', 'monitor', 'terminal', 'code', 'command', 'bug', 'plug'],
  },
  {
    key: 'business',
    keywords: ['briefcase', 'building', 'calendar', 'clock', 'wallet', 'credit-card', 'shopping', 'package', 'truck', 'landmark'],
  },
  {
    key: 'status',
    keywords: ['check', 'x', 'plus', 'minus', 'alert', 'info', 'circle', 'loader', 'refresh', 'undo', 'redo'],
  },
];

function resolveIconCategory(iconName: string): Exclude<MenuIconCategoryKey, 'all' | 'common'> {
  return CATEGORY_KEYWORDS.find((category) =>
    category.keywords.some((keyword) => iconName === keyword || iconName.includes(keyword)),
  )?.key ?? 'other';
}

// 图标选项直接来自 Iconify 的 lucide 本地图标集，避免继续手写少量映射。
export const MENU_ICON_OPTIONS: MenuIconOption[] = Object.keys(lucideCollection.icons)
  .sort((left, right) => left.localeCompare(right))
  .map((iconName) => {
    const categoryKey = resolveIconCategory(iconName);
    return {
      value: `${MENU_ICON_PREFIX}:${iconName}`,
      label: iconName,
      categoryKey,
      categoryLabel: CATEGORY_LABELS[categoryKey],
      common: COMMON_ICON_NAMES.has(iconName),
    };
  });

export function resolveMenuIconName(value: string | null | undefined): string {
  const normalizedIcon = value?.trim().toLowerCase() ?? '';
  if (!normalizedIcon) {
    return '';
  }
  if (normalizedIcon.includes(':')) {
    const [prefix, iconName] = normalizedIcon.split(':', 2);
    return prefix === MENU_ICON_PREFIX && lucideIconNames.has(iconName) ? normalizedIcon : '';
  }
  /*
   * 历史数据保存的是无前缀 lucide 名称。
   * 展示和再次保存时统一解析成 Iconify 标准名称。
   */
  const lucideIconName = `${MENU_ICON_PREFIX}:${normalizedIcon}`;
  return lucideIconNames.has(normalizedIcon) ? lucideIconName : '';
}
