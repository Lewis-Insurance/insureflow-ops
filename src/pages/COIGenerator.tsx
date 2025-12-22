import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCOI } from '@/hooks/useCOI';
import { useCOIGeneration } from '@/hooks/useCOIGeneration';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, FileText, Download, Send, Sparkles, Search, Check, Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function COIGenerator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const initialAccountId = searchParams.get('accountId');
  const initialPolicyId = searchParams.get('policyId');

  const { cois, createCOI, updateCOI } = useCOI();
  const { generateAndAttachCOI, downloadCOI } = useCOIGeneration();

  // Customer selection state
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialAccountId);
  const [customerPolicies, setCustomerPolicies] = useState<any[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(initialPolicyId);

  const [account, setAccount] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [formData, setFormData] = useState({
    certificate_holder_name: '',
    certificate_holder_address: '',
    effective_date: '',
    expiration_date: '',
    coverage_details: {
      general_liability: '',
      auto_liability: '',
      workers_comp: '',
      umbrella: '',
    },
    additional_insureds: false,
    waiver_of_subrogation: false,
    special_provisions: '',
  });

  // Fetch all customers on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      setCustomersLoading(true);
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, company_name, first_name, last_name, email, phone, address')
        .order('name', { ascending: true });

      if (error) {
        toast({ title: 'Error loading customers', description: error.message, variant: 'destructive' });
      } else {
        setCustomers(data || []);
      }
      setCustomersLoading(false);
    };

    fetchCustomers();
  }, [toast]);

  // Fetch customer data and policies when customer is selected
  useEffect(() => {
    if (!selectedCustomerId) {
      setAccount(null);
      setPolicy(null);
      setCustomerPolicies([]);
      return;
    }

    const fetchCustomerData = async () => {
      // Fetch account details
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', selectedCustomerId)
        .single();

      if (accountError) {
        toast({ title: 'Error loading customer', description: accountError.message, variant: 'destructive' });
        return;
      }
      setAccount(accountData);

      // Fetch customer's policies
      const { data: policiesData, error: policiesError } = await supabase
        .from('policies')
        .select('*')
        .eq('account_id', selectedCustomerId)
        .order('effective_date', { ascending: false });

      if (policiesError) {
        toast({ title: 'Error loading policies', description: policiesError.message, variant: 'destructive' });
      } else {
        setCustomerPolicies(policiesData || []);
        // Auto-select first active policy if none selected
        if (!selectedPolicyId && policiesData && policiesData.length > 0) {
          const activePolicy = policiesData.find(p => p.status === 'active') || policiesData[0];
          setSelectedPolicyId(activePolicy.id);
        }
      }
    };

    fetchCustomerData();
  }, [selectedCustomerId, toast]);

  // Fetch selected policy details
  useEffect(() => {
    if (!selectedPolicyId) {
      setPolicy(null);
      return;
    }

    const fetchPolicy = async () => {
      const { data: policyData, error: policyError } = await supabase
        .from('policies')
        .select('*')
        .eq('id', selectedPolicyId)
        .single();

      if (policyError) {
        toast({ title: 'Error loading policy', description: policyError.message, variant: 'destructive' });
        return;
      }
      setPolicy(policyData);

      // Auto-fill form with policy dates and coverage
      if (policyData) {
        setFormData(prev => ({
          ...prev,
          effective_date: policyData.effective_date || '',
          expiration_date: policyData.expiration_date || '',
          coverage_details: {
            general_liability: policyData.coverage_details?.general_liability || prev.coverage_details.general_liability,
            auto_liability: policyData.coverage_details?.auto_liability || prev.coverage_details.auto_liability,
            workers_comp: policyData.coverage_details?.workers_comp || prev.coverage_details.workers_comp,
            umbrella: policyData.coverage_details?.umbrella || prev.coverage_details.umbrella,
          }
        }));
      }
    };

    fetchPolicy();
  }, [selectedPolicyId, toast]);

  // Filter customers based on search query (searches name, company, first/last name, email)
  const filteredCustomers = customers.filter(customer => {
    if (!customerSearchQuery) return true;
    const query = customerSearchQuery.toLowerCase();
    return (
      (customer.name?.toLowerCase().includes(query)) ||
      (customer.company_name?.toLowerCase().includes(query)) ||
      (customer.first_name?.toLowerCase().includes(query)) ||
      (customer.last_name?.toLowerCase().includes(query)) ||
      (customer.email?.toLowerCase().includes(query)) ||
      (`${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase().includes(query))
    );
  });

  // Handle customer selection
  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setSelectedPolicyId(null); // Reset policy selection
    setCustomerSearchOpen(false);
    setCustomerSearchQuery('');
  };

  const handleGenerateWithAI = async () => {
    if (!account) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-coi-data', {
        body: {
          ticketData: {
            subject: 'COI Request',
            description: 'Generate Certificate of Insurance',
          },
          accountData: account,
          policyData: policy || null,
        },
      });

      if (error) throw error;

      if (data?.data) {
        setFormData({
          certificate_holder_name: data.data.certificate_holder_name || '',
          certificate_holder_address: data.data.certificate_holder_address || '',
          effective_date: data.data.effective_date || '',
          expiration_date: data.data.expiration_date || '',
          coverage_details: {
            general_liability: data.data.coverage_details?.general_liability || '',
            auto_liability: data.data.coverage_details?.auto_liability || '',
            workers_comp: data.data.coverage_details?.workers_comp || '',
            umbrella: data.data.coverage_details?.umbrella || '',
          },
          additional_insureds: false,
          waiver_of_subrogation: false,
          special_provisions: data.data.special_provisions || '',
        });

        toast({
          title: 'AI Generation Complete',
          description: 'COI data has been generated. Please review and adjust as needed.',
        });
      }
    } catch (error: any) {
      toast({ title: 'Failed to generate', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedCustomerId || !account) return;

    try {
      await createCOI({
        account_id: selectedCustomerId,
        certificate_holder_name: formData.certificate_holder_name,
        certificate_holder_address: { text: formData.certificate_holder_address },
        effective_date: formData.effective_date,
        expiration_date: formData.expiration_date,
        coverage_details: formData.coverage_details,
        additional_insureds: formData.additional_insureds ? ['Holder as additional insured'] : [],
        special_provisions: formData.special_provisions,
        status: 'draft',
      });
    } catch (error: any) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
    }
  };

  const handleGeneratePDF = async () => {
    if (!selectedCustomerId || !account || !formData.certificate_holder_name) {
      toast({
        title: 'Missing Information',
        description: 'Please select a customer and fill in required fields before generating PDF',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);

      // First, save the COI to get a certificate number
      const savedCOI = await createCOI({
        account_id: selectedCustomerId,
        certificate_holder_name: formData.certificate_holder_name,
        certificate_holder_address: { text: formData.certificate_holder_address },
        effective_date: formData.effective_date,
        expiration_date: formData.expiration_date,
        coverage_details: formData.coverage_details,
        additional_insureds: formData.additional_insureds ? ['Holder as additional insured'] : [],
        special_provisions: formData.special_provisions,
        status: 'draft',
      });

      // Generate and attach PDF using the hook
      const publicUrl = await generateAndAttachCOI(
        selectedCustomerId,
        savedCOI.id,
        {
          certificate_number: savedCOI.certificate_number,
          certificate_holder_name: formData.certificate_holder_name,
          certificate_holder_address: formData.certificate_holder_address,
          effective_date: formData.effective_date,
          expiration_date: formData.expiration_date,
          coverage_details: formData.coverage_details,
          additional_insureds: formData.additional_insureds ? ['Holder as additional insured'] : undefined,
          special_provisions: formData.special_provisions,
          account: account,
          policy: policy,
        }
      );

      if (publicUrl) {
        // Auto-download the generated PDF
        await downloadCOI(publicUrl, savedCOI.certificate_number);
      }
    } catch (error: any) {
      // Error already handled by the hook
      console.error('PDF generation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/customers')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Customers
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Certificate of Insurance Generator</h1>
              <p className="text-muted-foreground">
                {account?.name || 'Select a customer to begin'}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleGenerateWithAI} disabled={loading || !account}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate with AI
          </Button>
        </div>

        {/* Customer & Policy Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Select Customer & Policy
            </CardTitle>
            <CardDescription>Choose a customer and their policy to generate a certificate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Search */}
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerSearchOpen}
                      className="w-full justify-between"
                    >
                      {account ? (
                        <span className="flex items-center gap-2">
                          {account.company_name ? (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                          {account.name || account.company_name || `${account.first_name} ${account.last_name}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search customers...</span>
                      )}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search by name, company, email..."
                        value={customerSearchQuery}
                        onValueChange={setCustomerSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {customersLoading ? 'Loading customers...' : 'No customers found.'}
                        </CommandEmpty>
                        <CommandGroup heading="Customers">
                          {filteredCustomers.slice(0, 50).map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={customer.id}
                              onSelect={() => handleCustomerSelect(customer.id)}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                {customer.company_name ? (
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <User className="h-4 w-4 text-muted-foreground" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">
                                    {customer.name || customer.company_name || `${customer.first_name || ''} ${customer.last_name || ''}`}
                                  </p>
                                  {customer.email && (
                                    <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                                  )}
                                </div>
                              </div>
                              <Check
                                className={cn(
                                  "ml-auto h-4 w-4",
                                  selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Policy Selection */}
              <div className="space-y-2">
                <Label>Policy</Label>
                <Select
                  value={selectedPolicyId || ''}
                  onValueChange={setSelectedPolicyId}
                  disabled={!selectedCustomerId || customerPolicies.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      !selectedCustomerId
                        ? "Select a customer first"
                        : customerPolicies.length === 0
                        ? "No policies found"
                        : "Select a policy"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {customerPolicies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span>{p.policy_number || 'No Policy #'}</span>
                          <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                            {p.status || 'draft'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {p.policy_type || p.line_of_business}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Selected Customer Info */}
            {account && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Customer Name</p>
                    <p className="font-medium">{account.name || account.company_name || `${account.first_name} ${account.last_name}`}</p>
                  </div>
                  {account.email && (
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-medium">{account.email}</p>
                    </div>
                  )}
                  {account.phone && (
                    <div>
                      <p className="text-muted-foreground">Phone</p>
                      <p className="font-medium">{account.phone}</p>
                    </div>
                  )}
                  {policy && (
                    <div>
                      <p className="text-muted-foreground">Policy #</p>
                      <p className="font-medium">{policy.policy_number || 'N/A'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Certificate Holder Information</CardTitle>
                <CardDescription>Who is requesting the certificate?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="holder-name">Holder Name *</Label>
                  <Input
                    id="holder-name"
                    value={formData.certificate_holder_name}
                    onChange={(e) => setFormData({ ...formData, certificate_holder_name: e.target.value })}
                    placeholder="Company or Individual Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="holder-address">Holder Address *</Label>
                  <Textarea
                    id="holder-address"
                    value={formData.certificate_holder_address}
                    onChange={(e) => setFormData({ ...formData, certificate_holder_address: e.target.value })}
                    placeholder="Full mailing address"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Coverage Details</CardTitle>
                <CardDescription>Enter policy coverage amounts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="effective-date">Effective Date *</Label>
                    <Input
                      id="effective-date"
                      type="date"
                      value={formData.effective_date}
                      onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiration-date">Expiration Date *</Label>
                    <Input
                      id="expiration-date"
                      type="date"
                      value={formData.expiration_date}
                      onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gl">General Liability</Label>
                  <Input
                    id="gl"
                    value={formData.coverage_details.general_liability}
                    onChange={(e) => setFormData({
                      ...formData,
                      coverage_details: { ...formData.coverage_details, general_liability: e.target.value }
                    })}
                    placeholder="e.g., $1,000,000 per occurrence"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auto">Auto Liability</Label>
                  <Input
                    id="auto"
                    value={formData.coverage_details.auto_liability}
                    onChange={(e) => setFormData({
                      ...formData,
                      coverage_details: { ...formData.coverage_details, auto_liability: e.target.value }
                    })}
                    placeholder="e.g., $1,000,000 combined single limit"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wc">Workers Compensation</Label>
                  <Input
                    id="wc"
                    value={formData.coverage_details.workers_comp}
                    onChange={(e) => setFormData({
                      ...formData,
                      coverage_details: { ...formData.coverage_details, workers_comp: e.target.value }
                    })}
                    placeholder="e.g., Statutory limits"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="umbrella">Umbrella/Excess</Label>
                  <Input
                    id="umbrella"
                    value={formData.coverage_details.umbrella}
                    onChange={(e) => setFormData({
                      ...formData,
                      coverage_details: { ...formData.coverage_details, umbrella: e.target.value }
                    })}
                    placeholder="e.g., $2,000,000"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Additional Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="additional-insured">Certificate Holder as Additional Insured</Label>
                  <Switch
                    id="additional-insured"
                    checked={formData.additional_insureds}
                    onCheckedChange={(checked) => setFormData({ ...formData, additional_insureds: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="waiver">Waiver of Subrogation</Label>
                  <Switch
                    id="waiver"
                    checked={formData.waiver_of_subrogation}
                    onCheckedChange={(checked) => setFormData({ ...formData, waiver_of_subrogation: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provisions">Special Provisions</Label>
                  <Textarea
                    id="provisions"
                    value={formData.special_provisions}
                    onChange={(e) => setFormData({ ...formData, special_provisions: e.target.value })}
                    placeholder="Any special terms or conditions..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleSaveDraft} className="w-full" variant="outline">
                  Save as Draft
                </Button>
                <Button onClick={handleGeneratePDF} className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate PDF
                </Button>
                <Button className="w-full" variant="secondary" disabled>
                  <Send className="h-4 w-4 mr-2" />
                  Send to Customer
                </Button>
              </CardContent>
            </Card>

            {cois.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Previous COIs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cois.map((coi) => (
                    <div key={coi.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm">{coi.certificate_number}</span>
                        <Badge variant={coi.status === 'draft' ? 'outline' : 'default'}>
                          {coi.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{coi.certificate_holder_name}</p>
                      {coi.document_url && (
                        <Button 
                          size="sm" 
                          variant="link" 
                          className="p-0 h-auto mt-2"
                          onClick={() => downloadCOI(coi.document_url!, coi.certificate_number)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}