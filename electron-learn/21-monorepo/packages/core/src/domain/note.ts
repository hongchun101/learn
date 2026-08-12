// packages/core/src/domain/note.ts
import type { Entity, ISO8601, UUID } from './types';

export type NoteTag = string;

export interface Note extends Entity {
  readonly title: string;
  readonly content: string;
  readonly folder: UUID | null;
  readonly tags: readonly NoteTag[];
  readonly pinned: boolean;
}

export interface NoteCreateInput {
  readonly title: string;
  readonly content?: string;
  readonly folder?: UUID | null;
  readonly tags?: readonly NoteTag[];
}

export interface NoteUpdateInput {
  readonly id: UUID;
  readonly patch: Partial<NoteCreateInput & { pinned: boolean }>;
}

export interface NoteSearchQuery {
  readonly q?: string;
  readonly folder?: UUID;
  readonly tags?: readonly NoteTag[];
  readonly includeBody?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export function normalizeNote(raw: unknown): Note {
  // Zod schema lives in /db/schema. 这里仅做类型化
  const r = raw as Note;
  return {
    ...r,
    tags: Object.freeze([...r.tags]),
  };
}

export function isValidNoteTag(tag: string): boolean {
  return /^[\w-]{1,64}$/.test(tag);
}

export const MAX_TITLE_LENGTH = 256;
export const MAX_CONTENT_LENGTH = 1024 * 1024;

export function validateNote(input: NoteCreateInput) {
  if (input.title.length === 0 || input.title.length > MAX_TITLE_LENGTH) {
    throw new Error('title invalid');
  }
  if ((input.content?.length ?? 0) > MAX_CONTENT_LENGTH) {
    throw new Error('content too big');
  }
  if (input.tags?.some((t) => !isValidNoteTag(t))) {
    throw new Error('tag invalid');
  }
}
