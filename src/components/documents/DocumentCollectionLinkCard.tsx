// ============================================================================
// DOCUMENT COLLECTION LINK CARD
// ============================================================================
// Staff side: mint portal links for document collection in one move.
// Calm Command: cc-* tokens, NO lime, no em or en dashes.
// ============================================================================

import { useMemo, useState } from 'react';
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
import {
  collectionPortalUrl,
  useCollectionPackets,
  useCopyCollectionLink,
  useQuickDocumentLink,
} from '@/hooks/useDocumentCollection';
import { CreatePacketModal } from './CreatePacketModal';
import { formatDistanceToNow } from 'date-fns';

interface DocumentCollectionLinkCardProps {
  accountId: string;
  accountEmail?: string | null;
  accountName?: string;
}

export function DocumentCollectionLinkCard({
  accountId,
  accountEmail,
  accountName,
}: DocumentCollectionLinkCardProps) {
  const { data: packets = [] } = useCollectionPackets(accountId);
  const quickLink = useQuickDocumentLink();
  const copyLink = useCopyCollectionLink();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const activePackets = useMemo(
    () => packets.filter((p) => p.status !== 'archived'),
    [packets],
  );

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

  const handleNewLink = () => {
    quickLink.mutate(
      {
        account_id: accountId,
        recipient_email: accountEmail || undefined,
        recipient_name: accountName || undefined,
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

  const handleCopyPacketLink = (workspaceId: string) => {
    setCopyingId(workspaceId);
    copyLink.mutate(
      {
        workspace_id: workspaceId,
        recipient_email: accountEmail || undefined,
        recipient_name: accountName || undefined,
      },
      {
        onSuccess: async (result) => {
          const url = result.portal_url
            ?? (result.token ? collectionPortalUrl(result.token) : null);
          if (!url) {
            toast.error('Could not generate portal link.');
            return;
          }
          const copiedOk = await tryCopy(url);
          if (copiedOk) {
            toast.success('Link copied');
          } else {
            setSuccessUrl(url);
            setCopied(false);
          }
        },
        onError: (error) => {
          toast.error(error.message || 'Failed to copy link.');
        },
        onSettled: () => setCopyingId(null),
      },
    );
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

  const mailtoHref = successUrl
    ? `mailto:${accountEmail || ''}?subject=${encodeURIComponent('Document request')}&body=${encodeURIComponent(`Please upload your documents here: ${successUrl}`)}`
    : undefined;

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
              onClick={() => setCustomizeOpen(true)}
              className="text-cc-text-secondary hover:text-cc-text-primary"
            >
              Customize packet
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewLink}
              disabled={quickLink.isPending}
              className="text-cc-text-secondary hover:text-cc-text-primary"
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {quickLink.isPending ? 'Creating' : 'New document link'}
            </Button>
          </div>
        </div>

        {activePackets.length > 0 ? (
          <ul className="space-y-1.5">
            {activePackets.map((packet) => (
              <li key={packet.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-cc-text-primary">{packet.name}</span>
                <span className="text-cc-text-muted">
                  created {formatDistanceToNow(new Date(packet.created_at), { addSuffix: true })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyPacketLink(packet.id)}
                  disabled={copyingId === packet.id}
                  className="text-cc-text-secondary hover:text-cc-text-primary"
                >
                  <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
                  {copyingId === packet.id ? 'Copying' : 'Copy'}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cc-text-muted">
            Create a link and send it to the client. Uploaded documents land in the documents list below.
          </p>
        )}
      </div>

      <CreatePacketModal
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        accountId={accountId}
        accountEmail={accountEmail}
        accountName={accountName}
      />

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
                <Input
                  value={successUrl}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button onClick={handleCopySuccessUrl} variant="outline" size="icon">
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex gap-2">
                {accountEmail && (
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
