/**
 * The note thread on an item.
 *
 * Newest first, because the last thing that happened is the thing you need. One
 * line composer, because a note that takes a form to write does not get written.
 */

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Send } from 'lucide-react';

import { SectionLabel, Skeleton } from '@/components/cc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAddPipelineNote, usePipelineNotes } from '@/hooks/usePipeline';
import { initialsOf } from './PipelineCard';

export function NoteThread({ itemId }: { itemId: string }) {
  const { data: notes = [], isLoading } = usePipelineNotes(itemId);
  const addNote = useAddPipelineNote();
  const [body, setBody] = useState('');

  const submit = () => {
    const text = body.trim();
    if (!text || addNote.isPending) return;
    addNote.mutate({ itemId, body: text }, { onSuccess: () => setBody('') });
  };

  return (
    <section className="space-y-3">
      <SectionLabel>Notes</SectionLabel>

      <div className="flex items-center gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="What happened on the call"
          aria-label="Write a note"
          className="h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary placeholder:text-cc-text-muted"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!body.trim() || addNote.isPending}
          onClick={submit}
          className="h-9 shrink-0 gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {addNote.isPending ? 'Saving' : 'Add'}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-cc-md" />
          <Skeleton className="h-14 w-full rounded-cc-md" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-cc-text-muted">
          No notes yet. The first one tells the next person where this stands.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => {
            const written = new Date(note.created_at);
            const author = note.author_name || 'Unknown';
            return (
              <li
                key={note.id}
                className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-pill bg-cc-surface-overlay text-[10px] font-semibold text-cc-text-secondary">
                    {initialsOf(author)}
                  </span>
                  <span className="text-sm font-medium text-cc-text-primary">{author}</span>
                  <span className="cc-num ml-auto text-xs text-cc-text-muted">
                    {formatDistanceToNow(written, { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-cc-text-secondary">
                  {note.body}
                </p>
                <p className="cc-num mt-1 text-xs text-cc-text-faint">
                  {format(written, 'MMM d, yyyy h:mm a')}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
