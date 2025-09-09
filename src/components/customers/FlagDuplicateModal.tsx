import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FlagDuplicateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
}

export function FlagDuplicateModal({ open, onOpenChange, accountId }: FlagDuplicateModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleFlag() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to flag duplicates',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase.from('duplicate_flags').insert({
        account_id: accountId,
        flagged_by: user.id,
        reason: reason.trim() || null
      });

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
        description: 'Customer flagged as potential duplicate',
      });
      
      setReason('');
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to flag duplicate',
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
          <DialogTitle>Flag as Duplicate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea 
              id="reason"
              value={reason} 
              onChange={(e) => setReason(e.target.value)} 
              placeholder="Why do you think this is a duplicate customer?"
              className="min-h-[100px]" 
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleFlag} disabled={loading} variant="destructive">
              {loading ? 'Flagging...' : 'Flag as Duplicate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}