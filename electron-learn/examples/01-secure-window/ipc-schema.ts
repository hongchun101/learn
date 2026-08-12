// examples/01-secure-window/ipc-schema.ts
// 在主进程对 IPC 入参做 zod schema 校验的样例
import { ipcMain } from 'electron';
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const noteSchema = z.object({
  title: z.string().min(1).max(256),
  content: z.string().max(64 * 1024),
  folder: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(64)).max(32).optional(),
});

const noteUpdateSchema = z.object({
  id: uuidSchema,
  patch: noteSchema.partial(),
});

const handlers = {
  'notes:list': z.object({ q: z.string().max(256).optional() }),
  'notes:create': noteSchema,
  'notes:update': noteUpdateSchema,
  'notes:remove': z.object({ id: uuidSchema }),
  'user:update': z.object({
    name: z.string().min(1).max(64).optional(),
    bio: z.string().max(1024).optional(),
  }),
};

// 内存中的 mock
const notes: any[] = [];
const user = { id: 'u1', name: 'guest' };

function handle<T extends keyof typeof handlers>(ch: T, fn: (req: any, senderFrame: any) => Promise<any>) {
  ipcMain.handle(ch, async (event, raw) => {
    const parse = handlers[ch].safeParse(raw);
    if (!parse.success) {
      throw new Error(`bad request: ${parse.error.message}`);
    }
    return fn(parse.data, event.senderFrame);
  });
}

handle('notes:list', async ({ q }) =>
  notes.filter(n => !q || n.title.includes(q) || n.content.includes(q)).map(({ content, ...m }) => m)
);

handle('notes:create', async (req) => {
  const id = crypto.randomUUID();
  const note = { id, ...req, createdAt: Date.now(), updatedAt: Date.now() };
  notes.push(note);
  return id;
});

handle('notes:update', async ({ id, patch }) => {
  const idx = notes.findIndex(n => n.id === id);
  if (idx < 0) throw new Error('not found');
  notes[idx] = { ...notes[idx], ...patch, updatedAt: Date.now() };
  return id;
});

handle('notes:remove', async ({ id }) => {
  const idx = notes.findIndex(n => n.id === id);
  if (idx < 0) return false;
  notes.splice(idx, 1);
  return true;
});
