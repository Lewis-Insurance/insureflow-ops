import { useState, useCallback, useRef, useEffect } from 'react';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { CustomerSearchSelect } from './CustomerSearchSelect';
import { useLeadConversion, NewAccountData, PolicyData } from '@/hooks/useLeadConversion';
import { useDecPageImport, DecPageParseResult } from '@/hooks/useDecPageImport';
import { useCarriers, useLinesOfBusiness } from '@/hooks/useLookupData';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Lead } from '@/types/leads';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  User,
  Users,
  Building2,
  Home,
  ArrowRight,
  ArrowLeft,
  FileCheck,
  ClipboardList,
  UserCheck,
} from 'lucide-react';

interface ConvertLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
}

type Step = 'customer' | 'document' | 'policy' | 'review';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

export function ConvertLeadModal({ open, onOpenChange, lead }: ConvertLeadModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { convertLead, isConverting } = useLeadConversion();
  const { uploadAndParse, isUploading, isParsing, progress, reset: resetDecPage } = useDecPageImport();
  const { data: carriers = [] } = useCarriers();
  const { data: linesOfBusiness = [] } = useLinesOfBusiness();

  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('customer');

  // Customer selection state
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('new');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newCustomerData, setNewCustomerData] = useState<NewAccountData>({
    name: '',
    type: 'household',
    email: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    spouse_name: '',
    source: 'Lead Conversion',
  });

  // Document import state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<DecPageParseResult | null>(null);
  const [parseStatus, setParseStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Policy state
  const [policyData, setPolicyData] = useState<PolicyData>({
    policy_number: '',
    carrier: '',
    line_of_business: '',
    effective_date: '',
    expiration_date: '',
    premium: 0,
    policy_term: '6',
    billing_frequency: 'semiannual',
    status: 'active',
  });

  // Counts for review
  const [relatedCounts, setRelatedCounts] = useState({
    documents: 0,
    tasks: 0,
    communications: 0,
  });

  // Initialize form with lead data
  useEffect(() => {
    if (lead && open) {
      // Pre-fill new customer data from lead
      setNewCustomerData({
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        type: 'household',
        email: lead.email || '',
        phone: lead.phone || '',
        address_line1: lead.address_line1 || lead.address || '',
        address_line2: lead.address_line2 || '',
        city: lead.city || '',
        state: lead.state || '',
        zip_code: lead.zip_code || '',
        spouse_name: '',
        source: 'Lead Conversion',
      });

      // Pre-fill policy data from lead
      const insuranceType = lead.insurance_types?.[0] || '';
      const lobMatch = linesOfBusiness.find(
        (l) => l.name.toLowerCase().includes(insuranceType.toLowerCase())
      );

      setPolicyData({
        policy_number: '',
        carrier: lead.current_carrier || '',
        line_of_business: lobMatch?.name || insuranceType || '',
        effective_date: '',
        expiration_date: '',
        premium: lead.current_premium || lead.estimated_premium || 0,
        policy_term: '6',
        billing_frequency: 'semiannual',
        status: 'active',
      });

      // Fetch related counts
      fetchRelatedCounts();
    }
  }, [lead, open, linesOfBusiness]);

  const fetchRelatedCounts = async () => {
    if (!lead?.id) return;

    // Count documents
    const { count: docCount } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('related_entity_type', 'lead')
      .eq('related_entity_id', lead.id);

    // Count tasks
    const { count: taskCount } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'lead')
      .eq('entity_id', lead.id);

    // Count communications
    let commCount = 0;
    if (lead.account_id) {
      const { count } = await supabase
        .from('communications')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', lead.account_id);
      commCount = count || 0;
    }

    setRelatedCounts({
      documents: docCount || 0,
      tasks: taskCount || 0,
      communications: commCount,
    });
  };

  // Document handling
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF or image file (PNG, JPG)',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
        variant: 'destructive',
      });
      return;
    }

    setUploadedFile(file);
    setParseStatus('idle');

    try {
      const result = await uploadAndParse(file);
      setParseResult(result);
      setUploadedFilePath(result.storage_path || null);
      setParseStatus('success');

      // Auto-fill policy data from parsed result
      if (result.policy) {
        setPolicyData((prev) => ({
          ...prev,
          policy_number: result.policy.policy_number || prev.policy_number,
          carrier: result.policy.carrier || prev.carrier,
          line_of_business: result.policy.policy_type || prev.line_of_business,
          effective_date: result.policy.effective_date || prev.effective_date,
          expiration_date: result.policy.expiration_date || prev.expiration_date,
          premium: result.policy.premium || prev.premium,
        }));
      }

      // Auto-fill customer data from parsed result if creating new
      if (customerMode === 'new' && result.insured) {
        setNewCustomerData((prev) => ({
          ...prev,
          name: result.insured.full_name || `${result.insured.first_name || ''} ${result.insured.last_name || ''}`.trim() || prev.name,
          email: result.insured.email || prev.email,
          phone: result.insured.phone || prev.phone,
          address_line1: result.insured.address?.street || prev.address_line1,
          city: result.insured.address?.city || prev.city,
          state: result.insured.address?.state || prev.state,
          zip_code: result.insured.address?.zip || prev.zip_code,
        }));
      }
    } catch (error) {
      console.error('Document parsing error:', error);
      setParseStatus('error');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [customerMode]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
    setUploadedFilePath(null);
    setParseResult(null);
    setParseStatus('idle');
    resetDecPage();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Navigation
  const steps: Step[] = ['customer', 'document', 'policy', 'review'];
  const currentStepIndex = steps.indexOf(currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case 'customer':
        if (customerMode === 'existing') {
          return !!selectedAccountId;
        }
        return newCustomerData.name.trim().length > 0;
      case 'document':
        return true; // Document is optional
      case 'policy':
        return (
          policyData.policy_number.trim().length > 0 &&
          policyData.carrier.trim().length > 0
        );
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const nextStep = () => {
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) {
      setCurrentStep(steps[idx + 1]);
    }
  };

  const prevStep = () => {
    const idx = steps.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(steps[idx - 1]);
    }
  };

  // Conversion
  const handleConvert = async () => {
    try {
      const result = await convertLead({
        leadId: lead.id,
        existingAccountId: customerMode === 'existing' ? selectedAccountId || undefined : undefined,
        newAccountData: customerMode === 'new' ? newCustomerData : undefined,
        policyData: {
          policy_number: policyData.policy_number,
          carrier: policyData.carrier,
          line_of_business: policyData.line_of_business,
          effective_date: policyData.effective_date,
          expiration_date: policyData.expiration_date,
          premium: policyData.premium,
          policy_term: policyData.policy_term,
          billing_frequency: policyData.billing_frequency,
          status: policyData.status,
        },
        importedDocumentPath: uploadedFilePath || undefined,
        importedDocumentName: uploadedFile?.name,
      });

      onOpenChange(false);

      // Navigate to the customer page
      navigate(`/customers/${result.accountId}`);
    } catch (error) {
      console.error('Conversion error:', error);
    }
  };

  // Reset on close
  const handleClose = (open: boolean) => {
    if (!open) {
      setCurrentStep('customer');
      setCustomerMode('new');
      setSelectedAccountId(null);
      clearUploadedFile();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-success" />
            Convert Lead to Customer
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 px-2">
          {steps.map((step, idx) => (
            <div key={step} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 ${
                  idx < currentStepIndex
                    ? 'bg-success text-success-foreground'
                    : idx === currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {idx < currentStepIndex ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  idx + 1
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 ${
                    idx < currentStepIndex ? 'bg-success' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {/* Step 1: Customer Selection */}
          {currentStep === 'customer' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold">Select or Create Customer</h3>
                <p className="text-sm text-muted-foreground">
                  Link this lead to an existing customer or create a new one
                </p>
              </div>

              <RadioGroup
                value={customerMode}
                onValueChange={(v) => setCustomerMode(v as 'existing' | 'new')}
                className="grid grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem
                    value="existing"
                    id="existing"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="existing"
                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <Users className="mb-2 h-6 w-6" />
                    <span className="font-medium">Existing Customer</span>
                    <span className="text-xs text-muted-foreground">
                      Add policy to existing account
                    </span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem
                    value="new"
                    id="new"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="new"
                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <User className="mb-2 h-6 w-6" />
                    <span className="font-medium">New Customer</span>
                    <span className="text-xs text-muted-foreground">
                      Create a new customer account
                    </span>
                  </Label>
                </div>
              </RadioGroup>

              {customerMode === 'existing' && (
                <div className="space-y-4">
                  <Label>Search Existing Customers</Label>
                  <CustomerSearchSelect
                    value={selectedAccountId || undefined}
                    onSelect={setSelectedAccountId}
                    onCreateNew={() => setCustomerMode('new')}
                    placeholder="Search by name, spouse, or email..."
                  />
                </div>
              )}

              {customerMode === 'new' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className={newCustomerData.type === 'household' ? '' : 'col-span-2'}>
                      <Label htmlFor="name">Customer Name *</Label>
                      <Input
                        id="name"
                        value={newCustomerData.name}
                        onChange={(e) =>
                          setNewCustomerData({ ...newCustomerData, name: e.target.value })
                        }
                        placeholder={newCustomerData.type === 'household' ? 'Primary Insured Name' : 'Business Name'}
                      />
                    </div>
                    {newCustomerData.type === 'household' && (
                      <div>
                        <Label htmlFor="spouse">Spouse / Co-Insured</Label>
                        <Input
                          id="spouse"
                          value={newCustomerData.spouse_name}
                          onChange={(e) =>
                            setNewCustomerData({ ...newCustomerData, spouse_name: e.target.value })
                          }
                          placeholder="Second Named Insured"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="type">Account Type</Label>
                      <Select
                        value={newCustomerData.type}
                        onValueChange={(v) =>
                          setNewCustomerData({ ...newCustomerData, type: v as 'household' | 'commercial_business' })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="household">
                            <div className="flex items-center gap-2">
                              <Home className="h-4 w-4" />
                              Household (Personal)
                            </div>
                          </SelectItem>
                          <SelectItem value="commercial_business">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              Commercial Business
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newCustomerData.email}
                        onChange={(e) =>
                          setNewCustomerData({ ...newCustomerData, email: e.target.value })
                        }
                        placeholder="email@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={newCustomerData.phone}
                        onChange={(e) =>
                          setNewCustomerData({ ...newCustomerData, phone: e.target.value })
                        }
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={newCustomerData.address_line1}
                        onChange={(e) =>
                          setNewCustomerData({ ...newCustomerData, address_line1: e.target.value })
                        }
                        placeholder="123 Main Street"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={newCustomerData.city}
                        onChange={(e) =>
                          setNewCustomerData({ ...newCustomerData, city: e.target.value })
                        }
                        placeholder="Springfield"
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Select
                        value={newCustomerData.state}
                        onValueChange={(v) =>
                          setNewCustomerData({ ...newCustomerData, state: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="zip">Zip Code</Label>
                      <Input
                        id="zip"
                        value={newCustomerData.zip_code}
                        onChange={(e) =>
                          setNewCustomerData({ ...newCustomerData, zip_code: e.target.value })
                        }
                        placeholder="12345"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Document Import */}
          {currentStep === 'document' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold">Import Document (Optional)</h3>
                <p className="text-sm text-muted-foreground">
                  Upload a dec page or application to auto-fill policy details
                </p>
              </div>

              <Card
                className={`border-2 border-dashed transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : parseStatus === 'success'
                    ? 'border-success/50 bg-success/10'
                    : parseStatus === 'error'
                    ? 'border-destructive/50 bg-destructive/10'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <CardContent className="py-8">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-3 text-center">
                    {isUploading || isParsing ? (
                      <>
                        <Loader2 className="h-12 w-12 text-primary animate-spin" />
                        <p className="font-medium">
                          {isUploading ? 'Uploading...' : 'Analyzing document...'}
                        </p>
                        <Progress value={progress} className="w-48" />
                        <p className="text-sm text-muted-foreground">
                          Extracting customer and policy information
                        </p>
                      </>
                    ) : uploadedFile ? (
                      <>
                        <div className="flex items-center gap-3">
                          {parseStatus === 'success' ? (
                            <CheckCircle className="h-10 w-10 text-success" />
                          ) : parseStatus === 'error' ? (
                            <AlertCircle className="h-10 w-10 text-destructive" />
                          ) : (
                            <FileText className="h-10 w-10 text-primary" />
                          )}
                          <div className="text-left">
                            <p className="font-medium">{uploadedFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {parseStatus === 'success'
                                ? 'Document parsed - policy info extracted'
                                : parseStatus === 'error'
                                ? 'Parsing failed - enter policy manually'
                                : 'Processing...'}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearUploadedFile();
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        {parseResult && parseStatus === 'success' && (
                          <div className="mt-4 p-4 bg-muted rounded-lg text-left w-full">
                            <p className="text-sm font-medium mb-2">Extracted Information:</p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {parseResult.policy.policy_number && (
                                <div>
                                  <span className="text-muted-foreground">Policy #:</span>{' '}
                                  {parseResult.policy.policy_number}
                                </div>
                              )}
                              {parseResult.policy.carrier && (
                                <div>
                                  <span className="text-muted-foreground">Carrier:</span>{' '}
                                  {parseResult.policy.carrier}
                                </div>
                              )}
                              {parseResult.policy.premium && (
                                <div>
                                  <span className="text-muted-foreground">Premium:</span> $
                                  {parseResult.policy.premium.toLocaleString()}
                                </div>
                              )}
                              {parseResult.policy.effective_date && (
                                <div>
                                  <span className="text-muted-foreground">Effective:</span>{' '}
                                  {parseResult.policy.effective_date}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Upload className="h-12 w-12 text-muted-foreground" />
                        <p className="font-medium">Drag & drop a Dec Page or Application</p>
                        <p className="text-sm text-muted-foreground">
                          or click to browse (PDF, PNG, JPG)
                        </p>
                        <Badge variant="secondary" className="mt-2">
                          Auto-fills policy information
                        </Badge>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="text-center">
                <Button variant="ghost" onClick={nextStep}>
                  Skip this step
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Policy Creation */}
          {currentStep === 'policy' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold">Create Policy</h3>
                <p className="text-sm text-muted-foreground">
                  Enter the policy details for this customer
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="policy_number">Policy Number *</Label>
                    <Input
                      id="policy_number"
                      value={policyData.policy_number}
                      onChange={(e) =>
                        setPolicyData({ ...policyData, policy_number: e.target.value })
                      }
                      placeholder="POL-2025-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="carrier">Carrier *</Label>
                    <Input
                      id="carrier"
                      list="carrier-suggestions"
                      value={policyData.carrier}
                      onChange={(e) =>
                        setPolicyData({ ...policyData, carrier: e.target.value })
                      }
                      placeholder="Type or select carrier"
                    />
                    <datalist id="carrier-suggestions">
                      {carriers.map((carrier) => (
                        <option key={carrier.id} value={carrier.name} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="lob">Policy Type</Label>
                    <Input
                      id="lob"
                      list="lob-suggestions"
                      value={policyData.line_of_business}
                      onChange={(e) =>
                        setPolicyData({ ...policyData, line_of_business: e.target.value })
                      }
                      placeholder="e.g., Auto, Home"
                    />
                    <datalist id="lob-suggestions">
                      {linesOfBusiness.map((lob) => (
                        <option key={lob.id} value={lob.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <Label htmlFor="term">Policy Term</Label>
                    <Select
                      value={policyData.policy_term}
                      onValueChange={(v) =>
                        setPolicyData({ ...policyData, policy_term: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Month</SelectItem>
                        <SelectItem value="3">3 Months</SelectItem>
                        <SelectItem value="6">6 Months</SelectItem>
                        <SelectItem value="12">12 Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="premium">Premium</Label>
                    <Input
                      id="premium"
                      type="number"
                      step="0.01"
                      value={policyData.premium || ''}
                      onChange={(e) =>
                        setPolicyData({
                          ...policyData,
                          premium: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="1200.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="effective">Effective Date</Label>
                    <Input
                      id="effective"
                      type="date"
                      value={policyData.effective_date}
                      onChange={(e) =>
                        setPolicyData({ ...policyData, effective_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="expiration">Expiration Date</Label>
                    <Input
                      id="expiration"
                      type="date"
                      value={policyData.expiration_date}
                      onChange={(e) =>
                        setPolicyData({ ...policyData, expiration_date: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="billing">Billing Frequency</Label>
                    <Select
                      value={policyData.billing_frequency}
                      onValueChange={(v) =>
                        setPolicyData({
                          ...policyData,
                          billing_frequency: v as PolicyData['billing_frequency'],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="semiannual">Semi-Annual</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={policyData.status}
                      onValueChange={(v) =>
                        setPolicyData({ ...policyData, status: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="quoted">Quoted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 'review' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold">Review & Confirm</h3>
                <p className="text-sm text-muted-foreground">
                  Review the conversion details before proceeding
                </p>
              </div>

              <div className="space-y-4">
                {/* Customer Summary */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Customer
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-3">
                    {customerMode === 'new' ? (
                      <div className="space-y-1">
                        <p className="font-medium">{newCustomerData.name}</p>
                        {newCustomerData.spouse_name && (
                          <p className="text-sm text-muted-foreground">
                            Spouse: {newCustomerData.spouse_name}
                          </p>
                        )}
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          {newCustomerData.email && <span>{newCustomerData.email}</span>}
                          {newCustomerData.phone && <span>{newCustomerData.phone}</span>}
                        </div>
                        <Badge variant="outline" className="mt-2">
                          {newCustomerData.type === 'commercial_business'
                            ? 'Commercial Business'
                            : 'Household'}
                        </Badge>
                        <Badge variant="secondary" className="ml-2">
                          New Customer
                        </Badge>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        Adding to existing customer
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Policy Summary */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      Policy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Policy #:</span>{' '}
                        <span className="font-medium">{policyData.policy_number}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Carrier:</span>{' '}
                        <span className="font-medium">{policyData.carrier}</span>
                      </div>
                      {policyData.line_of_business && (
                        <div>
                          <span className="text-muted-foreground">Type:</span>{' '}
                          {policyData.line_of_business}
                        </div>
                      )}
                      {policyData.premium > 0 && (
                        <div>
                          <span className="text-muted-foreground">Premium:</span> $
                          {policyData.premium.toLocaleString()}
                        </div>
                      )}
                      {policyData.effective_date && (
                        <div>
                          <span className="text-muted-foreground">Effective:</span>{' '}
                          {formatLocalDateDisplay(policyData.effective_date)}
                        </div>
                      )}
                      {policyData.expiration_date && (
                        <div>
                          <span className="text-muted-foreground">Expires:</span>{' '}
                          {formatLocalDateDisplay(policyData.expiration_date)}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Data Migration Summary */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      Data to Transfer
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-3">
                    <div className="flex gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{relatedCounts.documents} documents</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span>{relatedCounts.tasks} tasks</span>
                      </div>
                      {relatedCounts.communications > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{relatedCounts.communications} communications</span>
                        </div>
                      )}
                    </div>
                    {lead.notes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Lead notes will be appended to customer record
                      </p>
                    )}
                    {uploadedFile && (
                      <p className="text-sm text-muted-foreground mt-1">
                        + 1 imported document ({uploadedFile.name})
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Lead Status Update */}
                <Card className="bg-success/10 border-success/30">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 text-success">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">
                        Lead status will be set to "Won"
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t shrink-0">
          <Button
            variant="outline"
            onClick={currentStepIndex === 0 ? () => handleClose(false) : prevStep}
          >
            {currentStepIndex === 0 ? (
              'Cancel'
            ) : (
              <>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </>
            )}
          </Button>

          {currentStep === 'review' ? (
            <Button
              onClick={handleConvert}
              disabled={isConverting}
              className="bg-success hover:bg-success/90 text-success-foreground"
            >
              {isConverting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Convert to Customer
                </>
              )}
            </Button>
          ) : (
            <Button onClick={nextStep} disabled={!canProceed()}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
