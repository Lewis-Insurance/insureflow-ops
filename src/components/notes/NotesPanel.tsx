import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Pencil, Trash2, Check, X, Loader2, StickyNote } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useAccountNotes,
  useAddAccountNote,
  useUpdateAccountNote,
  useDeleteAccountNote,
  type AccountNote,
} from '@/hooks/useAccountNotes';

interface NotesPanelProps {
  /** The account (customer) the notes belong to. Required. */
  accountId: string;
  /** When set, notes added here are tagged with this policy for context. */
  policyId?: string;
  /** When set, notes added here are tagged with this STANDARD renewal for context. */
  renewalId?: string;
  title?: string;
  /** Notified after any add / edit / delete so a parent can refresh (e.g. a hero card). */
  onChange?: () => void;
  className?: string;
}

/**
 * The single Notes surface for the app - customer, policy, and standard-renewal pages all use
 * this. It shows the customer's full note stream (no limit) and lets staff add / edit / delete
 * inline. A note added from a policy or renewal still belongs to the customer, so it shows
 * everywhere for that customer.
 */
export function NotesPanel({
  accountId,
  policyId,
  renewalId,
  title = 'Notes',
  onChange,
  className,
}: NotesPanelProps) {
  const { toast } = useToast();
  const { data: notes = [], isLoading, isError, refetch } = useAccountNotes(accountId);
  const addNote = useAddAccountNote(accountId);
  const updateNote = useUpdateAccountNote(accountId);
  const deleteNote = useDeleteAccountNote(accountId);

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const onError = (err: unknown, fallback: string) =>
    toast({
      title: 'Something went wrong',
      description: err instanceof Error ? err.message : fallback,
      variant: 'destructive',
    });

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    addNote.mutate(
      { note_text: text, policyId, renewalId },
      {
        onSuccess: () => {
          setDraft('');
          onChange?.();
        },
        onError: (e) => onError(e, 'Could not add the note.'),
      },
    );
  };

  const startEdit = (note: AccountNote) => {
    setConfirmId(null);
    setEditingId(note.id);
    setEditText(note.note_text);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) return;
    updateNote.mutate(
      { id: editingId, note_text: text },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditText('');
          onChange?.();
        },
        onError: (e) => onError(e, 'Could not save the note.'),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteNote.mutate(id, {
      onSuccess: () => {
        setConfirmId(null);
        onChange?.();
      },
      onError: (e) => onError(e, 'Could not delete the note.'),
    });
  };

  return (
    <div
      className={`rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card ${className ?? ''}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-cc-text-muted" />
        <span className="text-xs font-semibold uppercase tracking-wide text-cc-text-muted">
          {title}
        </span>
        {notes.length > 0 && (
          <span className="cc-num text-xs text-cc-text-muted">({notes.length})</span>
        )}
      </div>

      {/* Composer - always available, no friction */}
      <div className="mb-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleAdd();
          }}
          placeholder="Add a note..."
          className="min-h-[72px] resize-y"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-cc-text-muted">
            {draft.trim() ? 'Cmd/Ctrl + Enter to save' : ''}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleAdd}
            disabled={!draft.trim() || addNote.isPending}
          >
            {addNote.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving
              </>
            ) : (
              'Add note'
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-cc-md bg-cc-surface-overlay" />
          ))}
        </div>
      ) : isError ? (
        // Notes are the E&O trail: a failed fetch must never masquerade as an
        // empty record.
        <div className="py-6 text-center">
          <p className="text-sm text-destructive">Notes could not be loaded.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : notes.length === 0 ? (
        <p className="py-6 text-center text-sm text-cc-text-muted">
          No notes yet. Capture what matters - it will show here and everywhere this customer
          appears.
        </p>
      ) : (
        <ul className="divide-y divide-cc-border-subtle">
          {notes.map((note) => (
            <li key={note.id} className="group py-3 first:pt-0 last:pb-0">
              {editingId === note.id ? (
                <div>
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="min-h-[72px] resize-y"
                    autoFocus
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSaveEdit}
                      disabled={!editText.trim() || updateNote.isPending}
                    >
                      {updateNote.isPending ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-cc-text-primary">
                      {note.note_text}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cc-text-muted">
                      <span>{note.author_name}</span>
                      <span aria-hidden>·</span>
                      <span className="cc-num" title={format(new Date(note.created_at), 'PPpp')}>
                        {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                      </span>
                      {note.context_label && (
                        <span className="rounded-full border border-cc-border-subtle px-2 py-0.5 text-cc-text-secondary">
                          {note.context_label}
                        </span>
                      )}
                    </div>

                    {confirmId === note.id && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-cc-text-secondary">Delete this note?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2"
                          onClick={() => handleDelete(note.id)}
                          disabled={deleteNote.isPending}
                        >
                          {deleteNote.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Delete'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label="Edit note"
                      onClick={() => startEdit(note)}
                      className="rounded-cc-sm p-1.5 text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete note"
                      onClick={() => setConfirmId((cur) => (cur === note.id ? null : note.id))}
                      className="rounded-cc-sm p-1.5 text-cc-text-muted hover:bg-cc-surface-overlay hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotesPanel;
