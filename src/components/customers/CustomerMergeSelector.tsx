import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Building2, Home, Search, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

interface Account {
  id: string;
  name: string;
  type: string;
  email?: string | null;
  phone?: string | null;
}

interface CustomerMergeSelectorProps {
  selectedId1: string | null;
  selectedId2: string | null;
  onSelect1: (accountId: string | null) => void;
  onSelect2: (accountId: string | null) => void;
}

function CustomerSearchDropdown({
  value,
  onSelect,
  excludeId,
  label,
}: {
  value: string | null;
  onSelect: (accountId: string | null) => void;
  excludeId: string | null;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch accounts for searching
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts-merge-search', search],
    queryFn: async () => {
      let query = supabase
        .from('accounts')
        .select('id, name, type, email, phone')
        .is('deleted_at', null)
        .order('name');

      if (search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        query = query.or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`);
      }

      const { data, error } = await query.limit(50);

      if (error) {
        console.error('Error fetching accounts:', error);
        return [];
      }

      return data as Account[];
    },
    staleTime: 30000,
  });

  // Resolve the selected account by id directly. A prefilled selection (deep
  // linked from a customer record or the duplicate-policy "Merge Clients"
  // shortcut) is almost never inside the first search page, so we can't rely on
  // finding it in `accounts` alone or the trigger would render empty.
  const { data: selectedById } = useQuery({
    queryKey: ['accounts-merge-selected', value],
    queryFn: async () => {
      if (!value) return null;
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, type, email, phone')
        .eq('id', value)
        .maybeSingle();
      if (error) {
        console.error('Error fetching selected account:', error);
        return null;
      }
      return (data as Account) ?? null;
    },
    enabled: !!value,
    staleTime: 30000,
  });

  // Find selected account
  const selectedAccount = useMemo(() => {
    if (!value) return null;
    return accounts.find((a) => a.id === value) || selectedById || null;
  }, [value, accounts, selectedById]);

  // Filter out excluded account
  const filteredAccounts = useMemo(() => {
    let filtered = accounts;
    if (excludeId) {
      filtered = filtered.filter((a) => a.id !== excludeId);
    }
    return filtered;
  }, [accounts, excludeId]);

  const handleSelect = (accountId: string) => {
    onSelect(accountId === value ? null : accountId);
    setOpen(false);
  };

  return (
    <div className="flex-1">
      <label className="block text-sm font-medium text-muted-foreground mb-2">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-12"
          >
            {selectedAccount ? (
              <div className="flex items-center gap-2 truncate">
                {selectedAccount.type === 'commercial_business' ? (
                  <Building2 className="h-4 w-4 shrink-0 text-blue-500" />
                ) : (
                  <Home className="h-4 w-4 shrink-0 text-green-500" />
                )}
                <span className="truncate">{selectedAccount.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search customers...
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by name or email..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {isLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Loading customers...
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No customers found
                  </div>
                )}
              </CommandEmpty>

              {filteredAccounts.length > 0 && (
                <CommandGroup heading="Customers">
                  {filteredAccounts.map((account) => (
                    <CommandItem
                      key={account.id}
                      value={account.id}
                      onSelect={() => handleSelect(account.id)}
                      className="flex items-start gap-3 py-3"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 mt-0.5',
                          value === account.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {account.type === 'commercial_business' ? (
                            <Building2 className="h-4 w-4 shrink-0 text-blue-500" />
                          ) : (
                            <Home className="h-4 w-4 shrink-0 text-green-500" />
                          )}
                          <span className="font-medium truncate">{account.name}</span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {account.type === 'commercial_business' ? 'Business' : 'Household'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {account.email && <span className="truncate">{account.email}</span>}
                          {account.phone && <span>{account.phone}</span>}
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
    </div>
  );
}

export function CustomerMergeSelector({
  selectedId1,
  selectedId2,
  onSelect1,
  onSelect2,
}: CustomerMergeSelectorProps) {
  const showSameAccountError = selectedId1 && selectedId2 && selectedId1 === selectedId2;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CustomerSearchDropdown
          value={selectedId1}
          onSelect={onSelect1}
          excludeId={selectedId2}
          label="Customer 1"
        />
        <CustomerSearchDropdown
          value={selectedId2}
          onSelect={onSelect2}
          excludeId={selectedId1}
          label="Customer 2"
        />
      </div>

      {showSameAccountError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You cannot merge a customer with itself. Please select two different customers.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
