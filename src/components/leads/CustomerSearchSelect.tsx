import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus, Building2, Home, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface Account {
  id: string;
  name: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  spouse_name?: string | null;
}

interface CustomerSearchSelectProps {
  value?: string;
  onSelect: (accountId: string | null) => void;
  onCreateNew: () => void;
  placeholder?: string;
  className?: string;
}

export function CustomerSearchSelect({
  value,
  onSelect,
  onCreateNew,
  placeholder = 'Search customers...',
  className,
}: CustomerSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch all accounts for searching
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts-search', search],
    queryFn: async () => {
      let query = supabase
        .from('accounts')
        .select('id, name, type, email, phone, spouse_name')
        .order('name');

      // If there's a search term, filter by name or spouse_name
      if (search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        query = query.or(`name.ilike.${searchTerm},spouse_name.ilike.${searchTerm}`);
      }

      const { data, error } = await query.limit(50);

      if (error) {
        console.error('Error fetching accounts:', error);
        return [];
      }

      return data as Account[];
    },
    staleTime: 30000, // 30 seconds
  });

  // Find selected account
  const selectedAccount = useMemo(() => {
    if (!value) return null;
    return accounts.find((a) => a.id === value) || null;
  }, [value, accounts]);

  // Filter accounts based on search (client-side for instant feedback)
  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts;

    const searchLower = search.toLowerCase();
    return accounts.filter((account) => {
      const nameMatch = account.name?.toLowerCase().includes(searchLower);
      const spouseMatch = account.spouse_name?.toLowerCase().includes(searchLower);
      const emailMatch = account.email?.toLowerCase().includes(searchLower);
      return nameMatch || spouseMatch || emailMatch;
    });
  }, [accounts, search]);

  const handleSelect = (accountId: string) => {
    onSelect(accountId === value ? null : accountId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
        >
          {selectedAccount ? (
            <div className="flex items-center gap-2 truncate">
              {selectedAccount.type === 'commercial_business' ? (
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{selectedAccount.name}</span>
              {selectedAccount.spouse_name && (
                <span className="text-muted-foreground truncate">
                  & {selectedAccount.spouse_name}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name, spouse, or email..."
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
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    No customers found matching "{search}"
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onCreateNew();
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create New Customer
                  </Button>
                </div>
              )}
            </CommandEmpty>

            {filteredAccounts.length > 0 && (
              <CommandGroup heading="Existing Customers">
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
                          {account.type === 'commercial_business' ? 'Commercial' : 'Personal'}
                        </Badge>
                      </div>
                      {account.spouse_name && (
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">
                          Spouse: {account.spouse_name}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {account.email && <span className="truncate">{account.email}</span>}
                        {account.phone && <span>{account.phone}</span>}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />

            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onCreateNew();
                  setOpen(false);
                }}
                className="gap-2 text-primary"
              >
                <Plus className="h-4 w-4" />
                Create New Customer
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
