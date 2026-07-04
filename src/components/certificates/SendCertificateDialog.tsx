// Send a certificate by email (04-issuance-and-snapshots.md Sections 8 and 9.1).
//
// Fields: To (prefilled from the holder's directory email when available),
// optional Cc (multi-value), optional note. Submits to the reworked
// `send-coi-email` edge function with the { certificate_id, to, cc?, note? }
// contract (Section 8). On success calls onSent and closes.
//
// The edge function is authoritative for the attachment, holder name, and
// certificate number; this dialog sends only ids and the free-text note.
//
// Calm Command: cc-* tokens, both themes, no em/en dashes. The dialog is its own
// surface; its confirm is the standard primary action.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type { CertificateListItem } from '@/types/certificates';

interface SendCertificateDialogProps {
  certificate: CertificateListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SendCertificateDialog({
  certificate,
  open,
  onOpenChange,
  onSent,
}: SendCertificateDialogProps) {
  const [to, setTo] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  // Reset the form each time the dialog opens for a certificate. sent_to carries
  // the last delivery address, a reasonable prefill for a resend; otherwise blank
  // (the holder's directory email is not on the list item).
  useEffect(() => {
    if (open) {
      setTo(certificate.sent_to ?? '');
      setCcInput('');
      setCc([]);
      setNote('');
      setSending(false);
    }
  }, [open, certificate.id, certificate.sent_to]);

  const commitCc = () => {
    const candidate = ccInput.trim().replace(/,$/, '').trim();
    if (!candidate) return;
    if (!EMAIL_RE.test(candidate)) {
      toast.error('That does not look like a valid email address.');
      return;
    }
    if (candidate.toLowerCase() === to.trim().toLowerCase()) {
      setCcInput('');
      return;
    }
    if (!cc.some((e) => e.toLowerCase() === candidate.toLowerCase())) {
      setCc((prev) => [...prev, candidate]);
    }
    setCcInput('');
  };

  const removeCc = (email: string) => {
    setCc((prev) => prev.filter((e) => e !== email));
  };

  const handleSend = async () => {
    const toTrimmed = to.trim();
    if (!EMAIL_RE.test(toTrimmed)) {
      toast.error('Enter a valid recipient email address.');
      return;
    }
    // Fold a half-typed Cc address in before sending.
    const pendingCc = ccInput.trim().replace(/,$/, '').trim();
    const finalCc = [...cc];
    if (pendingCc && EMAIL_RE.test(pendingCc) && !finalCc.some((e) => e.toLowerCase() === pendingCc.toLowerCase())) {
      finalCc.push(pendingCc);
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-coi-email', {
        body: {
          certificate_id: certificate.id,
          to: toTrimmed,
          cc: finalCc.length > 0 ? finalCc : undefined,
          note: note.trim() ? note.trim() : undefined,
        },
      });
      if (error) {
        logger.error('send certificate email failed', error);
        toast.error(`Could not send the certificate: ${error.message}`);
        return;
      }
      toast.success('Certificate emailed.');
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      logger.error('send certificate email error', err);
      toast.error('Could not send the certificate.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-cc-surface-raised">
        <DialogHeader>
          <DialogTitle className="text-cc-text-primary">Send certificate</DialogTitle>
          <DialogDescription className="text-cc-text-muted">
            Email{' '}
            <span className="[font-variant-numeric:tabular-nums] font-medium text-cc-text-secondary">
              {certificate.certificate_number}
            </span>{' '}
            to {certificate.holder_name}. The PDF is attached automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cert-send-to" className="text-cc-text-secondary">
              To
            </Label>
            <Input
              id="cert-send-to"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="holder@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cert-send-cc" className="text-cc-text-secondary">
              Cc <span className="text-cc-text-muted">(optional)</span>
            </Label>
            {cc.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {cc.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 rounded-pill bg-cc-surface-overlay px-2.5 py-0.5 text-xs text-cc-text-secondary"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeCc(email)}
                      className="rounded-pill text-cc-text-muted hover:text-cc-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              id="cert-send-cc"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="Add an address, then press Enter"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  commitCc();
                }
              }}
              onBlur={commitCc}
              disabled={sending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cert-send-note" className="text-cc-text-secondary">
              Note <span className="text-cc-text-muted">(optional)</span>
            </Label>
            <Textarea
              id="cert-send-note"
              rows={3}
              placeholder="A short message to include in the email body."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={sending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !to.trim()}>
            {sending ? 'Sending' : 'Send certificate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
