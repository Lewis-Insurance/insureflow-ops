// ============================================
// ACORD Form Management Page
// Create, edit, and manage ACORD forms for accounts
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Edit,
  Download,
  Copy,
  Trash2,
  Send,
  PenTool,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileCheck,
  Building2,
  RefreshCw,
  ArrowUpDown,
  GitCompare,
  FileSignature,
  ChevronsUpDown,
  Check,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAcordForms } from '@/hooks/useAcordForms';
import { SignatureRequestModal } from '@/components/signatures';
import { ACORD_FORMS } from '@/types/acord';
import type { AcordForm, SignatureStatus, SubmissionStatus } from '@/types/acord';

// ============================================
// TYPES
// ============================================

interface FormWithDetails extends AcordForm {
  templateFormNumber?: string;
  templateFormName?: string;
  accountName?: string;
  completionPercentage?: number;
}

// ============================================
// COMPONENT
// ============================================

export default function FormManagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [forms, setForms] = useState<FormWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFormNumber, setFilterFormNumber] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSignature, setFilterSignature] = useState<string>('all');
  const [sortField, setSortField] = useState<'updated_at' | 'created_at'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedAccountName, setSelectedAccountName] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templates, setTemplates] = useState<{ id: string; form_number: string; form_name: string }[]>([]);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureForm, setSignatureForm] = useState<FormWithDetails | null>(null);

  // Account search state
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [accountSearchResults, setAccountSearchResults] = useState<{ id: string; name: string; type: string }[]>([]);
  const [isSearchingAccounts, setIsSearchingAccounts] = useState(false);
  const [isProspectMode, setIsProspectMode] = useState(false);
  const [prospectName, setProspectName] = useState('');

  // Load forms
  useEffect(() => {
    loadForms();
    loadTemplates();
  }, []);

  // Debounced account search
  useEffect(() => {
    const searchAccounts = async () => {
      if (accountSearchQuery.length < 2) {
        setAccountSearchResults([]);
        return;
      }

      setIsSearchingAccounts(true);
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('id, name, type')
          .ilike('name', `%${accountSearchQuery}%`)
          .order('name')
          .limit(20);

        if (error) throw error;
        setAccountSearchResults(data || []);
      } catch (err) {
        console.error('Error searching accounts:', err);
        setAccountSearchResults([]);
      } finally {
        setIsSearchingAccounts(false);
      }
    };

    const debounceTimer = setTimeout(searchAccounts, 300);
    return () => clearTimeout(debounceTimer);
  }, [accountSearchQuery]);

  const loadForms = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('acord_forms')
        .select(`
          *,
          acord_templates!template_id (form_number, form_name, field_inventory),
          accounts!account_id (name)
        `)
        .order(sortField, { ascending: sortOrder === 'asc' });

      if (error) throw error;

      const formsWithDetails: FormWithDetails[] = (data || []).map(form => {
        const fieldInventory = (form.acord_templates as any)?.field_inventory || [];
        const fieldValues = form.field_values || {};
        const filledCount = Object.keys(fieldValues).filter(
          k => fieldValues[k] !== null && fieldValues[k] !== undefined && fieldValues[k] !== ''
        ).length;
        const completionPercentage = fieldInventory.length > 0
          ? Math.round((filledCount / fieldInventory.length) * 100)
          : 0;

        return {
          ...form,
          templateFormNumber: (form.acord_templates as any)?.form_number,
          templateFormName: (form.acord_templates as any)?.form_name,
          accountName: (form.accounts as any)?.name,
          completionPercentage,
        };
      });

      setForms(formsWithDetails);
    } catch (err) {
      toast({
        title: 'Error loading forms',
        description: err instanceof Error ? err.message : 'Failed to load forms',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from('acord_templates')
      .select('id, form_number, form_name')
      .eq('is_current', true)
      .order('form_number');
    setTemplates(data || []);
  };

  // Filter forms
  const filteredForms = forms.filter(form => {
    const matchesSearch =
      form.accountName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.templateFormNumber?.includes(searchQuery) ||
      form.id.includes(searchQuery);

    const matchesFormNumber =
      filterFormNumber === 'all' || form.templateFormNumber === filterFormNumber;

    const matchesStatus =
      filterStatus === 'all' || form.submission_status === filterStatus;

    const matchesSignature =
      filterSignature === 'all' || form.signature_status === filterSignature;

    return matchesSearch && matchesFormNumber && matchesStatus && matchesSignature;
  });

  // Create new form
  const handleCreateForm = async () => {
    // Validate inputs
    if (isProspectMode) {
      if (!prospectName.trim() || !selectedTemplateId) {
        toast({
          title: 'Missing information',
          description: 'Please enter prospect name and select a template',
          variant: 'destructive',
        });
        return;
      }
    } else {
      if (!selectedAccountId || !selectedTemplateId) {
        toast({
          title: 'Missing information',
          description: 'Please select a client and template',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let accountId = selectedAccountId;

      // If prospect mode, create prospect account first
      if (isProspectMode) {
        // Get user's workspace
        const { data: membership, error: membershipError } = await supabase
          .from('agency_workspace_memberships')
          .select('agency_workspace_id')
          .eq('user_id', user.id)
          .single();

        if (membershipError) throw new Error('Could not find workspace');

        const { data: newAccount, error: accountError } = await supabase
          .from('accounts')
          .insert({
            agency_workspace_id: membership.agency_workspace_id,
            name: prospectName.trim(),
            type: 'prospect',
            account_status: 'active',
          })
          .select()
          .single();

        if (accountError) throw accountError;
        accountId = newAccount.id;
      }

      const { data, error } = await supabase
        .from('acord_forms')
        .insert({
          account_id: accountId,
          template_id: selectedTemplateId,
          field_values: {},
          has_addendum: false,
          signature_status: 'unsigned',
          submission_status: 'draft',
          created_by: user.id,
          row_version: 1,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Form created',
        description: isProspectMode
          ? `New ACORD form created for prospect "${prospectName.trim()}"`
          : 'New ACORD form has been created',
      });

      // Reset dialog state
      setCreateDialogOpen(false);
      setSelectedAccountId('');
      setSelectedAccountName('');
      setSelectedTemplateId('');
      setIsProspectMode(false);
      setProspectName('');
      setAccountSearchQuery('');
      setAccountSearchResults([]);
      loadForms();

      // Navigate to edit
      navigate(`/acord-forms/${data.id}/edit`);
    } catch (err) {
      toast({
        title: 'Error creating form',
        description: err instanceof Error ? err.message : 'Failed to create form',
        variant: 'destructive',
      });
    }
  };

  // Delete form
  const handleDeleteForm = async (formId: string) => {
    if (!confirm('Are you sure you want to delete this form? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('acord_forms')
        .delete()
        .eq('id', formId);

      if (error) throw error;

      toast({
        title: 'Form deleted',
        description: 'The form has been deleted',
      });
      loadForms();
    } catch (err) {
      toast({
        title: 'Error deleting form',
        description: err instanceof Error ? err.message : 'Failed to delete form',
        variant: 'destructive',
      });
    }
  };

  // Clone form
  const handleCloneForm = async (formId: string) => {
    try {
      const { data: original, error: fetchError } = await supabase
        .from('acord_forms')
        .select('*')
        .eq('id', formId)
        .single();

      if (fetchError) throw fetchError;

      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('acord_forms')
        .insert({
          account_id: original.account_id,
          template_id: original.template_id,
          field_values: original.field_values,
          has_addendum: false,
          cloned_from: formId,
          signature_status: 'unsigned',
          submission_status: 'draft',
          created_by: user?.id,
          row_version: 1,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Form cloned',
        description: 'A copy of the form has been created',
      });
      loadForms();
    } catch (err) {
      toast({
        title: 'Error cloning form',
        description: err instanceof Error ? err.message : 'Failed to clone form',
        variant: 'destructive',
      });
    }
  };

  // Get status badge
  const getStatusBadge = (status: SubmissionStatus) => {
    const configs: Record<SubmissionStatus, { variant: any; icon: any }> = {
      draft: { variant: 'secondary', icon: Edit },
      ready: { variant: 'default', icon: FileCheck },
      submitted: { variant: 'outline', icon: Send },
      accepted: { variant: 'default', icon: CheckCircle },
      rejected: { variant: 'destructive', icon: AlertTriangle },
      pending_info: { variant: 'outline', icon: Clock },
    };
    const config = configs[status];
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="capitalize">
        <Icon className="h-3 w-3 mr-1" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  // Get signature badge
  const getSignatureBadge = (status: SignatureStatus) => {
    const configs: Record<SignatureStatus, { variant: any; icon: any }> = {
      unsigned: { variant: 'secondary', icon: PenTool },
      pending: { variant: 'outline', icon: Clock },
      signed: { variant: 'default', icon: CheckCircle },
      declined: { variant: 'destructive', icon: AlertTriangle },
      expired: { variant: 'outline', icon: AlertTriangle },
    };
    const config = configs[status];
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="capitalize">
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
  };

  return (
    <AppLayout>
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ACORD Forms</h1>
          <p className="text-muted-foreground">
            Create and manage ACORD forms for your accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadForms} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Form
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New ACORD Form</DialogTitle>
                <DialogDescription>
                  Search for an existing client or create a form for a new prospect.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Toggle between existing client and new prospect */}
                <div className="flex gap-2">
                  <Button
                    variant={isProspectMode ? "outline" : "default"}
                    size="sm"
                    onClick={() => {
                      setIsProspectMode(false);
                      setProspectName('');
                    }}
                    className="flex-1"
                  >
                    <Building2 className="h-4 w-4 mr-2" />
                    Existing Client
                  </Button>
                  <Button
                    variant={isProspectMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsProspectMode(true);
                      setSelectedAccountId('');
                      setSelectedAccountName('');
                      setAccountSearchQuery('');
                    }}
                    className="flex-1"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    New Prospect
                  </Button>
                </div>

                {isProspectMode ? (
                  /* Prospect Name Input */
                  <div className="space-y-2">
                    <Label>Prospect Name *</Label>
                    <Input
                      placeholder="Enter prospect or business name..."
                      value={prospectName}
                      onChange={(e) => setProspectName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      A new prospect account will be created for this form.
                    </p>
                  </div>
                ) : (
                  /* Searchable Client Selector */
                  <div className="space-y-2">
                    <Label>Client *</Label>
                    <Popover open={accountSearchOpen} onOpenChange={setAccountSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={accountSearchOpen}
                          className="w-full justify-between font-normal"
                        >
                          {selectedAccountName || "Search for a client..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[380px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Type to search clients..."
                            value={accountSearchQuery}
                            onValueChange={setAccountSearchQuery}
                          />
                          <CommandList>
                            {isSearchingAccounts ? (
                              <div className="py-6 text-center text-sm">
                                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                                Searching...
                              </div>
                            ) : accountSearchQuery.length < 2 ? (
                              <CommandEmpty>
                                Type at least 2 characters to search...
                              </CommandEmpty>
                            ) : accountSearchResults.length === 0 ? (
                              <CommandEmpty>
                                No clients found. Try a different search or create a new prospect.
                              </CommandEmpty>
                            ) : (
                              <CommandGroup heading="Clients">
                                {accountSearchResults.map((account) => (
                                  <CommandItem
                                    key={account.id}
                                    value={account.id}
                                    onSelect={() => {
                                      setSelectedAccountId(account.id);
                                      setSelectedAccountName(account.name);
                                      setAccountSearchOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${
                                        selectedAccountId === account.id ? "opacity-100" : "opacity-0"
                                      }`}
                                    />
                                    <div className="flex flex-col">
                                      <span>{account.name}</span>
                                      <span className="text-xs text-muted-foreground capitalize">
                                        {account.type || 'client'}
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
                )}

                <div className="space-y-2">
                  <Label>Form Template *</Label>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select form template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          ACORD {template.form_number} - {template.form_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setCreateDialogOpen(false);
                  setIsProspectMode(false);
                  setProspectName('');
                  setSelectedAccountId('');
                  setSelectedAccountName('');
                  setAccountSearchQuery('');
                }}>
                  Cancel
                </Button>
                <Button onClick={handleCreateForm}>Create Form</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{forms.length}</p>
                <p className="text-sm text-muted-foreground">Total Forms</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                <Edit className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {forms.filter(f => f.submission_status === 'draft').length}
                </p>
                <p className="text-sm text-muted-foreground">Drafts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {forms.filter(f => f.signature_status === 'signed').length}
                </p>
                <p className="text-sm text-muted-foreground">Signed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Send className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {forms.filter(f => f.submission_status === 'submitted').length}
                </p>
                <p className="text-sm text-muted-foreground">Submitted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by account name or form ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterFormNumber} onValueChange={setFilterFormNumber}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Form #" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Forms</SelectItem>
                {Object.keys(ACORD_FORMS).map(num => (
                  <SelectItem key={num} value={num}>
                    ACORD {num}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSignature} onValueChange={setFilterSignature}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Signature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Signatures</SelectItem>
                <SelectItem value="unsigned">Unsigned</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Forms Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading forms...</p>
            </div>
          ) : filteredForms.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No forms found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || filterFormNumber !== 'all' || filterStatus !== 'all'
                  ? 'No forms match your filters'
                  : 'Create your first ACORD form to get started'}
              </p>
              {!searchQuery && filterFormNumber === 'all' && filterStatus === 'all' && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Form
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>Completion</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signature</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    >
                      Updated
                      <ArrowUpDown className="h-3 w-3 ml-1" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredForms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{form.accountName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">ACORD {form.templateFormNumber}</p>
                        <p className="text-xs text-muted-foreground">{form.templateFormName}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="w-24">
                        <div className="flex items-center gap-2 mb-1">
                          <Progress value={form.completionPercentage} className="h-2" />
                          <span className="text-xs">{form.completionPercentage}%</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(form.submission_status)}</TableCell>
                    <TableCell>{getSignatureBadge(form.signature_status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(form.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/acord-forms/${form.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/acord-forms/${form.id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(form.pdf_url, '_blank')} disabled={!form.pdf_url}>
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSignatureForm(form);
                              setShowSignatureModal(true);
                            }}
                            disabled={!form.pdf_url || form.signature_status === 'signed'}
                          >
                            <FileSignature className="h-4 w-4 mr-2" />
                            Send for Signature
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleCloneForm(form.id)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Clone
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/acord-forms/${form.id}/compare`)}>
                            <GitCompare className="h-4 w-4 mr-2" />
                            Compare
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteForm(form.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Signature Request Modal */}
      {signatureForm && (
        <SignatureRequestModal
          open={showSignatureModal}
          onOpenChange={(open) => {
            setShowSignatureModal(open);
            if (!open) setSignatureForm(null);
          }}
          documentUrl={signatureForm.pdf_url || ''}
          documentName={`ACORD ${signatureForm.templateFormNumber} - ${signatureForm.accountName || 'Form'}`}
          formNumber={signatureForm.templateFormNumber}
          acordFormId={signatureForm.id}
          onSuccess={(requestId) => {
            loadForms();
            toast({
              title: 'Signature request created',
              description: 'The document has been sent for signature.',
            });
          }}
        />
      )}
    </div>
    </AppLayout>
  );
}
