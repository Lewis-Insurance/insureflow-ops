import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageSquarePlus, Loader2, Pencil, Trash2, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAORenewalEditor } from "./aoRenewalEditor";

interface Note {
  id: string;
  content: string;
  created_at: string;
  created_by: string;
  user_name?: string;
}

interface AORenewalNotesProps {
  renewalId: string;
}

export function AORenewalNotes({ renewalId }: AORenewalNotesProps) {
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editorContext = useAORenewalEditor();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["ao-renewal-notes", renewalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ao_renewal_notes")
        .select("*")
        .eq("renewal_id", renewalId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const userIds = [...new Set(data?.map((note: any) => note.created_by) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

      return (data || []).map((note: any) => ({
        id: note.id,
        content: note.content,
        created_at: note.created_at,
        created_by: note.created_by,
        user_name: profileMap.get(note.created_by) || "Unknown User",
      }));
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("ao_renewal_notes").insert({
        renewal_id: renewalId,
        content: content.trim(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-notes", renewalId] });
      setNewNote("");
      toast({ title: "Success", description: "Note added successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to add note", variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from("ao_renewal_notes")
        .update({ content: content.trim() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-notes", renewalId] });
      setEditingId(null);
      toast({ title: "Updated", description: "Note updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ao_renewal_notes").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-notes", renewalId] });
      setDeleteTarget(null);
      toast({ title: "Deleted", description: "Note removed" });
    },
    onError: (err: Error) => {
      setDeleteTarget(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const hasDraft = useMemo(() => newNote.trim().length > 0, [newNote]);
  const newNoteRef = useRef(newNote);
  newNoteRef.current = newNote;
  const addNoteMutationRef = useRef(addNoteMutation);
  addNoteMutationRef.current = addNoteMutation;

  useEffect(() => {
    if (!editorContext) return;
    return editorContext.registerDirtySource({
      id: `ao-renewal-notes-${renewalId}`,
      label: 'Notes',
      isDirty: () => newNoteRef.current.trim().length > 0,
      save: async () => {
        if (!newNoteRef.current.trim()) return true;
        await addNoteMutationRef.current.mutateAsync(newNoteRef.current);
        return true;
      },
    });
  }, [editorContext, renewalId]);

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNoteMutation.mutate(newNote);
  };

  const startEdit = (note: Note) => { setEditingId(note.id); setEditContent(note.content); };
  const cancelEdit = () => { setEditingId(null); setEditContent(""); };
  const saveEdit = (id: string) => {
    if (!editContent.trim()) return;
    updateNoteMutation.mutate({ id, content: editContent });
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Note Section */}
        <div className="space-y-2">
          <Textarea
            placeholder="Add a note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
          />
          <Button
            onClick={handleAddNote}
            disabled={!hasDraft || addNoteMutation.isPending}
            size="sm"
          >
            {addNoteMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-4 w-4 mr-2" />
            )}
            Add Note
          </Button>
        </div>

        <Separator />

        {/* Notes List */}
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No notes yet. Add your first note above.
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <div key={note.id} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {getInitials(note.user_name || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{note.user_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => startEdit(note)}
                          disabled={editingId === note.id || updateNoteMutation.isPending}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(note)}
                          disabled={deleteNoteMutation.isPending}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {editingId === note.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(note.id)}
                            disabled={!editContent.trim() || updateNoteMutation.isPending}
                          >
                            {updateNoteMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5 mr-1" />
                            )}
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}>
                            <X className="h-3.5 w-3.5 mr-1" />Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.content}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This note will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteNoteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
