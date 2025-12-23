import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Loader2, Building2, UserPlus, FileText, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { WorkspaceWithEntities } from '@/types/workspace';

interface LinkWorkspaceDialogProps {
    workspace: WorkspaceWithEntities;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Simple search hooks for each entity type
function useAccountsSearch(query: string) {
    return useQuery({
        queryKey: ['accounts-search', query],
        queryFn: async () => {
            if (!query || query.length < 2) {
                // Return recent accounts if no search query
                const { data, error } = await supabase
                    .from('accounts')
                    .select('id, name, email, type')
                    .order('updated_at', { ascending: false })
                    .limit(10);
                if (error) throw error;
                return data || [];
            }

            const { data, error } = await supabase
                .from('accounts')
                .select('id, name, email, type')
                .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
                .order('name')
                .limit(20);
            if (error) throw error;
            return data || [];
        },
        enabled: true,
    });
}

function useLeadsSearch(query: string) {
    return useQuery({
        queryKey: ['leads-search', query],
        queryFn: async () => {
            if (!query || query.length < 2) {
                const { data, error } = await supabase
                    .from('leads')
                    .select('id, first_name, last_name, email, status, company_name')
                    .order('updated_at', { ascending: false })
                    .limit(10);
                if (error) throw error;
                return data || [];
            }

            const { data, error } = await supabase
                .from('leads')
                .select('id, first_name, last_name, email, status, company_name')
                .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,company_name.ilike.%${query}%`)
                .order('first_name')
                .limit(20);
            if (error) throw error;
            return data || [];
        },
        enabled: true,
    });
}

function usePoliciesSearch(query: string) {
    return useQuery({
        queryKey: ['policies-search', query],
        queryFn: async () => {
            if (!query || query.length < 2) {
                const { data, error } = await supabase
                    .from('policies')
                    .select('id, policy_number, line_of_business, status, carrier:carriers(name)')
                    .order('updated_at', { ascending: false })
                    .limit(10);
                if (error) throw error;
                return data || [];
            }

            const { data, error } = await supabase
                .from('policies')
                .select('id, policy_number, line_of_business, status, carrier:carriers(name)')
                .or(`policy_number.ilike.%${query}%,line_of_business.ilike.%${query}%`)
                .order('policy_number')
                .limit(20);
            if (error) throw error;
            return data || [];
        },
        enabled: true,
    });
}

// Hook to link workspace to an entity
function useLinkWorkspaceLocal() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({
            workspace_id,
            entity_type,
            entity_id
        }: {
            workspace_id: string;
            entity_type: 'account' | 'lead' | 'policy';
            entity_id: string;
        }) => {
            const updateData: Record<string, string | null> = {
                account_id: null,
                lead_id: null,
                policy_id: null,
            };

            // Set the appropriate FK based on entity type
            if (entity_type === 'account') {
                updateData.account_id = entity_id;
            } else if (entity_type === 'lead') {
                updateData.lead_id = entity_id;
            } else if (entity_type === 'policy') {
                updateData.policy_id = entity_id;

                // If linking to policy, also get the account_id from the policy
                const { data: policy } = await supabase
                    .from('policies')
                    .select('account_id')
                    .eq('id', entity_id)
                    .single();

                if (policy?.account_id) {
                    updateData.account_id = policy.account_id;
                }
            }

            const { data, error } = await supabase
                .from('workspaces')
                .update(updateData)
                .eq('id', workspace_id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['workspaces'] });
            queryClient.invalidateQueries({ queryKey: ['workspace', variables.workspace_id] });
            toast({
                title: 'Workspace linked',
                description: `Successfully linked to ${variables.entity_type}`,
            });
        },
        onError: (error: Error) => {
            toast({
                title: 'Error linking workspace',
                description: error.message,
                variant: 'destructive',
            });
        },
    });
}

export function LinkWorkspaceDialog({ workspace, open, onOpenChange }: LinkWorkspaceDialogProps) {
    const [activeTab, setActiveTab] = useState<'account' | 'lead' | 'policy'>('account');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const linkWorkspace = useLinkWorkspaceLocal();

    // Search hooks
    const { data: accounts, isLoading: loadingAccounts } = useAccountsSearch(
        activeTab === 'account' ? searchQuery : ''
    );
    const { data: leads, isLoading: loadingLeads } = useLeadsSearch(
        activeTab === 'lead' ? searchQuery : ''
    );
    const { data: policies, isLoading: loadingPolicies } = usePoliciesSearch(
        activeTab === 'policy' ? searchQuery : ''
    );

    // Reset selection when dialog opens/closes or tab changes
    useEffect(() => {
        if (open) {
            setSelectedId(null);
            setSearchQuery('');
        }
    }, [open]);

    const handleLink = async () => {
        if (!selectedId) return;

        await linkWorkspace.mutateAsync({
            workspace_id: workspace.id,
            entity_type: activeTab,
            entity_id: selectedId,
        });

        onOpenChange(false);
        setSelectedId(null);
        setSearchQuery('');
    };

    const handleTabChange = (tab: string) => {
        setActiveTab(tab as 'account' | 'lead' | 'policy');
        setSelectedId(null);
        setSearchQuery('');
    };

    // Helper to get carrier name from nested object
    const getCarrierName = (policy: any) => {
        if (policy.carrier && typeof policy.carrier === 'object') {
            return policy.carrier.name || 'Unknown Carrier';
        }
        return 'Unknown Carrier';
    };

    // Helper to get full lead name
    const getLeadName = (lead: any) => {
        const first = lead.first_name || '';
        const last = lead.last_name || '';
        return `${first} ${last}`.trim() || lead.company_name || 'Unnamed Lead';
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Link Workspace</DialogTitle>
                    <DialogDescription>
                        Connect "<span className="font-medium">{workspace.name}</span>" to an account, lead, or policy
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="account" className="gap-1.5">
                            <Building2 className="h-4 w-4" />
                            Account
                        </TabsTrigger>
                        <TabsTrigger value="lead" className="gap-1.5">
                            <UserPlus className="h-4 w-4" />
                            Lead
                        </TabsTrigger>
                        <TabsTrigger value="policy" className="gap-1.5">
                            <FileText className="h-4 w-4" />
                            Policy
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="account" className="mt-4">
                        <Command className="border rounded-lg">
                            <CommandInput
                                placeholder="Search accounts..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                            />
                            <CommandList className="max-h-[250px]">
                                {loadingAccounts ? (
                                    <div className="flex items-center justify-center py-6">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <>
                                        <CommandEmpty>No accounts found</CommandEmpty>
                                        <CommandGroup>
                                            {accounts?.map((account) => (
                                                <CommandItem
                                                    key={account.id}
                                                    value={account.id}
                                                    onSelect={() => setSelectedId(account.id)}
                                                    className="cursor-pointer"
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium truncate">{account.name}</p>
                                                            <p className="text-sm text-muted-foreground truncate">
                                                                {account.email || 'No email'} {account.type && `• ${account.type}`}
                                                            </p>
                                                        </div>
                                                        {selectedId === account.id && (
                                                            <Check className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
                                                        )}
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </>
                                )}
                            </CommandList>
                        </Command>
                    </TabsContent>

                    <TabsContent value="lead" className="mt-4">
                        <Command className="border rounded-lg">
                            <CommandInput
                                placeholder="Search leads..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                            />
                            <CommandList className="max-h-[250px]">
                                {loadingLeads ? (
                                    <div className="flex items-center justify-center py-6">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <>
                                        <CommandEmpty>No leads found</CommandEmpty>
                                        <CommandGroup>
                                            {leads?.map((lead) => (
                                                <CommandItem
                                                    key={lead.id}
                                                    value={lead.id}
                                                    onSelect={() => setSelectedId(lead.id)}
                                                    className="cursor-pointer"
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium truncate">{getLeadName(lead)}</p>
                                                            <p className="text-sm text-muted-foreground truncate">
                                                                {lead.email || 'No email'} {lead.status && `• ${lead.status}`}
                                                            </p>
                                                        </div>
                                                        {selectedId === lead.id && (
                                                            <Check className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
                                                        )}
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </>
                                )}
                            </CommandList>
                        </Command>
                    </TabsContent>

                    <TabsContent value="policy" className="mt-4">
                        <Command className="border rounded-lg">
                            <CommandInput
                                placeholder="Search policies..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                            />
                            <CommandList className="max-h-[250px]">
                                {loadingPolicies ? (
                                    <div className="flex items-center justify-center py-6">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <>
                                        <CommandEmpty>No policies found</CommandEmpty>
                                        <CommandGroup>
                                            {policies?.map((policy) => (
                                                <CommandItem
                                                    key={policy.id}
                                                    value={policy.id}
                                                    onSelect={() => setSelectedId(policy.id)}
                                                    className="cursor-pointer"
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium truncate">{policy.policy_number || 'No Policy #'}</p>
                                                            <p className="text-sm text-muted-foreground truncate">
                                                                {getCarrierName(policy)} • {policy.line_of_business || 'N/A'}
                                                            </p>
                                                        </div>
                                                        {selectedId === policy.id && (
                                                            <Check className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
                                                        )}
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </>
                                )}
                            </CommandList>
                        </Command>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleLink}
                        disabled={!selectedId || linkWorkspace.isPending}
                    >
                        {linkWorkspace.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Linking...
                            </>
                        ) : (
                            'Link Workspace'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
