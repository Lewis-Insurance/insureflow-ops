import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface AddNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  policyId?: string;
  onSuccess?: () => void;
}

export function AddNoteModal({ open, onOpenChange, accountId, policyId, onSuccess }: AddNoteModalProps) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function handleSave() {
    if (!body.trim()) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to add notes',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase.from('customer_notes').insert({
        customer_id: accountId,
        note_text: body.trim(),
        created_by: user.id,
        policy_id: policyId ?? null,
      } as any);

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Success',
        description: 'Note added successfully',
      });

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['notes', accountId] });
      queryClient.invalidateQueries({ queryKey: ['accounts', accountId] });
      queryClient.invalidateQueries({ queryKey: ['account', accountId] });
      queryClient.invalidateQueries({ queryKey: ['account-notes', accountId] });
      if (policyId) {
        queryClient.invalidateQueries({ queryKey: ['policy-notes', policyId] });
        queryClient.invalidateQueries({ queryKey: ['policy', policyId] });
      }

      // Call onSuccess callback to refresh parent state
      if (onSuccess) {
        onSuccess();
      }

      setBody('');
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add note',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea 
            value={body} 
            onChange={(e) => setBody(e.target.value)} 
            placeholder="Type your note here..." 
            className="min-h-[120px]" 
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || !body.trim()}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}