// ============================================================================
// LEAD DOCUMENT COLLECTION LINK CARD
// ============================================================================
// Ensures a prospect account exists before minting document collection links.
// Never passes leadId as accountId.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, Link2, Mail, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DocumentCollectionLinkCard } from './DocumentCollectionLinkCard';
import { useEnsureLeadProspectAccount } from '@/hooks/useEnsureLeadProspectAccount';
import {
  collectionPortalUrl,
  useQuickDocumentLink,
} from '@/hooks/useDocumentCollection';

interface LeadDocumentCollectionLinkCardProps {
  leadId: string;
  leadEmail?: string | null;
  leadName?: string;
  accountId?: string | null;
}

export function LeadDocumentCollectionLinkCard({
  leadId,
  leadEmail,
  leadName,
  accountId: initialAccountId,
}: LeadDocumentCollectionLinkCardProps) {
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(
    initialAccountId ?? null,
  );
  const ensureAccount = useEnsureLeadProspectAccount();
  const quickLink = useQuickDocumentLink();
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialAccountId) {
      setResolvedAccountId(initialAccountId);
    }
  }, [initialAccountId]);

  const isBusy = ensureAccount.isPending || quickLink.isPending;

  const tryCopy = async (url: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  };

  const showSuccessDialog = (url: string, copiedToClipboard: boolean) => {
    setSuccessUrl(url);
    setCopied(copiedToClipboard);
    if (copiedToClipboard) {
      toast.success('Link copied to the clipboard. Send it to the client.');
    }
  };

  const mintLinkForAccount = (accountId: string) => {
    quickLink.mutate(
      {
        account_id: accountId,
        recipient_email: leadEmail || undefined,
        recipient_name: leadName || undefined,
      },
      {
        onSuccess: async (result) => {
          const url = result.portal_url
            ?? (result.token ? collectionPortalUrl(result.token) : null);
          if (!url) {
            toast.error('Portal link was not created. Try again or customize the packet.');
            return;
          }
          const copiedOk = await tryCopy(url);
          showSuccessDialog(url, copiedOk);
        },
        onError: (error) => {
          toast.error(error.message || 'Failed to create document link.');
        },
      },
    );
  };

  const handleNewLink = () => {
    if (resolvedAccountId) {
      mintLinkForAccount(resolvedAccountId);
      return;
    }

    ensureAccount.mutate(leadId, {
      onSuccess: (accountId) => {
        setResolvedAccountId(accountId);
        mintLinkForAccount(accountId);
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to prepare prospect account.');
      },
    });
  };

  const handleCopySuccessUrl = async () => {
    if (!successUrl) return;
    const copiedOk = await tryCopy(successUrl);
    if (copiedOk) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeSuccessDialog = () => {
    setSuccessUrl(null);
    setCopied(false);
  };

  const mailtoHref = useMemo(() => {
    if (!successUrl) return undefined;
    return `mailto:${leadEmail || ''}?subject=${encodeURIComponent('Document request')}&body=${encodeURIComponent(`Please upload your documents here: ${successUrl}`)}`;
  }, [successUrl, leadEmail]);

  if (resolvedAccountId) {
    return (
      <DocumentCollectionLinkCard
        accountId={resolvedAccountId}
        accountEmail={leadEmail}
        accountName={leadName}
      />
    );
  }

  return (
    <>
      <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-cc-text-muted" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-cc-text-primary">Document collection</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="text-cc-text-secondary hover:text-cc-text-primary"
            >
              Customize packet
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewLink}
              disabled={isBusy}
              className="text-cc-text-secondary hover:text-cc-text-primary"
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isBusy ? 'Creating' : 'New document link'}
            </Button>
          </div>
        </div>

        <p className="text-sm text-cc-text-muted">
          Create a link and send it to the client. A prospect account is created automatically when you mint the first link.
        </p>
      </div>

      <Dialog open={!!successUrl} onOpenChange={(open) => !open && closeSuccessDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-success" />
              Document link ready
            </DialogTitle>
            <DialogDescription>
              Share this link with your client to collect documents.
            </DialogDescription>
          </DialogHeader>

          {successUrl && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input value={successUrl} readOnly className="flex-1 font-mono text-sm" />
                <Button onClick={handleCopySuccessUrl} variant="outline" size="icon">
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex gap-2">
                {leadEmail && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(mailtoHref, '_blank')}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Open in Email
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(successUrl, '_blank')}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Preview Portal
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={closeSuccessDialog}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
