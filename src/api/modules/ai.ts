import type {
  AiModelConfig,
  AiModelConfigCreatePayload,
  AiModelConfigQuery,
  AiModelConfigUpdatePayload,
  AiModelDefaultUpdatePayload,
  AiModelOrderUpdatePayload,
  AiModelReferenceWarning,
  AiModelStatusUpdatePayload,
  AiModelTestPayload,
  AiModelTestResult,
  EntityId,
  PageData,
} from '@/types';
import { buildQueryUrl } from '../query';
import { apiRequest } from '../request';

export const aiApi = {
  // 模型配置列表用于后台维护和后续路由排查，只返回脱敏后的凭据状态。
  listModels(query: AiModelConfigQuery = {}): Promise<PageData<AiModelConfig>> {
    return apiRequest.get<PageData<AiModelConfig>>(buildQueryUrl('/api/v1/ai/models', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      keyword: query.keyword,
      modelType: query.modelType,
      modelStatus: query.modelStatus,
    }));
  },

  // 模型详情用于查看授权回显和编辑表单，后端不会返回 API Key 明文。
  getModel(modelId: EntityId): Promise<AiModelConfig> {
    return apiRequest.get<AiModelConfig>(`/api/v1/ai/models/${modelId}`);
  },

  // 创建模型时允许提交一次明文 API Key，密钥加密和脱敏展示全部由后端处理。
  createModel(payload: AiModelConfigCreatePayload): Promise<AiModelConfig> {
    return apiRequest.post<AiModelConfig, AiModelConfigCreatePayload>('/api/v1/ai/models', payload);
  },

  // 编辑模型不允许改 modelCode；apiKey 为空表示保留原密钥，clearApiKey 才会显式清空。
  updateModel(modelId: EntityId, payload: AiModelConfigUpdatePayload): Promise<AiModelConfig> {
    return apiRequest.put<AiModelConfig, AiModelConfigUpdatePayload>(`/api/v1/ai/models/${modelId}`, payload);
  },

  // 批量保存排序只影响同类型 fallback 优先级，不改模型状态、密钥或服务地址。
  updateModelOrder(payload: AiModelOrderUpdatePayload): Promise<AiModelConfig[]> {
    return apiRequest.put<AiModelConfig[], AiModelOrderUpdatePayload>('/api/v1/ai/models/order', payload);
  },

  // 模型测试只提交测试模式，后端负责密钥解密、供应商调用和错误脱敏。
  testModel(modelId: EntityId, payload: AiModelTestPayload): Promise<AiModelTestResult> {
    return apiRequest.post<AiModelTestResult, AiModelTestPayload>(`/api/v1/ai/models/${modelId}/test`, payload);
  },

  // 停用或删除前查询引用风险，首期知识库未接入时可返回空列表。
  listModelReferenceWarnings(modelId: EntityId): Promise<AiModelReferenceWarning[]> {
    return apiRequest.get<AiModelReferenceWarning[]>(`/api/v1/ai/models/${modelId}/reference-warnings`);
  },

  // 启停状态走独立接口，避免局部动作误提交服务地址、密钥或扩展参数。
  updateModelStatus(modelId: EntityId, payload: AiModelStatusUpdatePayload): Promise<AiModelConfig> {
    return apiRequest.patch<AiModelConfig, AiModelStatusUpdatePayload>(
      `/api/v1/ai/models/${modelId}/status`,
      payload,
    );
  },

  // 默认模型维护只提交布尔标记，同类型唯一性由后端事务清理保证。
  updateModelDefault(modelId: EntityId, payload: AiModelDefaultUpdatePayload): Promise<AiModelConfig> {
    return apiRequest.patch<AiModelConfig, AiModelDefaultUpdatePayload>(
      `/api/v1/ai/models/${modelId}/default`,
      payload,
    );
  },

  // 删除模型配置走逻辑删除，历史执行记录仍可保留模型标识。
  deleteModel(modelId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/ai/models/${modelId}`);
  },
};
