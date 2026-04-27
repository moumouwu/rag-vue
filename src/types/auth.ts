export interface CurrentUserInfo {
  userId: number;
  username: string;
  displayName: string;
  departmentId: number | null;
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
