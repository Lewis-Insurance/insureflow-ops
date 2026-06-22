import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from '@/hooks/use-toast';
import {
  useAttachAORenewalQuoteDocument,
  useRemoveAORenewalQuoteDocument,
  useUpdateAORenewalQuote,
  type AORenewalQuote,
} from '@/hooks/useAORenewalQuotes';

const CARRIERS = ['Progressive', 'Geico', 'Nationwide', 'Allstate', 'State Farm', 'Liberty Mutual', 'Farmers', 'USAA', 'Other'];

const DENIAL_REASON_OPTIONS = [
  'Underwriting decline',
  'Coverage gap',
  'High premium',
  'Carrier not appointed',
  'Other',
] as const;

type DenialReasonOption = typeof DENIAL_REASON_OPTIONS[number];

const getTermMonthsValue = (termMonths: AORenewalQuote['term_months']): '6' | '12' =>
  termMonths === 12 ? '12' : '6';

interface EditQuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: AORenewalQuote;
}

function splitDenialReason(reason: string | null | undefined): { choice: DenialReasonOption | ''; other: string } {
  if (!reason) return { choice: '', other: '' };
  if ((DENIAL_REASON_OPTIONS as readonly string[]).includes(reason)) {
    return { choice: reason as DenialReasonOption, other: '' };
  }
  return { choice: 'Other', other: reason };
}

function extractFileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').pop();
    return last ? decodeURIComponent(last) : url;
  } catch {
    return url;
  }
}

export function EditQuoteModal({ open, onOpenChange, quote }: EditQuoteModalProps) {
  const updateMutation = useUpdateAORenewalQuote();
  const attachDocument = useAttachAORenewalQuoteDocument();
  const removeDocument = useRemoveAORenewalQuoteDocument();

  const initialReason = splitDenialReason(quote.denial_reason);

  const [carrier, setCarrier] = useState(quote.carrier);
  const [premium, setPremium] = useState(
    quote.status === 'denied' || quote.premium == null ? '' : quote.premium.toString(),
  );
  const [termMonths, setTermMonths] = useState<'6' | '12'>(getTermMonthsValue(quote.term_months));
  const [status, setStatus] = useState<'quoted' | 'denied' | 'selected' | 'expired'>(quote.status);
  const [denialReasonChoice, setDenialReasonChoice] = useState<DenialReasonOption | ''>(initialReason.choice);
  const [denialReasonOther, setDenialReasonOther] = useState(initialReason.other);
  const [notes, setNotes] = useState(quote.notes || '');
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const hasDocument = Boolean(quote.document_url);
  const docBusy = attachDocument.isPending || removeDocument.isPending;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxSize: 10485760,
    multiple: false,
    disabled: hasDocument || docBusy,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      attachDocument.mutate({
        quoteId: quote.id,
        renewalId: quote.renewal_id,
        file: acceptedFiles[0],
      });
    },
  });

  const handleConfirmRemove = () => {
    if (!quote.document_url) {
      setConfirmRemoveOpen(false);
      return;
    }
    removeDocument.mutate(
      { quoteId: quote.id, documentUrl: quote.document_url },
      { onSettled: () => setConfirmRemoveOpen(false) },
    );
  };

  const wasDenied = quote.status === 'denied';
  const isDenied = status === 'denied';

  useEffect(() => {
    if (!quote) return;
    const reason = splitDenialReason(quote.denial_reason);
    setCarrier(quote.carrier);
    setPremium(quote.status === 'denied' || quote.premium == null ? '' : quote.premium.toString());
    setTermMonths(getTermMonthsValue(quote.term_months));
    setStatus(quote.status);
    setDenialReasonChoice(reason.choice);
    setDenialReasonOther(reason.other);
    setNotes(quote.notes || '');
  }, [quote]);

  const handleStatusChange = (next: 'quoted' | 'denied' | 'selected' | 'expired') => {
    setStatus(next);
    if (next === 'denied') {
      setPremium('');
    } else {
      setDenialReasonChoice('');
      setDenialReasonOther('');
    }
  };

  const resolveDenialReason = (): string => {
    if (denialReasonChoice === 'Other') return denialReasonOther.trim();
    return denialReasonChoice;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (wasDenied && status === 'selected') {
      toast({
        title: 'Not allowed',
        description: 'Flip status to Quoted first, save, then mark Selected.',
        variant: 'destructive',
      });
      return;
    }

    if (!carrier) {
      toast({ title: 'Validation Error', description: 'Please select a carrier', variant: 'destructive' });
      return;
    }

    let premiumValue: number | null = null;

    if (isDenied) {
      const reason = resolveDenialReason();
      if (!reason) {
        toast({
          title: 'Validation Error',
          description: denialReasonChoice === 'Other'
            ? 'Please enter a custom denial reason'
            : 'Please select a denial reason',
          variant: 'destructive',
        });
        return;
      }
    } else {
      const parsed = parseFloat(premium);
      if (!premium || isNaN(parsed) || parsed <= 0) {
        toast({
          title: 'Validation Error',
          description: !premium ? 'Premium required' : 'Premium must be greater than zero',
          variant: 'destructive',
        });
        return;
      }
      premiumValue = parsed;
    }

    await updateMutation.mutateAsync({
      id: quote.id,
      updates: {
        carrier,
        premium: premiumValue,
        term_months: isDenied ? null : (parseInt(termMonths) as 6 | 12),
        status,
        denial_reason: isDenied ? resolveDenialReason() : null,
        notes: notes || null,
      },
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Quote</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Quote Document</Label>
            {hasDocument && quote.document_url ? (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <FileText className="h-5 w-5 text-primary" />
                <a
                  href={quote.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm truncate underline-offset-2 hover:underline"
                >
                  {extractFileNameFromUrl(quote.document_url)}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRemoveOpen(true)}
                  disabled={docBusy}
                  aria-label="Remove document"
                >
                  {removeDocument.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                } ${docBusy ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input {...getInputProps()} />
                {attachDocument.isPending ? (
                  <div className="flex flex-col items-center text-sm text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mb-2" />
                    Uploading...
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    {isDragActive ? (
                      <p className="text-sm text-muted-foreground">Drop the file here...</p>
                    ) : (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">
                          Drag &amp; drop a file here, or click to select
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF, JPG, PNG, DOC, DOCX (max 10MB)
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Did this carrier decline?</p>
              <p className="text-xs text-muted-foreground">
                Use this instead of entering a price when the company denied the quote.
              </p>
            </div>
            <Button
              type="button"
              variant={isDenied ? 'destructive' : 'outline'}
              onClick={() => handleStatusChange(isDenied ? 'quoted' : 'denied')}
            >
              {isDenied ? 'Carrier marked declined' : 'Mark carrier declined'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="carrier">Carrier *</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="premium" className={isDenied ? 'text-muted-foreground' : undefined}>
                Premium {isDenied ? '' : '*'}
              </Label>
              <Input
                id="premium"
                type="number"
                step="0.01"
                value={isDenied ? '' : premium}
                onChange={(e) => setPremium(e.target.value)}
                placeholder={isDenied ? 'N/A (denied)' : '0.00'}
                disabled={isDenied}
                required={!isDenied}
                aria-disabled={isDenied}
              />
            </div>

            <div>
              <Label htmlFor="term" className={isDenied ? 'text-muted-foreground' : undefined}>
                Term {isDenied ? '' : '*'}
              </Label>
              <Select value={termMonths} onValueChange={(v) => setTermMonths(v as '6' | '12')} disabled={isDenied}>
                <SelectTrigger aria-disabled={isDenied}>
                  <SelectValue placeholder={isDenied ? 'N/A (denied)' : undefined} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status *</Label>
              <Select value={status} onValueChange={(v) => handleStatusChange(v as "denied" | "quoted" | "selected" | "expired")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="denied">Denied</SelectItem>
                  <SelectItem value="selected" disabled={wasDenied}>Selected</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              {wasDenied && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Flip status to Quoted first to mark Selected.
                </p>
              )}
            </div>
          </div>

          {isDenied && (
            <div className="space-y-2">
              <div>
                <Label htmlFor="denial_reason">Denial Reason *</Label>
                <Select value={denialReasonChoice} onValueChange={(v) => setDenialReasonChoice(v as DenialReasonOption)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {DENIAL_REASON_OPTIONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {denialReasonChoice === 'Other' && (
                <div>
                  <Label htmlFor="denial_reason_other">Custom reason *</Label>
                  <Input
                    id="denial_reason_other"
                    value={denialReasonOther}
                    onChange={(e) => setDenialReasonOther(e.target.value)}
                    placeholder="Describe the denial reason"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this quote"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Quote
            </Button>
          </div>
        </form>

        <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this document?</AlertDialogTitle>
              <AlertDialogDescription>
                The file will be permanently deleted from storage and detached from this quote.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeDocument.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmRemove();
                }}
                disabled={removeDocument.isPending}
              >
                {removeDocument.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
