import type { EntityId } from './system';

export interface CurrentUserInfo {
  userId: EntityId;
  username: string;
  displayName: string;
  departmentId: EntityId | null;
  roleCodes: string[];
  superAdmin: boolean;
}

export interface LoginCommand {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expireTime: string;
  userInfo: CurrentUserInfo;
}
