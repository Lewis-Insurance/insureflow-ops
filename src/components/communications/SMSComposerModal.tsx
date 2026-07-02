import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createClientSendApproval } from '@/lib/clientSendApproval';
import { MessageSquare, Send, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SMSComposerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  defaultPhone?: string;
  onSuccess?: () => void;
}

export function SMSComposerModal({
  open,
  onOpenChange,
  accountId,
  accountName,
  defaultPhone,
  onSuccess,
}: SMSComposerModalProps) {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Character count for SMS (160 chars per segment)
  const charCount = message.length;
  const segments = Math.ceil(charCount / 160) || 1;

  async function handleSend() {
    if (!phone.trim()) {
      toast({
        title: 'Error',
        description: 'Phone number is required',
        variant: 'destructive',
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: 'Error',
        description: 'Message is required',
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

      const sendPayload = {
        to_number: phone.trim(),
        body: message.trim(),
        account_id: accountId,
      };
      const client_send_approval = await createClientSendApproval('send-sms', sendPayload);

      // Call the send-sms edge function with the one-time named-human approval marker.
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { ...sendPayload, client_send_approval },
      });

      if (error) throw error;

      // Log the communication
      await supabase.from('communications').insert([{
        account_id: accountId,
        entity_type: 'account',
        entity_id: accountId,
        type: 'sms',
        direction: 'outbound',
        subject: `SMS to ${phone}`,
        content: message.trim(),
        status: 'sent',
        external_id: data?.message_sid || null,
        metadata: {
          to: phone.trim(),
          segments,
        },
        created_by: user.id,
      }]);

      toast({
        title: 'Message Sent',
        description: `SMS sent to ${phone}`,
      });

      // Reset and close
      setMessage('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Failed to Send',
        description: error.message || 'Could not send SMS. Please try again.',
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
            <MessageSquare className="h-5 w-5 text-green-600" />
            Send Text Message
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Sending to: <strong>{accountName}</strong>
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={4}
              className="resize-none"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{charCount} characters</span>
              <span>{segments} SMS segment{segments > 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={loading || !message.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                'Sending...'
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send SMS
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
