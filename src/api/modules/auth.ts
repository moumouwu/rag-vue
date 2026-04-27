import type { CurrentUserInfo, LoginCommand, LoginResult } from '@/types';
import { apiRequest } from '../request';

export const authApi = {
  login(command: LoginCommand): Promise<LoginResult> {
    return apiRequest.post<LoginResult, LoginCommand>('/api/v1/auth/login', command, {
      // 登录接口不应携带历史令牌，避免过期 token 干扰重新登录。
      skipAuth: true,
    });
  },

  logout(): Promise<void> {
    return apiRequest.post<void>('/api/v1/auth/logout');
  },

  getCurrentUser(): Promise<CurrentUserInfo> {
    return apiRequest.get<CurrentUserInfo>('/api/v1/auth/me');
  },
};
