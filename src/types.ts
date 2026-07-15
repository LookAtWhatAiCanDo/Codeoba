export interface ImageReference {
  id: string;
  path?: string;
  base64?: string;
  mediaType?: string;
}

export interface Turn {
  turnId: string;
  userMessage: string;
  assistantMessage: string;
  timestamp: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  extraData?: Record<string, string> | null;
  images?: ImageReference[];
}

export interface Session {
  id: string;
  sourceId: string;
  filePath: string;
  timestamp: number;
  updatedAt: number;
  cwd?: string | null;
  threadName?: string | null;
  turns: Turn[];
  isArchived: boolean;
  isPinned: boolean;
  workspaceName?: string | null;
  status?: string | null;
  snippet?: string | null;
  summary?: string | null;
  isDeleted?: boolean;
}

export interface SearchResult {
  session: Session;
  matchedTurnIndexes: number[];
  score: number;
}

export interface SourceMetadata {
  id: string;
  displayName: string;
  isAvailable: boolean;
  isAppInstalled: boolean;
  productUrl?: string;
}

export enum ArchivalFilter {
  All = "all",
  Active = "active",
  Archived = "archived",
  Deleted = "deleted",
  ReadAloud = "read-aloud",
}

export enum DashboardTab {
  Global = "global",
  Groups = "groups",
  ReadAloud = "read-aloud",
}
