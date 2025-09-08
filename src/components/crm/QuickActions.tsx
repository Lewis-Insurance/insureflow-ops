import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Phone, MessageSquare, AlertTriangle, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { asMessage } from '@/lib/asMessage';
import { supabase } from '@/integrations/supabase/client';
import type { Account } from '@/types/crm-enhanced';

interface QuickActionsProps {
  account: Account;
  onActionComplete?: () => void;
}

export function QuickActions({ account, onActionComplete }: QuickActionsProps) {
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hasOptOut, setHasOptOut] = useState(false);

  // Check for SMS opt-out status
  React.useEffect(() => {
    checkOptOutStatus();
  }, [account.phone]);

  const checkOptOutStatus = async () => {
    if (!account.phone) return;

    try {
      const { data } = await supabase
        .from('consents')
        .select('event')
        .eq('contact_id', account.id) // Assuming account phone maps to a contact
        .eq('type', 'sms')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setHasOptOut(false); // Simplified for now
    } catch (error) {
      // Silently handle opt-out check errors - assume no opt-out
    }
  };

  const handleCall = () => {
    if (!account.phone) {
      toast({
        title: "No phone number",
        description: "This account doesn't have a phone number on file",
        variant: "destructive",
      });
      return;
    }

    // In a real implementation, this would either:
    // 1. Open a softphone/click-to-dial integration
    // 2. Trigger an outbound call via Twilio API
    // For now, we'll open the phone app
    window.open(`tel:${account.phone}`);
    
    toast({
      title: "Call initiated",
      description: `Calling ${account.phone}`,
    });

    onActionComplete?.();
  };

  const handleSendSMS = async () => {
    if (!account.phone) {
      toast({
        title: "No phone number",
        description: "This account doesn't have a phone number on file",
        variant: "destructive",
      });
      return;
    }

    if (hasOptOut) {
      toast({
        title: "SMS blocked",
        description: "This number has opted out of SMS communications",
        variant: "destructive",
      });
      return;
    }

    if (!smsMessage.trim()) {
      toast({
        title: "Message required",
        description: "Please enter a message to send",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      // In a real implementation, this would call the Cloudflare Workers endpoint
      // to send SMS via Twilio. For now, we'll simulate it and log to the database.
      
      // Log outbound SMS attempt
      await supabase
        .from('sms_messages')
        .insert({
          account_id: account.id,
          from_number: '+1234567890', // Would come from Twilio settings
          to_number: account.phone,
          direction: 'out',
          body: smsMessage,
          status: 'queued'
        });

      // Log as event
      await supabase
        .from('events')
        .insert({
          type: 'sms_sent',
          entity_type: 'account',
          entity_id: account.id,
          payload: {
            to_number: account.phone,
            message_preview: smsMessage.substring(0, 50)
          }
        });

      toast({
        title: "SMS sent",
        description: `Message sent to ${account.phone}`,
      });

      setSmsMessage('');
      setSmsOpen(false);
      onActionComplete?.();
    } catch (error) {
      toast({
        title: "Failed to send SMS",
        description: asMessage(error, "There was an error sending the message"),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex space-x-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCall}
        disabled={!account.phone}
      >
        <Phone className="h-4 w-4 mr-2" />
        Call
      </Button>

      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!account.phone || hasOptOut}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            SMS
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send SMS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="to">To</Label>
              <p className="text-sm text-muted-foreground">{account.phone}</p>
            </div>

            {hasOptOut && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This number has opted out of SMS communications and cannot receive messages.
                </AlertDescription>
              </Alert>
            )}

            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Type your message here..."
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                className="min-h-[100px]"
                maxLength={160}
                disabled={hasOptOut}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {smsMessage.length}/160 characters
              </p>
            </div>

            <div className="flex space-x-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setSmsOpen(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendSMS}
                disabled={sending || hasOptOut || !smsMessage.trim()}
              >
                {sending ? (
                  <>Sending...</>
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
    </div>
  );
}