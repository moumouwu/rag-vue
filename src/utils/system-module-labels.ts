export const SYSTEM_MODULE_LABELS: Record<string, string> = {
  system_auth: '登录鉴权',
  system_user: '用户管理',
  system_role: '角色管理',
  system_dept: '部门管理',
  system_menu: '菜单管理',
  system_permission: '权限管理',
  system_dict: '数据字典',
  system_log: '系统日志',
  ai_model: '模型配置',
  file: '文件管理',
  file_manager: '文件管理',
  knowledge: '知识库',
  knowledge_base: '知识库管理',
  knowledge_document: '文档管理',
  knowledge_chunk_strategy: '处理策略',
  knowledge_retrieval_config: '检索配置',
  knowledge_base_config: '知识库配置',
  knowledge_document_chunk: '文档分块',
  knowledge_document_processing_version: '处理版本',
  knowledge_task: '任务中心',
  task_center: '任务中心',
  chat: '智能问答',
};

export const SYSTEM_MODULE_PATHS: Record<string, string> = {
  system_auth: '系统管理 / 登录鉴权',
  system_user: '系统管理 / 用户管理',
  system_role: '系统管理 / 角色管理',
  system_dept: '系统管理 / 部门管理',
  system_menu: '系统管理 / 菜单管理',
  system_permission: '系统管理 / 权限管理',
  system_dict: '系统管理 / 数据字典',
  system_log: '系统管理 / 系统日志',
  ai_model: 'AI 模型 / 模型配置',
  file: '文件管理',
  file_manager: '文件管理',
  knowledge: '知识库',
  knowledge_base: '知识库 / 知识库管理',
  knowledge_document: '知识库 / 文档管理',
  knowledge_chunk_strategy: '知识库 / 处理策略',
  knowledge_retrieval_config: '知识库 / 检索配置',
  knowledge_base_config: '知识库 / 知识库配置',
  knowledge_document_chunk: '知识库 / 文档分块',
  knowledge_document_processing_version: '知识库 / 处理版本',
  knowledge_task: '任务中心',
  task_center: '任务中心',
  chat: '智能问答',
};

export const KNOWN_SYSTEM_MODULE_CODES = Object.keys(SYSTEM_MODULE_LABELS);

const KNOWLEDGE_AUTHORIZATION_MODULE_CODES = new Set([
  'knowledge_base',
  'knowledge_document',
  'knowledge_chunk_strategy',
  'knowledge_retrieval_config',
  'knowledge_base_config',
  'knowledge_document_chunk',
  'knowledge_document_processing_version',
]);

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

// 角色授权树按业务菜单收敛，知识库子模块都挂在“知识库”下面，不再与菜单平级散落。
export function systemModuleAuthorizationRootCode(moduleCode: string | null | undefined): string {
  const normalizedModuleCode = moduleCode?.trim() ?? '';
  if (KNOWLEDGE_AUTHORIZATION_MODULE_CODES.has(normalizedModuleCode)) {
    return 'knowledge';
  }
  return normalizedModuleCode;
}
