// packages/core/src/services.ts
// 给 main 进程注入的 service 层
import { NoteRepository } from './db/repositories';
import { validateNote } from './domain/note';
import type { UUID } from './domain/types';

export class NoteService {
  constructor(private repo: NoteRepository) {}

  list(q?: string, limit = 50, offset = 0) {
    return this.repo.list(q, limit, offset);
  }
  get(id: UUID) {
    return this.repo.get(id);
  }
  create(input: Parameters<NoteRepository['create']>[0]) {
    validateNote(input);
    return this.repo.create(input);
  }
  update(id: UUID, patch: Parameters<NoteRepository['update']>[1]) {
    return this.repo.update(id, patch);
  }
  delete(id: UUID) {
    return this.repo.delete(id);
  }
}
