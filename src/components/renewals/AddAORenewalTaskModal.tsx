import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { AORenewal } from '@/hooks/useAORenewals';
import type { TaskPriority, TaskCategory } from '@/hooks/useTasks';

interface AddAORenewalTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renewal: AORenewal;
}

export function AddAORenewalTaskModal({ open, onOpenChange, renewal }: AddAORenewalTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState<TaskCategory>('renewal');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function handleSave() {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a task title',
        variant: 'destructive',
      });
      return;
    }
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to create tasks',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase.from('tasks').insert({
        account_id: renewal.account_id,
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt || null,
        priority,
        category,
        entity_type: 'ao_renewal',
        entity_id: renewal.id,
        status: 'pending',
        created_by: user.id,
        metadata: {
          renewal_customer_name: renewal.customer_name,
          renewal_policy_number: renewal.policy_number,
          renewal_date: renewal.renewal_date,
          renewal_premium: renewal.current_premium,
        },
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
        description: 'Task created successfully',
      });

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      if (renewal.account_id) {
        queryClient.invalidateQueries({ queryKey: ['tasks', renewal.account_id] });
      }
      
      setTitle('');
      setDescription('');
      setDueAt('');
      setPriority('medium');
      setCategory('renewal');
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create task',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Task for Renewal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <div><strong>Customer:</strong> {renewal.customer_name}</div>
            <div><strong>Policy:</strong> {renewal.policy_number}</div>
          </div>

          <div>
            <Label htmlFor="title">Task Title *</Label>
            <Input 
              id="title"
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="e.g., Contact customer about renewal" 
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea 
              id="description"
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="Add task details..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as TaskCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="renewal">Renewal</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="due-date">Due Date</Label>
            <Input 
              id="due-date"
              type="datetime-local" 
              value={dueAt} 
              onChange={(e) => setDueAt(e.target.value)} 
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || !title.trim()}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
