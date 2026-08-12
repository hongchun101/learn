// apps/desktop/src/renderer/App.tsx
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Header } from '@ui/components/Header';
import { Sidebar } from '@ui/components/Sidebar';
import { Editor } from '@ui/components/Editor';
import { useAppStore } from './store';

export default function App() {
  const qc = useQueryClient();
  const noteId = useAppStore((s) => s.currentNoteId);
  const setCurrentNoteId = useAppStore((s) => s.setCurrentNoteId);

  // 1. Notes list - type-safe ipc with query
  const notes = useQuery({
    queryKey: ['notes'],
    queryFn: () => window.api.invoke('notes.list', {}),
  });

  // 2. Single note
  const note = useQuery({
    queryKey: ['notes', noteId],
    queryFn: () => (noteId ? window.api.invoke('notes.get', { id: noteId }) : null),
    enabled: !!noteId,
  });

  useEffect(() => {
    return window.api.on('note:updated', (payload) => {
      void qc.invalidateQueries({ queryKey: ['notes'] });
    });
  }, [qc]);

  return (
    <div className="app">
      <Header />
      <aside className="aside">
        <Sidebar
          notes={notes.data ?? []}
          loading={notes.isLoading}
          currentId={noteId}
          onSelect={setCurrentNoteId}
        />
      </aside>
      <main className="main">
        {note.data ? <Editor note={note.data} /> : <div>Select or create a note</div>}
      </main>
    </div>
  );
}
