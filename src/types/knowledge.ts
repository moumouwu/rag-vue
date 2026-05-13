import type { AiModelType } from './ai';
import type { PageRequest } from './common';
import type { EntityId } from './system';

export type KnowledgeBaseStatus = 'enabled' | 'disabled';

export interface KnowledgeBase {
  knowledgeBaseId: EntityId;
  baseCode: string;
  baseName: string;
  description: string;
  ownerDeptId: EntityId | null;
  ownerDeptName: string | null;
  ownerUserId: EntityId | null;
  ownerUserName: string | null;
  baseStatus: KnowledgeBaseStatus;
  languageModelId: EntityId | null;
  languageModelName: string | null;
  vectorModelId: EntityId | null;
  vectorModelName: string | null;
  rerankModelId: EntityId | null;
  rerankModelName: string | null;
  displaySummary: string;
  createdBy: EntityId | null;
  createdByName: string | null;
  createdAt: string | null;
  updatedBy: EntityId | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface KnowledgeBaseQuery extends Partial<PageRequest> {
  keyword?: string;
  ownerDeptId?: EntityId | '';
  baseStatus?: KnowledgeBaseStatus | '';
}

export interface KnowledgeBaseCreatePayload {
  baseCode: string;
  baseName: string;
  description: string;
  ownerDeptId: EntityId | null;
  ownerUserId?: EntityId | null;
  baseStatus: KnowledgeBaseStatus;
  languageModelId?: EntityId | null;
  vectorModelId?: EntityId | null;
  rerankModelId?: EntityId | null;
  displaySummary: string;
}

export type KnowledgeBaseUpdatePayload = Omit<KnowledgeBaseCreatePayload, 'baseCode'>;

export interface KnowledgeBaseStatusUpdatePayload {
  baseStatus: KnowledgeBaseStatus;
}

export interface KnowledgeBaseModelOption {
  modelId: EntityId;
  modelName: string;
  modelType: AiModelType;
  modelStatus: 'enabled' | 'disabled';
}
