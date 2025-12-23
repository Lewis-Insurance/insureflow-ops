/**
 * Link Document Dialog
 * 
 * Quick dialog to link an orphaned document to an account, lead, or policy.
 */

import React, { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronsUpDown, Link2, Loader2, FileText } from 'lucide-react';
import { useLinkDocument } from '@/integrations/supabase/hooks/useAIModules';
import { useAccounts } from '@/hooks/useAccounts';
import { useLeads } from '@/hooks/useLeads';
import { cn } from '@/lib/utils';

// Document type options
const DOCUMENT_TYPES = [
  { value: 'policy', label: 'Policy' },
  { value: 'quote', label: 'Quote' },
  { value: 'application', label: 'Application' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'claim', label: 'Claim' },
  { value: 'loss_run', label: 'Loss Run' },
  { value: 'contract', label: 'Contract' },
  { value: 'id_card', label: 'ID Card' },
  { value: 'other', label: 'Other' },
];

interface LinkDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    filename: string;
  } | null;
}

export function LinkDocumentDialog({
  open,
  onOpenChange,
  document,
}: LinkDocumentDialogProps) {
  const [linkType, setLinkType] = useState<'account' | 'lead'>('account');
  const [linkId, setLinkId] = useState<string>('');
  const [documentType, setDocumentType] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState(false);

  const linkDocument = useLinkDocument();
  const { data: accountsData } = useAccounts();
  const accounts = accountsData || [];
  const { data: leadsData } = useLeads();
  const leads = leadsData?.leads || [];

  const handleSubmit = async () => {
    if (!document || !linkId) return;

    await linkDocument.mutateAsync({
      documentId: document.id,
      linkType,
      linkId,
      documentType: documentType || undefined,
    });

    // Reset and close
    setLinkId('');
    setDocumentType('');
    onOpenChange(false);
  };

  const getSelectedName = () => {
    if (!linkId) return null;
    if (linkType === 'account') {
      return accounts.find(a => a.id === linkId)?.name;
    }
    return leads.find(l => l.id === linkId)?.name;
  };

  const items = linkType === 'account' ? accounts : leads;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link Document
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {document?.filename}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Link Type */}
          <div className="space-y-2">
            <Label>Link to</Label>
            <Select
              value={linkType}
              onValueChange={(value: 'account' | 'lead') => {
                setLinkType(value);
                setLinkId('');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entity Selector */}
          <div className="space-y-2">
            <Label>
              Select {linkType === 'account' ? 'Account' : 'Lead'}
            </Label>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={searchOpen}
                  className="w-full justify-between"
                >
                  {getSelectedName() || `Select ${linkType}...`}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder={`Search ${linkType}s...`} />
                  <CommandList>
                    <CommandEmpty>No {linkType}s found.</CommandEmpty>
                    <CommandGroup>
                      {items.slice(0, 50).map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.name}
                          onSelect={() => {
                            setLinkId(item.id);
                            setSearchOpen(false);
                          }}
                        >
                          <span className={cn(
                            "mr-2 h-4 w-4",
                            linkId === item.id ? "opacity-100" : "opacity-0"
                          )}>
                            ✓
                          </span>
                          {item.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Document Type */}
          <div className="space-y-2">
            <Label>Document Type (optional)</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type..." />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!linkId || linkDocument.isPending}
          >
            {linkDocument.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Linking...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                Link Document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LinkDocumentDialog;

