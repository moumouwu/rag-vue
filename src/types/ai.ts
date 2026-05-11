import type { EntityId } from './system';
import type { PageRequest } from './common';

export type AiModelType =
  | 'language_model'
  | 'vector_model'
  | 'image_model'
  | 'retrieval_model'
  | 'rerank_model';

export type AiModelStatus = 'enabled' | 'disabled';

export interface AiModelConfig {
  modelId: EntityId;
  modelCode: string;
  modelName: string;
  modelType: AiModelType;
  providerCode: string;
  endpointUrl: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  timeoutMs: number;
  requestParams: Record<string, unknown>;
  sortOrder: number;
  defaultModel: boolean;
  modelStatus: AiModelStatus;
  remark: string;
  createdBy: EntityId | null;
  createdByName: string | null;
  createdAt: string | null;
  updatedBy: EntityId | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface AiModelConfigQuery extends Partial<PageRequest> {
  keyword?: string;
  modelType?: AiModelType | '';
  modelStatus?: AiModelStatus | '';
}

export interface AiModelConfigCreatePayload {
  modelCode: string;
  modelName: string;
  modelType: AiModelType;
  providerCode: string;
  endpointUrl: string;
  apiKey?: string;
  timeoutMs: number;
  requestParams: Record<string, unknown>;
  sortOrder: number;
  defaultModel: boolean;
  modelStatus: AiModelStatus;
  remark: string;
}

export interface AiModelConfigUpdatePayload extends Omit<AiModelConfigCreatePayload, 'modelCode'> {
  clearApiKey: boolean;
}

export interface AiModelStatusUpdatePayload {
  modelStatus: AiModelStatus;
}

export interface AiModelDefaultUpdatePayload {
  defaultModel: boolean;
}

export interface AiModelOrderItemPayload {
  modelId: EntityId;
  sortOrder: number;
}

export interface AiModelOrderUpdatePayload {
  modelType: AiModelType;
  orders: AiModelOrderItemPayload[];
}

export type AiModelTestMode = 'connection' | 'invocation';

export interface AiModelTestPayload {
  testMode: AiModelTestMode;
}

export interface AiModelReferenceWarning {
  referenceType: string;
  referenceId: string;
  referenceName: string;
  message: string;
}

export interface AiModelTestResult {
  testId: string;
  modelId: EntityId;
  modelCode: string;
  modelType: AiModelType;
  success: boolean;
  latencyMs: number;
  retryable: boolean;
  errorCode: string;
  message: string;
  testedAt: string;
  referenceWarnings: AiModelReferenceWarning[];
}
