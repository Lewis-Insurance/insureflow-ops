import { useState } from 'react';
import { formatPhoneForDisplay } from '@/lib/format';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useSendReviewRequest, usePrimaryGoogleProfile } from '@/hooks/useReputation';
import { useAuth } from '@/hooks/useAuth';
import { Star, Mail, MessageSquare, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';

interface ReviewRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
}

type Channel = 'email' | 'sms' | 'both';

export function ReviewRequestModal({
  open,
  onOpenChange,
  customer,
}: ReviewRequestModalProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const agencyWorkspaceId = profile?.default_agency_workspace_id;

  const [channel, setChannel] = useState<Channel>('email');

  const sendReviewRequest = useSendReviewRequest();
  const { data: googleProfile, isLoading: loadingProfile } = usePrimaryGoogleProfile(agencyWorkspaceId);

  const hasEmail = !!customer.email;
  const hasPhone = !!customer.phone;
  const canSendEmail = hasEmail;
  const canSendSMS = hasPhone;
  const canSendBoth = hasEmail && hasPhone;
  const hasGoogleProfile = !!googleProfile?.review_url;

  // Parse first/last name from customer.name
  const nameParts = customer.name.trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const handleSend = async () => {
    if (!agencyWorkspaceId) {
      toast({
        title: 'Error',
        description: 'No agency workspace found. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasGoogleProfile) {
      toast({
        title: 'Configuration Required',
        description: 'Please configure your Google Business Profile in Settings first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await sendReviewRequest.mutateAsync({
        agencyWorkspaceId,
        contactId: customer.id,
        email: canSendEmail ? customer.email : undefined,
        phone: canSendSMS ? customer.phone : undefined,
        firstName,
        lastName,
        channel,
      });

      toast({
        title: 'Review Request Sent!',
        description: `Request sent via ${channel === 'both' ? 'email and SMS' : channel} to ${customer.name}`,
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Failed to Send',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  // Auto-select best available channel
  const getDefaultChannel = (): Channel => {
    if (canSendBoth) return 'both';
    if (canSendEmail) return 'email';
    if (canSendSMS) return 'sms';
    return 'email';
  };

  // Set default channel when modal opens
  useState(() => {
    setChannel(getDefaultChannel());
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Request Google Review
          </DialogTitle>
          <DialogDescription>
            Send a review request to {customer.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Google Profile Status */}
          {loadingProfile ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Google Business Profile...
            </div>
          ) : !hasGoogleProfile ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No Google Business Profile configured.
                <Button
                  variant="link"
                  className="px-1 h-auto"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.href = '/settings/reputation';
                  }}
                >
                  Configure in Settings
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">{googleProfile.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {googleProfile.review_url}
              </p>
            </div>
          )}

          {/* Contact Info */}
          <div className="space-y-2">
            <Label>Customer Contact</Label>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="font-medium">{customer.name}</p>
              {customer.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {customer.email}
                </p>
              )}
              {customer.phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  {formatPhoneForDisplay(customer.phone)}
                </p>
              )}
              {!hasEmail && !hasPhone && (
                <p className="text-sm text-destructive">
                  No email or phone on file
                </p>
              )}
            </div>
          </div>

          {/* Channel Selection */}
          {(hasEmail || hasPhone) && (
            <div className="space-y-3">
              <Label>Send Via</Label>
              <RadioGroup
                value={channel}
                onValueChange={(v) => setChannel(v as Channel)}
                className="grid grid-cols-3 gap-3"
              >
                <div>
                  <RadioGroupItem
                    value="email"
                    id="email"
                    className="peer sr-only"
                    disabled={!canSendEmail}
                  />
                  <Label
                    htmlFor="email"
                    className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all
                      ${!canSendEmail ? 'opacity-50 cursor-not-allowed' : ''}
                      peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5
                      hover:bg-muted/50
                    `}
                  >
                    <Mail className="h-6 w-6 mb-2" />
                    <span className="text-sm font-medium">Email</span>
                  </Label>
                </div>

                <div>
                  <RadioGroupItem
                    value="sms"
                    id="sms"
                    className="peer sr-only"
                    disabled={!canSendSMS}
                  />
                  <Label
                    htmlFor="sms"
                    className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all
                      ${!canSendSMS ? 'opacity-50 cursor-not-allowed' : ''}
                      peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5
                      hover:bg-muted/50
                    `}
                  >
                    <MessageSquare className="h-6 w-6 mb-2" />
                    <span className="text-sm font-medium">SMS</span>
                  </Label>
                </div>

                <div>
                  <RadioGroupItem
                    value="both"
                    id="both"
                    className="peer sr-only"
                    disabled={!canSendBoth}
                  />
                  <Label
                    htmlFor="both"
                    className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all
                      ${!canSendBoth ? 'opacity-50 cursor-not-allowed' : ''}
                      peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5
                      hover:bg-muted/50
                    `}
                  >
                    <div className="flex gap-1 mb-2">
                      <Mail className="h-5 w-5" />
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium">Both</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Preview */}
          {hasGoogleProfile && (hasEmail || hasPhone) && (
            <div className="space-y-2">
              <Label>Message Preview</Label>
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p>Hi {firstName || 'there'},</p>
                <p className="mt-2">
                  Thank you for being a valued customer! We'd love to hear about your experience.
                </p>
                <p className="mt-2">
                  Would you mind leaving us a quick Google review? It only takes a minute and helps us serve you better.
                </p>
                <p className="mt-2 text-primary font-medium">
                  [Review Link]
                </p>
                <p className="mt-2 text-muted-foreground">
                  - {googleProfile?.name || 'Your Insurance Agency'}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              sendReviewRequest.isPending ||
              !hasGoogleProfile ||
              (!hasEmail && !hasPhone)
            }
          >
            {sendReviewRequest.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Star className="h-4 w-4 mr-2" />
                Send Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
