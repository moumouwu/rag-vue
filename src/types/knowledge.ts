import type { AiModelType } from './ai';
import type { PageRequest } from './common';
import type { EntityId, SystemDept, SystemRole, SystemUser } from './system';

export type KnowledgeBaseStatus = 'enabled' | 'disabled';
export type KnowledgeDocumentPermissionStrategy = 'inherit_knowledge_base' | 'custom' | 'public' | 'creator_only';
export type KnowledgeDocumentSourceType = 'text_input' | 'uploaded_file' | 'external_link';
export type KnowledgeDocumentBusinessStatus = 'draft' | 'published' | 'offline' | 'archived';
export type KnowledgeDocumentProcessingStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';

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
  displayEnabled: boolean;
  displayOrder: number;
  languageModelId: EntityId | null;
  languageModelName: string | null;
  vectorModelId: EntityId | null;
  vectorModelName: string | null;
  rerankModelId: EntityId | null;
  rerankModelName: string | null;
  displaySummary: string;
  documentCount: number;
  visibleDocumentCount: number;
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
  ownerUserId?: EntityId | '';
  baseStatus?: KnowledgeBaseStatus | '';
  displayEnabled?: boolean | '';
}

export interface KnowledgeBaseCreatePayload {
  baseCode: string;
  baseName: string;
  description: string;
  ownerDeptId: EntityId | null;
  ownerUserId?: EntityId | null;
  baseStatus: KnowledgeBaseStatus;
  displayEnabled: boolean;
  displayOrder: number;
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

export interface KnowledgeDocumentPermissionAuthorization {
  documentId: EntityId;
  title: string;
  permissionStrategy: KnowledgeDocumentPermissionStrategy;
  departments: SystemDept[];
  roles: SystemRole[];
  users: SystemUser[];
  assignedDeptIds: EntityId[];
  assignedRoleIds: EntityId[];
  assignedUserIds: EntityId[];
}

export interface KnowledgeDocumentPermissionAssignPayload {
  permissionStrategy: KnowledgeDocumentPermissionStrategy;
  deptIds: EntityId[];
  roleIds: EntityId[];
  userIds: EntityId[];
}

export interface KnowledgeDocument {
  documentId: EntityId;
  knowledgeBaseId: EntityId;
  knowledgeBaseName: string | null;
  documentCode: string;
  title: string;
  summary: string;
  contentText: string | null;
  sourceType: KnowledgeDocumentSourceType;
  sourceTypeName?: string;
  sourceFileId: EntityId | null;
  sourceFileName: string | null;
  externalUrl: string;
  categoryName: string;
  tags: string[];
  ownerDeptId: EntityId | null;
  ownerDeptName: string | null;
  permissionStrategy: KnowledgeDocumentPermissionStrategy;
  permissionStrategyName?: string;
  businessStatus: KnowledgeDocumentBusinessStatus;
  businessStatusName?: string;
  processingStatus: KnowledgeDocumentProcessingStatus;
  processingStatusName?: string;
  businessVersion: number;
  latestProcessingVersion: number;
  activeProcessingVersion: number;
  chunkStrategyType: string;
  chunkConfigJson: string | null;
  publishedAt: string | null;
  offlineAt: string | null;
  remark: string;
  createdBy: EntityId | null;
  createdByName: string | null;
  createdAt: string | null;
  updatedBy: EntityId | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface KnowledgeDocumentQuery extends Partial<PageRequest> {
  knowledgeBaseId?: EntityId | '';
  keyword?: string;
  sourceType?: KnowledgeDocumentSourceType | '';
  businessStatus?: KnowledgeDocumentBusinessStatus | '';
  processingStatus?: KnowledgeDocumentProcessingStatus | '';
  ownerDeptId?: EntityId | '';
}

export interface KnowledgeDocumentCreatePayload {
  knowledgeBaseId: EntityId;
  documentCode: string;
  title: string;
  summary: string;
  contentText?: string | null;
  sourceType: KnowledgeDocumentSourceType;
  sourceFileId?: EntityId | null;
  externalUrl?: string;
  categoryName: string;
  tags: string[];
  ownerDeptId?: EntityId | null;
  businessStatus?: KnowledgeDocumentBusinessStatus;
  remark: string;
}

export type KnowledgeDocumentUpdatePayload = Omit<KnowledgeDocumentCreatePayload, 'knowledgeBaseId' | 'documentCode' | 'businessStatus'>;

export interface KnowledgeDocumentBusinessStatusUpdatePayload {
  businessStatus: KnowledgeDocumentBusinessStatus;
}
