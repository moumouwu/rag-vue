import type { SystemMenuNode } from '@/types';
import { apiRequest } from '../request';

export const systemApi = {
  getCurrentUserMenus(): Promise<SystemMenuNode[]> {
    return apiRequest.get<SystemMenuNode[]>('/api/v1/system/menus/current');
  },
};
