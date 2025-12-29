import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';

interface AddCallLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onSuccess?: () => void;
}

export function AddCallLogModal({ open, onOpenChange, accountId, onSuccess }: AddCallLogModalProps) {
  const [formData, setFormData] = useState({
    direction: 'outbound',
    subject: '',
    content: '',
    duration_minutes: '',
    contact_name: '',
    phone_number: '',
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSave() {
    if (!formData.subject.trim()) {
      toast({
        title: 'Error',
        description: 'Subject is required',
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
          description: 'You must be logged in',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('communications')
        .insert([{
          account_id: accountId,
          entity_type: 'account',
          entity_id: accountId,
          type: 'call',
          direction: formData.direction,
          subject: formData.subject.trim(),
          content: formData.content.trim() || null,
          status: 'completed',
          metadata: {
            duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes) : null,
            contact_name: formData.contact_name.trim() || null,
            phone_number: formData.phone_number.trim() || null,
          },
          created_by: user.id,
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Call log added successfully',
      });

      // Reset form
      setFormData({
        direction: 'outbound',
        subject: '',
        content: '',
        duration_minutes: '',
        contact_name: '',
        phone_number: '',
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add call log',
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
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-purple-600" />
            Log a Call
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Call Direction</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                variant={formData.direction === 'outbound' ? 'default' : 'outline'}
                onClick={() => setFormData(prev => ({ ...prev, direction: 'outbound' }))}
                className="flex-1"
              >
                <PhoneOutgoing className="h-4 w-4 mr-2" />
                Outbound
              </Button>
              <Button
                type="button"
                variant={formData.direction === 'inbound' ? 'default' : 'outline'}
                onClick={() => setFormData(prev => ({ ...prev, direction: 'inbound' }))}
                className="flex-1"
              >
                <PhoneIncoming className="h-4 w-4 mr-2" />
                Inbound
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contact_name">Contact Name</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label htmlFor="phone_number">Phone Number</Label>
              <Input
                id="phone_number"
                value={formData.phone_number}
                onChange={(e) => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Policy renewal discussion"
            />
          </div>

          <div>
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              min="0"
              value={formData.duration_minutes}
              onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: e.target.value }))}
              placeholder="15"
            />
          </div>

          <div>
            <Label htmlFor="content">Call Notes</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Summary of the conversation..."
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading ? 'Saving...' : 'Log Call'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
