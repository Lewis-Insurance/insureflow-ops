/**
 * Client Selector Component
 * 
 * Searchable dropdown for selecting a client account
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Search,
  User,
  Building2,
  Users,
  X,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { useClientSearch, useRecentClients } from '@/hooks/useClientIntelligence';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface ClientOption {
  id: string;
  name: string;
  account_type: string | null;
  account_status: string | null;
  city: string | null;
  state: string | null;
}

interface ClientSelectorProps {
  selectedClient: ClientOption | null;
  onSelect: (client: ClientOption | null) => void;
  className?: string;
  placeholder?: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ClientSelector({
  selectedClient,
  onSelect,
  className,
  placeholder = "Select a client...",
}: ClientSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: searchResults, isLoading: isSearching } = useClientSearch(searchQuery);
  const { data: recentClients, isLoading: isLoadingRecent } = useRecentClients(10);

  const handleSelect = useCallback((client: ClientOption) => {
    onSelect(client);
    setOpen(false);
    setSearchQuery('');
  }, [onSelect]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  }, [onSelect]);

  const getAccountIcon = (type: string | null) => {
    switch (type) {
      case 'business':
        return <Building2 className="h-4 w-4 text-info" />;
      case 'household':
        return <Users className="h-4 w-4 text-success" />;
      default:
        return <User className="h-4 w-4 text-cc-text-muted" />;
    }
  };

  const displayClients = searchQuery.length >= 2 ? searchResults : recentClients;
  const isLoading = searchQuery.length >= 2 ? isSearching : isLoadingRecent;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between h-auto min-h-[44px] py-2",
            selectedClient ? "bg-muted/50" : "",
            className
          )}
        >
          {selectedClient ? (
            <div className="flex items-center gap-2 w-full">
              {getAccountIcon(selectedClient.account_type)}
              <div className="flex-1 text-left min-w-0">
                <div className="font-medium truncate">{selectedClient.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[selectedClient.city, selectedClient.state].filter(Boolean).join(', ') || 'No location'}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-2"
                onClick={handleClear}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Search className="h-4 w-4" />
              <span>{placeholder}</span>
              <ChevronDown className="h-4 w-4 ml-auto" />
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search clients by name..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center">
                <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">
                  {searchQuery ? 'Searching...' : 'Loading recent clients...'}
                </p>
              </div>
            ) : displayClients && displayClients.length > 0 ? (
              <CommandGroup heading={searchQuery ? 'Search Results' : 'Recent Clients'}>
                {displayClients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.id}
                    onSelect={() => handleSelect(client as ClientOption)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-3 w-full">
                      {getAccountIcon(client.account_type)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{client.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="truncate">
                            {[client.city, client.state].filter(Boolean).join(', ') || 'No location'}
                          </span>
                          {client.account_status && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {client.account_status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty>
                {searchQuery.length < 2
                  ? 'Type at least 2 characters to search'
                  : 'No clients found'}
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// CLIENT CONTEXT BADGE
// =============================================================================

interface ClientContextBadgeProps {
  client: ClientOption | null;
  onClear: () => void;
}

export function ClientContextBadge({ client, onClear }: ClientContextBadgeProps) {
  if (!client) return null;

  const getAccountIcon = (type: string | null) => {
    switch (type) {
      case 'business':
        return <Building2 className="h-3 w-3" />;
      case 'household':
        return <Users className="h-3 w-3" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  return (
    <Badge variant="secondary" className="gap-1.5 py-1 px-2">
      {getAccountIcon(client.account_type)}
      <span className="max-w-[150px] truncate">{client.name}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
        onClick={onClear}
      >
        <X className="h-3 w-3" />
      </Button>
    </Badge>
  );
}


