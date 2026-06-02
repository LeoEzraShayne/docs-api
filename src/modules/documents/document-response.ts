import { DocumentType, Prisma } from '@prisma/client';
import { DOCUMENT_CONFIG } from './document-config';

type GrantView = { remainingGenerations: number; expiresAt: Date };
type VersionView = { id: string; versionNo: number; createdAt: Date };

export function emptyDocumentNode(type: DocumentType) {
  return {
    id: null,
    type,
    title: DOCUMENT_CONFIG[type].title,
    currentVersion: 0,
    grant: null,
    versions: [],
  };
}

export function toDocumentDto(document: {
  grants?: GrantView[];
  effectiveGrant?: GrantView | null;
  versions: VersionView[];
  id: string;
  type: DocumentType;
  title: string;
  currentVersion: number;
}) {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    currentVersion: document.currentVersion,
    grant: document.effectiveGrant ?? document.grants?.[0] ?? null,
    versions: document.versions,
  };
}

export function toVersionDto(
  document: {
    id: string;
    projectId?: string;
    type: DocumentType;
    title: string;
    grants?: GrantView[];
    effectiveGrant?: GrantView | null;
  },
  version: VersionView & { extractedJson: Prisma.JsonValue },
) {
  return {
    document: toDocumentDto({
      ...document,
      currentVersion: version.versionNo,
      versions: [version],
    }),
    id: version.id,
    versionNo: version.versionNo,
    createdAt: version.createdAt,
    tabs: version.extractedJson,
    downloadUrl: `/projects/${document.projectId}/documents/${document.type}/versions/${version.versionNo}/download`,
    grant: document.grants?.[0] ?? null,
  };
}
