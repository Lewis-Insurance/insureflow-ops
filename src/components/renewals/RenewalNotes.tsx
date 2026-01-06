import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Plus, MessageSquare, Edit2, Trash2, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useRenewalNotes,
  useAddRenewalNote,
  useUpdateRenewalNote,
  useDeleteRenewalNote,
  RenewalNote,
} from '@/hooks/useRenewalWorkflow';
import { useAuth } from '@/hooks/useAuth';

interface RenewalNotesProps {
  renewalId: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function RenewalNotes({ renewalId }: RenewalNotesProps) {
  const { user } = useAuth();
  const { data: notes, isLoading, error } = useRenewalNotes(renewalId);
  const addNote = useAddRenewalNote();
  const updateNote = useUpdateRenewalNote();
  const deleteNote = useDeleteRenewalNote();

  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RenewalNote | null>(null);

  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;

    addNote.mutate(
      { renewalId, content: newNoteContent.trim() },
      {
        onSuccess: () => {
          setNewNoteContent('');
          setIsAddingNote(false);
        },
      }
    );
  };

  const handleStartEdit = (note: RenewalNote) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = () => {
    if (!editingNoteId || !editContent.trim()) return;

    updateNote.mutate(
      { noteId: editingNoteId, content: editContent.trim(), renewalId },
      {
        onSuccess: () => {
          setEditingNoteId(null);
          setEditContent('');
        },
      }
    );
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditContent('');
  };

  const handleDelete = () => {
    if (!deleteTarget) return;

    deleteNote.mutate(
      { noteId: deleteTarget.id, renewalId },
      {
        onSuccess: () => setDeleteTarget(null),
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          <p>Failed to load notes</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Notes</CardTitle>
          {!isAddingNote && (
            <Button size="sm" onClick={() => setIsAddingNote(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Note Form */}
          {isAddingNote && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <Textarea
                placeholder="Type your note here..."
                rows={3}
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                className="mb-3"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAddingNote(false);
                    setNewNoteContent('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!newNoteContent.trim() || addNote.isPending}
                >
                  {addNote.isPending ? 'Saving...' : 'Save Note'}
                </Button>
              </div>
            </div>
          )}

          {/* Notes List */}
          {notes && notes.length > 0 ? (
            <div className="space-y-4">
              {notes.map((note) => (
                <NoteEntry
                  key={note.id}
                  note={note}
                  isEditing={editingNoteId === note.id}
                  editContent={editContent}
                  onEditContentChange={setEditContent}
                  onStartEdit={() => handleStartEdit(note)}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  onDelete={() => setDeleteTarget(note)}
                  canEdit={note.created_by === user?.id}
                  isSaving={updateNote.isPending}
                />
              ))}
            </div>
          ) : !isAddingNote ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No notes yet</p>
              <p className="text-sm mt-1">Add notes to track important information</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NoteEntry({
  note,
  isEditing,
  editContent,
  onEditContentChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  canEdit,
  isSaving,
}: {
  note: RenewalNote;
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (content: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  isSaving: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="text-xs">
          {getInitials(note.author?.full_name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {note.author?.full_name || note.author?.email || 'Unknown'}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
            </span>
            {note.updated_at !== note.created_at && (
              <span className="text-xs text-muted-foreground italic">(edited)</span>
            )}
          </div>

          {canEdit && !isEditing && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onStartEdit}>
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="mt-2">
            <Textarea
              value={editContent}
              onChange={(e) => onEditContentChange(e.target.value)}
              rows={3}
              className="mb-2"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSaveEdit} disabled={!editContent.trim() || isSaving}>
                <Save className="h-3 w-3 mr-1" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" size="sm" onClick={onCancelEdit}>
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 p-3 rounded-lg bg-muted/50 group">
            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
            </p>

            {/* Show edit/delete on hover */}
            {canEdit && (
              <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onStartEdit}>
                  <Edit2 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
