/**
 * SignatureRequestModal
 *
 * Modal dialog for creating and sending signature requests via Dropbox Sign.
 * Allows selecting signers, customizing message, and sending for signature.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Send, User, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  getSignatureConfig,
  getRequiredSigners,
  type SignerRole,
} from '@/lib/acord/signatureAnchors';
import { createClientSendApproval } from '@/lib/clientSendApproval';

interface Signer {
  role: SignerRole;
  name: string;
  email: string;
  order: number;
}

interface SignatureRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentUrl: string;
  documentName: string;
  formNumber?: string;
  acordFormId?: string;
  onSuccess?: (requestId: string) => void;
  // Pre-populate signer info if available
  defaultSigners?: Partial<Signer>[];
}

const ROLE_LABELS: Record<SignerRole, string> = {
  applicant: 'Applicant',
  co_applicant: 'Co-Applicant',
  agent: 'Agent/Broker',
  producer: 'Producer',
  authorized_representative: 'Authorized Representative',
  witness: 'Witness',
};

export function SignatureRequestModal({
  open,
  onOpenChange,
  documentUrl,
  documentName,
  formNumber,
  acordFormId,
  onSuccess,
  defaultSigners = [],
}: SignatureRequestModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signer management
  const [signers, setSigners] = useState<Signer[]>([]);
  const [message, setMessage] = useState('');
  const [expirationDays, setExpirationDays] = useState(14);

  // Get required signers based on form type
  const config = formNumber ? getSignatureConfig(formNumber) : null;
  const requiredRoles = formNumber ? getRequiredSigners(formNumber) : [];

  // Initialize signers when modal opens
  useEffect(() => {
    if (open) {
      const initialSigners: Signer[] = requiredRoles.map((role, index) => {
        const defaultSigner = defaultSigners.find(s => s.role === role);
        return {
          role,
          name: defaultSigner?.name || '',
          email: defaultSigner?.email || '',
          order: index + 1,
        };
      });

      // If no required roles, add a default applicant
      if (initialSigners.length === 0) {
        initialSigners.push({
          role: 'applicant',
          name: defaultSigners[0]?.name || '',
          email: defaultSigners[0]?.email || '',
          order: 1,
        });
      }

      setSigners(initialSigners);
      setError(null);
    }
  }, [open, requiredRoles, defaultSigners]);

  const updateSigner = (index: number, field: keyof Signer, value: string | number) => {
    setSigners(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addSigner = () => {
    setSigners(prev => [
      ...prev,
      {
        role: 'applicant',
        name: '',
        email: '',
        order: prev.length + 1,
      },
    ]);
  };

  const removeSigner = (index: number) => {
    if (signers.length > 1) {
      setSigners(prev => prev.filter((_, i) => i !== index));
    }
  };

  const validateSigners = (): boolean => {
    for (const signer of signers) {
      if (!signer.name.trim()) {
        setError('All signers must have a name');
        return false;
      }
      if (!signer.email.trim() || !signer.email.includes('@')) {
        setError('All signers must have a valid email address');
        return false;
      }
    }
    return true;
  };

  const handleSend = async () => {
    if (!validateSigners()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get current session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Build signature fields from form config
      const signatureFields = config?.anchors.map((anchor, index) => {
        const signerIndex = signers.findIndex(s => s.role === anchor.role);
        return {
          type: anchor.type === 'signature' ? 'signature' : anchor.type === 'date' ? 'date_signed' : 'text',
          page: anchor.page,
          x: anchor.position?.x || 10,
          y: anchor.position?.y || 80,
          width: anchor.position?.width || 200,
          height: anchor.position?.height || 30,
          signer_index: signerIndex >= 0 ? signerIndex : 0,
          name: anchor.fieldName,
          required: anchor.required,
        };
      }) || [];

      const signatureRequestPayload = {
        document_url: documentUrl,
        document_name: documentName,
        signers: signers.map(s => ({
          email: s.email,
          name: s.name,
          role: s.role,
          order: s.order,
        })),
        form_number: formNumber,
        acord_form_id: acordFormId,
        message: message || undefined,
        expires_in_days: expirationDays,
        signature_fields: signatureFields.length > 0 ? signatureFields : undefined,
      };
      const clientSendApproval = await createClientSendApproval('esign-create-request', signatureRequestPayload);

      // Call edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/esign-create-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...signatureRequestPayload,
            client_send_approval: clientSendApproval,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create signature request');
      }

      toast({
        title: 'Signature request sent',
        description: `Request sent to ${signers.length} signer${signers.length > 1 ? 's' : ''}`,
      });

      onSuccess?.(result.data.id);
      onOpenChange(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send signature request';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send for Signature
          </DialogTitle>
          <DialogDescription>
            Send "{documentName}" for electronic signature via Dropbox Sign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Form Info */}
          {config && (
            <div className="bg-muted p-3 rounded-lg">
              <div className="text-sm font-medium">{config.formName}</div>
              <div className="text-xs text-muted-foreground mt-1">
                ACORD {config.formNumber} - Requires{' '}
                {requiredRoles.map(r => ROLE_LABELS[r]).join(' & ')} signature
              </div>
            </div>
          )}

          {/* Signers */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Signers</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSigner}
              >
                Add Signer
              </Button>
            </div>

            {signers.map((signer, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">
                    Signer {index + 1}
                  </Badge>
                  {signers.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSigner(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`role-${index}`}>Role</Label>
                    <Select
                      value={signer.role}
                      onValueChange={(value) => updateSigner(index, 'role', value as SignerRole)}
                    >
                      <SelectTrigger id={`role-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`name-${index}`}>Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id={`name-${index}`}
                        value={signer.name}
                        onChange={(e) => updateSigner(index, 'name', e.target.value)}
                        placeholder="John Smith"
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`email-${index}`}>Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id={`email-${index}`}
                      type="email"
                      value={signer.email}
                      onChange={(e) => updateSigner(index, 'email', e.target.value)}
                      placeholder="john@example.com"
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message to Signers (Optional)</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please review and sign this document at your earliest convenience."
              rows={3}
            />
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <Label htmlFor="expiration">Request Expires In</Label>
            <Select
              value={String(expirationDays)}
              onValueChange={(value) => setExpirationDays(Number(value))}
            >
              <SelectTrigger id="expiration" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading || signers.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send for Signature
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SignatureRequestModal;
