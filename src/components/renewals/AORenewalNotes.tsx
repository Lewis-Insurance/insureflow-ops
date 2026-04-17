import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquarePlus, Loader2 } from "lucide-react";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editorContext = useAORenewalEditor();

  // Fetch notes
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["ao-renewal-notes", renewalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ao_renewal_notes")
        .select("*")
        .eq("renewal_id", renewalId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch user names for all notes
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

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("ao_renewal_notes").insert({
        renewal_id: renewalId,
        content: content.trim(),
        created_by: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ao-renewal-notes", renewalId] });
      setNewNote("");
      toast({
        title: "Success",
        description: "Note added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add note",
        variant: "destructive",
      });
    },
  });

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNoteMutation.mutate(newNote);
  };

  const hasDraft = useMemo(() => newNote.trim().length > 0, [newNote]);

  useEffect(() => {
    if (!editorContext) return;

    return editorContext.registerDirtySource({
      id: `ao-renewal-notes-${renewalId}`,
      label: 'Notes',
      isDirty: () => newNote.trim().length > 0,
      save: async () => {
        if (!newNote.trim()) return true;
        await addNoteMutation.mutateAsync(newNote);
        return true;
      },
    });
  }, [editorContext, renewalId, newNote, addNoteMutation]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

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
            <div className="text-center py-8 text-muted-foreground">
              Loading notes...
            </div>
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
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{note.user_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(note.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {note.content}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
