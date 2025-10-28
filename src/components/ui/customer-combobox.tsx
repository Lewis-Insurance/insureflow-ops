import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCustomersSearch } from "@/hooks/useCustomersSearch";

interface CustomerComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CustomerCombobox({ value, onChange, placeholder = "Select customer..." }: CustomerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { rows, loading, filters, setFilters } = useCustomersSearch();
  
  const selectedCustomer = rows.find(customer => customer.account_id === value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, setFilters]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedCustomer ? (
            <span className="truncate">{selectedCustomer.display_name || selectedCustomer.org_name}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <div className="flex items-center gap-1">
            {value && (
              <X 
                className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100" 
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 z-50" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search customers..."
              value={search}
              onValueChange={setSearch}
              className="border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            <CommandEmpty>
              {loading ? "Searching..." : "No customers found."}
            </CommandEmpty>
            <CommandGroup>
              {rows.map((customer) => (
                <CommandItem
                  key={customer.account_id}
                  value={customer.account_id}
                  onSelect={() => {
                    onChange(customer.account_id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === customer.account_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">
                      {customer.display_name || customer.org_name}
                    </span>
                    {customer.primary_email && (
                      <span className="text-xs text-muted-foreground truncate">
                        {customer.primary_email}
                      </span>
                    )}
                  </div>
                  {customer.city && customer.state && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {customer.city}, {customer.state}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
