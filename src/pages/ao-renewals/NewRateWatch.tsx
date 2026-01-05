/**
 * New Rate Watch Page
 * 
 * Create a new rate watch job by selecting a customer and line of business.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { ArrowLeft, Check, ChevronsUpDown, Loader2, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAccountsForRateWatch,
  useCreateRateWatchJob,
  LINE_OF_BUSINESS_OPTIONS,
} from '@/hooks/useRateWatch';

export default function NewRateWatch() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null>(null);
  const [jobName, setJobName] = useState('');
  const [lineOfBusiness, setLineOfBusiness] = useState('Personal Auto');

  const { data: accounts = [], isLoading: accountsLoading } = useAccountsForRateWatch(searchQuery);
  const createJob = useCreateRateWatchJob();

  // Auto-generate job name when customer is selected
  useEffect(() => {
    if (selectedAccount && !jobName) {
      const date = new Date();
      const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      setJobName(`${selectedAccount.name} - Renewal ${monthYear}`);
    }
  }, [selectedAccount, jobName]);

  const handleCreate = async () => {
    if (!selectedAccount) return;

    try {
      const job = await createJob.mutateAsync({
        account_id: selectedAccount.id,
        job_name: jobName || `${selectedAccount.name} - Rate Watch`,
        line_of_business: lineOfBusiness,
      });

      // Navigate to the detail page
      navigate(`/ao-renewals/rate-watch/${job.id}`);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">New Rate Watch</h1>
            <p className="text-muted-foreground">
              Compare renewal premium with alternative carrier quotes
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card>
          <CardHeader>
            <CardTitle>Create Rate Watch Job</CardTitle>
            <CardDescription>
              Select a customer and set up the comparison parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Customer Selection */}
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={popoverOpen}
                    className="w-full justify-between h-10"
                  >
                    {selectedAccount ? (
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{selectedAccount.name}</span>
                        {selectedAccount.email && (
                          <span className="text-muted-foreground text-sm">
                            ({selectedAccount.email})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Select a customer...
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search customers..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      {accountsLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : accounts.length === 0 ? (
                        <CommandEmpty>
                          {searchQuery.length < 2
                            ? 'Type at least 2 characters to search...'
                            : 'No customers found.'}
                        </CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {accounts.map((account) => (
                            <CommandItem
                              key={account.id}
                              value={account.id}
                              onSelect={() => {
                                setSelectedAccount(account);
                                setPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedAccount?.id === account.id
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{account.name}</span>
                                <span className="text-sm text-muted-foreground">
                                  {[account.email, account.phone, account.city, account.state]
                                    .filter(Boolean)
                                    .join(' • ')}
                                </span>
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

            {/* Job Name */}
            <div className="space-y-2">
              <Label htmlFor="jobName">Job Name</Label>
              <Input
                id="jobName"
                placeholder="e.g., Smith Auto Renewal - Jan 2025"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Auto-generated from customer name, but you can customize it
              </p>
            </div>

            {/* Line of Business */}
            <div className="space-y-2">
              <Label htmlFor="lob">Line of Business</Label>
              <Select value={lineOfBusiness} onValueChange={setLineOfBusiness}>
                <SelectTrigger id="lob">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINE_OF_BUSINESS_OPTIONS.map((lob) => (
                    <SelectItem key={lob} value={lob}>
                      {lob}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Create Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleCreate}
              disabled={!selectedAccount || createJob.isPending}
            >
              {createJob.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Rate Watch
            </Button>

            {/* Help Text */}
            <p className="text-sm text-muted-foreground text-center">
              After creating the job, you'll upload the current policy, renewal docs, and any alternative quotes.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}


