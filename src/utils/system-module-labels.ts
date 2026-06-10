export const SYSTEM_MODULE_LABELS: Record<string, string> = {
  system: '系统管理',
  system_auth: '登录鉴权',
  system_user: '用户管理',
  system_role: '角色管理',
  system_dept: '部门管理',
  system_menu: '菜单管理',
  system_permission: '权限管理',
  system_dict: '数据字典',
  system_log: '系统日志',
  ai: 'AI配置',
  ai_model: '模型配置',
  file: '文件管理',
  file_manager: '文件清单',
  knowledge: '知识库',
  knowledge_base: '知识库管理',
  knowledge_document: '文档管理',
  knowledge_chunk_strategy: '处理策略',
  knowledge_retrieval_config: '检索配置',
  knowledge_base_config: '知识库配置',
  knowledge_document_chunk: '文档分块',
  knowledge_document_processing_version: '处理版本',
  task: '任务中心',
  task_center: '任务工作台',
  knowledge_task: '任务操作日志',
  chat: '智能问答',
  chat_session: '聊天会话',
  chat_config: '聊天配置',
  chat_retention: '会话归档',
  chat_prompt_template: '提示词模板',
};

export const SYSTEM_MODULE_PATHS: Record<string, string> = {
  system: '系统管理',
  system_auth: '系统管理 / 登录鉴权',
  system_user: '系统管理 / 用户管理',
  system_role: '系统管理 / 角色管理',
  system_dept: '系统管理 / 部门管理',
  system_menu: '系统管理 / 菜单管理',
  system_permission: '系统管理 / 权限管理',
  system_dict: '系统管理 / 数据字典',
  system_log: '系统管理 / 系统日志',
  ai: 'AI配置',
  ai_model: 'AI配置 / 模型配置',
  file: '文件管理',
  file_manager: '文件管理 / 文件清单',
  knowledge: '知识库',
  knowledge_base: '知识库 / 知识库管理',
  knowledge_document: '知识库 / 文档管理',
  knowledge_chunk_strategy: '知识库 / 处理策略',
  knowledge_retrieval_config: '知识库 / 检索配置',
  knowledge_base_config: '知识库 / 知识库配置',
  knowledge_document_chunk: '知识库 / 文档分块',
  knowledge_document_processing_version: '知识库 / 处理版本',
  task: '任务中心',
  task_center: '任务中心 / 任务工作台',
  knowledge_task: '任务中心 / 任务操作日志',
  chat: '智能问答',
  chat_session: '智能问答 / 聊天会话',
  chat_config: '智能问答 / 聊天配置',
  chat_retention: '智能问答 / 会话归档',
  chat_prompt_template: '智能问答 / 提示词模板',
};

// 这里只列权限维护页的预置接口模块；历史日志模块仍可通过历史权限记录兜底展示。
export const KNOWN_SYSTEM_MODULE_CODES = [
  'system',
  'system_auth',
  'system_user',
  'system_role',
  'system_dept',
  'system_menu',
  'system_permission',
  'system_dict',
  'system_log',
  'ai',
  'ai_model',
  'file',
  'file_manager',
  'knowledge',
  'knowledge_base',
  'knowledge_document',
  'knowledge_chunk_strategy',
  'knowledge_retrieval_config',
  'knowledge_base_config',
  'knowledge_document_chunk',
  'knowledge_document_processing_version',
  'task',
  'task_center',
  'chat',
  'chat_session',
  'chat_config',
  'chat_retention',
  'chat_prompt_template',
];

const SYSTEM_AUTHORIZATION_MODULE_CODES = [
  'system_auth',
  'system_user',
  'system_role',
  'system_dept',
  'system_menu',
  'system_permission',
  'system_dict',
  'system_log',
];

const AI_AUTHORIZATION_MODULE_CODES = [
  'ai_model',
];

const FILE_AUTHORIZATION_MODULE_CODES = [
  'file_manager',
];

const KNOWLEDGE_AUTHORIZATION_MODULE_CODES = [
  'knowledge_base',
  'knowledge_document',
  'knowledge_chunk_strategy',
  'knowledge_retrieval_config',
  'knowledge_base_config',
  'knowledge_document_chunk',
  'knowledge_document_processing_version',
];

const TASK_AUTHORIZATION_MODULE_CODES = [
  'task_center',
];

const CHAT_AUTHORIZATION_MODULE_CODES = [
  'chat_session',
  'chat_config',
  'chat_retention',
  'chat_prompt_template',
];

const AUTHORIZATION_CHILD_MODULE_CODES: Record<string, string[]> = {
  system: SYSTEM_AUTHORIZATION_MODULE_CODES,
  ai: AI_AUTHORIZATION_MODULE_CODES,
  file: FILE_AUTHORIZATION_MODULE_CODES,
  knowledge: KNOWLEDGE_AUTHORIZATION_MODULE_CODES,
  task: TASK_AUTHORIZATION_MODULE_CODES,
  chat: CHAT_AUTHORIZATION_MODULE_CODES,
};

// 模块编码是后端鉴权边界，前端只负责把稳定编码翻译成中文展示。
export function systemModuleNameText(moduleCode: string | null | undefined): string {
  const normalizedModuleCode = moduleCode?.trim() ?? '';
  if (!normalizedModuleCode) {
    return '未分组';
  }
  return SYSTEM_MODULE_LABELS[normalizedModuleCode] ?? normalizedModuleCode;
}

// 权限维护页需要展示层级语义，避免知识库子模块只显示技术编码。
export function systemModulePathText(moduleCode: string | null | undefined): string {
  const normalizedModuleCode = moduleCode?.trim() ?? '';
  if (!normalizedModuleCode) {
    return '未分组';
  }
  return SYSTEM_MODULE_PATHS[normalizedModuleCode] ?? systemModuleNameText(normalizedModuleCode);
}

// 角色授权树按业务菜单收敛，业务子模块挂回对应根菜单，避免与菜单平级散落。
export function systemModuleAuthorizationRootCode(moduleCode: string | null | undefined): string {
  const normalizedModuleCode = moduleCode?.trim() ?? '';
  return Object.entries(AUTHORIZATION_CHILD_MODULE_CODES)
    .find(([, childCodes]) => childCodes.includes(normalizedModuleCode))?.[0] ?? normalizedModuleCode;
}

// 权限管理筛选复用角色授权树的业务归并规则，根模块可展开查询所有子模块。
export function systemModuleAuthorizationChildCodes(moduleCode: string | null | undefined): string[] {
  const normalizedModuleCode = moduleCode?.trim() ?? '';
  return AUTHORIZATION_CHILD_MODULE_CODES[normalizedModuleCode] ?? [];
}
