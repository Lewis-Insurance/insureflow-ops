import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronsUpDown, Home, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeMultiFieldSearch } from '@/lib/sanitize';
import { formatPhoneForDisplay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface CustomerSearchResult {
  id: string;
  name: string;
  type: string | null;
  email?: string | null;
  phone?: string | null;
}

interface CustomerSearchSelectProps {
  value: CustomerSearchResult | null;
  onChange: (customer: CustomerSearchResult | null) => void;
  /**
   * Controls the search popover. A parent Dialog owns this so it can keep the
   * Escape key scoped to the search list: Escape closes the list and the modal
   * underneath stays open. Falls back to internal state when omitted.
   */
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
  /** Seeds the search box, e.g. with the name already on the AO renewal row. */
  initialQuery?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  agencyWorkspaceId?: string;
  excludedAccountIds?: string[];
}

/**
 * Searchable account picker for surfaces that are not already scoped to a
 * customer (AO renewals are imported from a carrier report and are not linked
 * to a CRM account until someone picks one).
 */
export function CustomerSearchSelect({
  value,
  onChange,
  searchOpen,
  onSearchOpenChange,
  initialQuery = '',
  error,
  disabled = false,
  id,
  agencyWorkspaceId,
  excludedAccountIds = [],
}: CustomerSearchSelectProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = searchOpen ?? internalOpen;
  const [search, setSearch] = useState(initialQuery);
  // Debounced: one query per pause, not per keystroke (50-row payloads).
  const [debouncedSearch, setDebouncedSearch] = useState(initialQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: accounts = [], isLoading, isError } = useQuery({
    queryKey: ['customer-search-select', debouncedSearch, agencyWorkspaceId, excludedAccountIds],
    queryFn: async () => {
      let query = supabase
        .from('accounts')
        .select('id, name, type, email, phone')
        .is('deleted_at', null)
        .order('name');

      if (agencyWorkspaceId) {
        query = query.eq('agency_workspace_id', agencyWorkspaceId);
      }

      if (excludedAccountIds.length > 0) {
        query = query.not('id', 'in', `(${excludedAccountIds.join(',')})`);
      }

      if (debouncedSearch.trim()) {
        // Sanitized + quoted: a raw comma ("Smith, John") breaks the PostgREST
        // .or() grammar and would silently return zero rows.
        query = query.or(sanitizeMultiFieldSearch(debouncedSearch.trim(), ['name', 'email']));
      }

      const { data, error: queryError } = await query.limit(50);
      if (queryError) throw queryError;
      return (data ?? []) as CustomerSearchResult[];
    },
    staleTime: 30000,
  });

  const handleOpenChange = (next: boolean) => {
    if (searchOpen === undefined) setInternalOpen(next);
    onSearchOpenChange?.(next);
  };

  const emptyMessage = useMemo(() => {
    if (isLoading) return 'Loading customers...';
    if (isError) return 'Could not load customers. Check your connection and try again.';
    return debouncedSearch.trim() ? 'No customers match that search.' : 'Type a name or email to search.';
  }, [isLoading, isError, debouncedSearch]);

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between font-normal', error && 'border-destructive')}
          >
            {value ? (
              <span className="flex min-w-0 items-center gap-2">
                {value.type === 'commercial_business' ? (
                  <Building2 className="h-4 w-4 shrink-0" />
                ) : (
                  <Home className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{value.name}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Search className="h-4 w-4" />
                Search customers...
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0 z-50"
          align="start"
          onEscapeKeyDown={(event) => {
            // Close only the search list. The modal underneath stays open.
            event.preventDefault();
            handleOpenChange(false);
          }}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by name or email..."
              value={search}
              onValueChange={setSearch}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  // Belt and braces: keep Escape from reaching the parent Dialog.
                  event.preventDefault();
                  event.stopPropagation();
                  handleOpenChange(false);
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                <div className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
              </CommandEmpty>
              {accounts.length > 0 && (
                <CommandGroup heading="Customers">
                  {accounts.map((account) => (
                    <CommandItem
                      key={account.id}
                      value={account.id}
                      onSelect={() => {
                        onChange(account);
                        handleOpenChange(false);
                      }}
                      className="flex items-start gap-3 py-3"
                    >
                      <Check
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          value?.id === account.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {account.type === 'commercial_business' ? (
                            <Building2 className="h-4 w-4 shrink-0" />
                          ) : (
                            <Home className="h-4 w-4 shrink-0" />
                          )}
                          <span className="truncate font-medium">{account.name}</span>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {account.type === 'commercial_business' ? 'Commercial' : 'Personal'}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          {account.email && <span className="truncate">{account.email}</span>}
                          {account.phone && <span>{formatPhoneForDisplay(account.phone)}</span>}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
