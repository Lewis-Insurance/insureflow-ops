import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCarriers, useLinesOfBusiness } from '@/hooks/useLookupData';
import { normalizePolicyType, getPolicyTypeLabel } from '@/lib/policyTypes';
import { detectEntityFromName, parseCompoundInsuredName, type EntityType } from '@/lib/insuredNames';
import { z } from 'zod';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

/**
 * Parse an insured name that may contain multiple people (e.g., "John Smith & Jane Smith")
 * Returns the primary insured name and spouse name if detected
 */
function parseInsuredNames(fullName: string): { primary: string; spouse: string | null } {
  if (!fullName) return { primary: '', spouse: null };

  // Common separators for joint insureds
  const separators = [' & ', ' and ', ' / ', ' AND ', ' And '];

  for (const sep of separators) {
    if (fullName.includes(sep)) {
      const [first, second] = fullName.split(sep).map(n => n.trim());
      if (first && second) {
        return { primary: first, spouse: second };
      }
    }
  }

  return { primary: fullName.trim(), spouse: null };
}

const customerSchema = z.object({
  name: z.string().max(200, 'Name too long').optional().or(z.literal('')),
  spouse_name: z.string().max(200, 'Spouse name too long').optional().or(z.literal('')),
  type: z.enum(['household', 'commercial_business'], { required_error: 'Account type is required' }),
  account_status: z.enum(['lead', 'active', 'churned']).optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().max(20, 'Phone number too long').optional().or(z.literal('')),
  address_line1: z.string().max(200, 'Address too long').optional().or(z.literal('')),
  address_line2: z.string().max(200, 'Address too long').optional().or(z.literal('')),
  city: z.string().max(100, 'City name too long').optional().or(z.literal('')),
  state: z.string().max(50, 'State name too long').optional().or(z.literal('')),
  zip_code: z.string().max(20, 'Zip code too long').optional().or(z.literal('')),
  source: z.string().max(100, 'Source too long').optional().or(z.literal('')),
  notes: z.string().max(2000, 'Notes too long').optional().or(z.literal('')),
  // Trust/Estate fields
  hasPrimaryEntity: z.boolean().optional(),
  primary_entity_type: z.enum(['trust', 'estate']).nullable().optional(),
  primary_entity_name: z.string().max(200, 'Entity name too long').optional().or(z.literal('')),
  trustee_name: z.string().max(200, 'Trustee name too long').optional().or(z.literal('')),
  trust_date: z.string().optional().or(z.literal('')),
  hasSecondaryEntity: z.boolean().optional(),
  secondary_entity_type: z.enum(['trust', 'estate']).nullable().optional(),
  secondary_entity_name: z.string().max(200, 'Entity name too long').optional().or(z.literal('')),
});

interface AddCustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const LEAD_SOURCES = [
  'Referral',
  'Website',
  'Phone Call',
  'Walk-in',
  'Social Media',
  'Google Ads',
  'Facebook Ads',
  'Direct Mail',
  'Email Campaign',
  'Partner',
  'Dec Page Import',
  'Other',
];

// Helper function to parse a full address string into components
function parseFullAddress(fullAddress: string): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const result = { street: '', city: '', state: '', zip: '' };

  if (!fullAddress) return result;

  // Try to extract zip code (5 digits or 5+4 format)
  const zipMatch = fullAddress.match(/\b(\d{5}(?:-\d{4})?)\b/);
  if (zipMatch) {
    result.zip = zipMatch[1];
  }

  // Try to find state abbreviation (2 uppercase letters, possibly followed by zip)
  const stateMatch = fullAddress.match(/\b([A-Z]{2})\s*(?:\d{5}|$)/i);
  if (stateMatch) {
    result.state = stateMatch[1].toUpperCase();
  }

  // Remove zip and state from address for further parsing
  let remaining = fullAddress
    .replace(/\b\d{5}(?:-\d{4})?\b/, '')
    .replace(/\b[A-Z]{2}\s*$/i, '')
    .trim();

  // Split by comma to separate street from city
  const parts = remaining.split(',').map(p => p.trim()).filter(p => p);

  if (parts.length >= 2) {
    // First part is likely the street address
    result.street = parts[0];
    // Last part (before state/zip) is likely the city
    // Check if the last part contains a state abbreviation
    const lastPart = parts[parts.length - 1];
    const cityStateMatch = lastPart.match(/^(.+?)\s+([A-Z]{2})$/i);
    if (cityStateMatch) {
      result.city = cityStateMatch[1].trim();
      result.state = cityStateMatch[2].toUpperCase();
    } else {
      result.city = lastPart;
    }
  } else if (parts.length === 1) {
    // Try to parse "123 Main St Springfield IL 62701" format (no commas)
    // This is tricky - we'll assume the state is always a 2-letter code
    const noCommaMatch = remaining.match(/^(.+?)\s+([A-Za-z\s]+?)\s+([A-Z]{2})$/i);
    if (noCommaMatch) {
      result.street = noCommaMatch[1].trim();
      result.city = noCommaMatch[2].trim();
      result.state = noCommaMatch[3].toUpperCase();
    } else {
      // Can't parse, put everything in street
      result.street = remaining;
    }
  }

  return result;
}

interface PolicyData {
  policy_number: string;
  carrier: string;
  line_of_business: string;
  policy_term: string;
  premium: string;
  effective_date: string;
  expiration_date: string;
  billing_frequency: string;
  status: string;
}

const initialPolicyData: PolicyData = {
  policy_number: '',
  carrier: '',
  line_of_business: '',
  policy_term: '6', // Default to 6-month (semi-annual) term
  premium: '',
  effective_date: '',
  expiration_date: '',
  billing_frequency: 'semiannual',
  status: 'active',
};

export function AddCustomerModal({ open, onOpenChange, onSuccess }: AddCustomerModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    spouse_name: '',
    type: 'household' as 'household' | 'commercial_business',
    account_status: 'active' as 'lead' | 'active' | 'churned',
    email: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    source: '',
    notes: '',
    // Trust/Estate fields for primary insured
    hasPrimaryEntity: false,
    primary_entity_type: null as EntityType,
    primary_entity_name: '',
    trustee_name: '',
    trust_date: '',
    // Trust/Estate fields for secondary insured
    hasSecondaryEntity: false,
    secondary_entity_type: null as EntityType,
    secondary_entity_name: '',
  });
  const [policyData, setPolicyData] = useState<PolicyData>(initialPolicyData);
  const [includePolicy, setIncludePolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch carriers and lines of business for policy
  const { data: carriers = [] } = useCarriers();
  const { data: linesOfBusiness = [] } = useLinesOfBusiness();

  const validateForm = () => {
    try {
      customerSchema.parse(formData);
      const newErrors: Record<string, string> = {};

      // Custom validation: require either name OR entity name
      const hasName = formData.name.trim().length > 0;
      const hasEntity = formData.hasPrimaryEntity && formData.primary_entity_name.trim().length > 0;

      if (!hasName && !hasEntity) {
        newErrors.name = 'Either customer name or trust/estate name is required';
      }

      // If entity toggle is on, require entity name
      if (formData.hasPrimaryEntity && !formData.primary_entity_name.trim()) {
        newErrors.primary_entity_name = 'Trust/Estate name is required';
      }

      // If secondary entity toggle is on, require secondary entity name
      if (formData.hasSecondaryEntity && !formData.secondary_entity_name.trim()) {
        newErrors.secondary_entity_name = 'Trust/Estate name is required';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return false;
      }

      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

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
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF or image file (PNG, JPG)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
        variant: 'destructive',
      });
      return;
    }

    setUploadedFile(file);
    setParsing(true);
    setParseStatus('idle');

    try {
      // Upload file to Supabase storage
      const fileName = `dec-pages/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Store the file path for later when we save the customer/policy
      setUploadedFilePath(fileName);

      // Get signed URL for the uploaded file
      const { data: urlData } = await supabase.storage
        .from('documents')
        .createSignedUrl(fileName, 3600); // 1 hour expiry

      if (!urlData?.signedUrl) {
        throw new Error('Failed to get signed URL');
      }

      // Get current user for the document analysis
      const { data: { user } } = await supabase.auth.getUser();

      // Generate a unique document ID
      const documentId = crypto.randomUUID();

      // Call document analysis edge function with correct parameters
      const { data: analysisResult, error: analysisError } = await supabase.functions
        .invoke('ai-document-analysis-azure', {
          body: {
            document_url: urlData.signedUrl,
            document_id: documentId,
            file_name: file.name,
            account_id: null, // No account yet, we're creating one
            user_id: user?.id || null,
          },
        });

      if (analysisError) {
        throw new Error(`Analysis failed: ${analysisError.message}`);
      }

      // Extract data from analysis result - check various possible field names
      const extracted = analysisResult?.analysis || analysisResult?.data || analysisResult?.extracted_data || {};

      // Auto-fill customer form
      const newFormData = { ...formData };
      // Parse insured name - detect trusts, estates, and joint insureds
      if (extracted.insured_name) {
        // First check for trust/estate patterns
        const entityParsed = parseCompoundInsuredName(extracted.insured_name);

        if (entityParsed.entityType) {
          // We detected a trust or estate
          newFormData.hasPrimaryEntity = true;
          newFormData.primary_entity_type = entityParsed.entityType;
          newFormData.primary_entity_name = entityParsed.entityName || '';

          // If there's also a person name (e.g., "Brian Lewis AND The Lewis Trust")
          if (entityParsed.personName) {
            newFormData.name = entityParsed.personName;
          }
        } else {
          // No trust/estate - use regular name parsing for joint insureds
          const names = parseInsuredNames(extracted.insured_name);
          newFormData.name = names.primary;
          if (names.spouse) {
            newFormData.spouse_name = names.spouse;
            // Auto-set to household if we detected a spouse
            newFormData.type = 'household';
          }
        }
      }

      // Try to get address from property object or direct fields
      const fullAddress = extracted.property?.address || extracted.insured_address || '';

      // Parse address - try to extract street, city, state, zip from full address
      // Common formats: "123 Main St, Springfield, IL 62701" or "123 Main St, Springfield IL 62701"
      if (fullAddress) {
        const addressParts = parseFullAddress(fullAddress);
        if (addressParts.street) newFormData.address_line1 = addressParts.street;
        if (addressParts.city) newFormData.city = addressParts.city;
        if (addressParts.state && US_STATES.includes(addressParts.state)) {
          newFormData.state = addressParts.state;
        }
        if (addressParts.zip) newFormData.zip_code = addressParts.zip;
      }

      // Also check for separately extracted fields (override parsed values if present)
      if (extracted.insured_city) newFormData.city = extracted.insured_city;
      if (extracted.insured_state) {
        const stateUpper = String(extracted.insured_state).toUpperCase();
        if (US_STATES.includes(stateUpper)) {
          newFormData.state = stateUpper;
        }
      }
      if (extracted.insured_zip) newFormData.zip_code = extracted.insured_zip;
      if (extracted.insured_phone) newFormData.phone = extracted.insured_phone;
      if (extracted.insured_email) newFormData.email = extracted.insured_email;

      // Determine account type from document_type or line of business
      const docType = (extracted.document_type || '').toLowerCase();
      const lob = (extracted.line_of_business || '').toLowerCase();
      if (docType.includes('commercial') || lob.includes('commercial') || lob.includes('business') || lob.includes('gl') || lob.includes('bop')) {
        newFormData.type = 'commercial_business';
      }

      newFormData.source = 'Dec Page Import';
      setFormData(newFormData);

      // Auto-fill policy data
      const newPolicyData = { ...policyData };
      if (extracted.policy_number) newPolicyData.policy_number = extracted.policy_number;
      // AI returns 'carrier' not 'carrier_name'
      if (extracted.carrier) newPolicyData.carrier = extracted.carrier;

      // Map line_of_business - use centralized normalizePolicyType helper
      if (extracted.line_of_business) {
        const normalizedType = normalizePolicyType(extracted.line_of_business);
        newPolicyData.line_of_business = normalizedType
          ? getPolicyTypeLabel(normalizedType)
          : extracted.line_of_business;
      } else if (extracted.document_type && extracted.document_type.toLowerCase() !== 'application') {
        const normalizedType = normalizePolicyType(extracted.document_type);
        if (normalizedType) {
          newPolicyData.line_of_business = getPolicyTypeLabel(normalizedType);
        }
      }
      if (extracted.effective_date) {
        // Try to parse and format the date
        const date = new Date(extracted.effective_date);
        if (!isNaN(date.getTime())) {
          newPolicyData.effective_date = date.toISOString().split('T')[0];
        }
      }
      if (extracted.expiration_date) {
        const date = new Date(extracted.expiration_date);
        if (!isNaN(date.getTime())) {
          newPolicyData.expiration_date = date.toISOString().split('T')[0];
        }
      }
      // Premium can be an object {total, frequency} or a simple value
      const premiumValue = typeof extracted.premium === 'object'
        ? extracted.premium?.total
        : extracted.premium;
      if (premiumValue) {
        const premiumStr = String(premiumValue).replace(/[$,]/g, '');
        const premiumNum = parseFloat(premiumStr);
        if (!isNaN(premiumNum)) {
          newPolicyData.premium = premiumNum.toString();
        }
      }
      setPolicyData(newPolicyData);

      // Enable policy creation only if we have BOTH required fields
      // (matches save logic which requires both policy_number AND carrier)
      if (extracted.policy_number && extracted.carrier) {
        setIncludePolicy(true);
      }

      setParseStatus('success');
      toast({
        title: 'Document parsed successfully',
        description: 'Customer and policy information has been extracted. Please review and make any corrections.',
      });
    } catch (error) {
      console.error('Document parsing error:', error);
      setParseStatus('error');
      toast({
        title: 'Parsing failed',
        description: error instanceof Error ? error.message : 'Failed to parse document',
        variant: 'destructive',
      });
    } finally {
      setParsing(false);
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
  }, [formData, policyData]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
    setUploadedFilePath(null);
    setParseStatus('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  async function handleSave() {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Create customer
      const customerData = {
        name: formData.name.trim() || null,
        spouse_name: formData.type === 'household' && formData.spouse_name.trim() ? formData.spouse_name.trim() : null,
        type: formData.type,
        account_status: formData.account_status,
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        address_line1: formData.address_line1.trim() || null,
        address_line2: formData.address_line2.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state || null,
        zip_code: formData.zip_code.trim() || null,
        source: formData.source || null,
        notes: formData.notes.trim() || null,
        // Trust/Estate fields for primary insured
        primary_entity_type: formData.hasPrimaryEntity ? formData.primary_entity_type : null,
        primary_entity_name: formData.hasPrimaryEntity && formData.primary_entity_name.trim() ? formData.primary_entity_name.trim() : null,
        trustee_name: formData.hasPrimaryEntity && formData.primary_entity_type === 'trust' && formData.trustee_name.trim() ? formData.trustee_name.trim() : null,
        trust_date: formData.hasPrimaryEntity && formData.primary_entity_type === 'trust' && formData.trust_date ? formData.trust_date : null,
        // Trust/Estate fields for secondary insured
        secondary_entity_type: formData.type === 'household' && formData.hasSecondaryEntity ? formData.secondary_entity_type : null,
        secondary_entity_name: formData.type === 'household' && formData.hasSecondaryEntity && formData.secondary_entity_name.trim() ? formData.secondary_entity_name.trim() : null,
      };

      const { data: newCustomer, error: customerError } = await supabase
        .from('accounts')
        .insert([customerData])
        .select()
        .single();

      if (customerError) {
        toast({
          title: 'Error creating customer',
          description: customerError.message,
          variant: 'destructive',
        });
        return;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      let createdPolicyId: string | null = null;

      // Create policy if enabled and has required data
      if (includePolicy && policyData.policy_number && policyData.carrier) {
        const policyInsertData = {
          account_id: newCustomer.id,
          insured_user_id: user?.id || null,
          policy_number: policyData.policy_number.trim(),
          carrier: policyData.carrier.trim(),
          line_of_business: policyData.line_of_business.trim() || null,
          policy_term: policyData.policy_term || null,
          premium: policyData.premium ? parseFloat(policyData.premium.replace(/,/g, '')) : null,
          effective_date: policyData.effective_date || null,
          expiration_date: policyData.expiration_date || null,
          billing_frequency: policyData.billing_frequency as 'annual' | 'monthly' | 'quarterly' | 'semiannual',
          status: policyData.status,
        };

        const { data: newPolicy, error: policyError } = await supabase
          .from('policies')
          .insert([policyInsertData])
          .select('id')
          .single();

        if (policyError) {
          toast({
            title: 'Customer created, but policy failed',
            description: policyError.message,
            variant: 'destructive',
          });
        } else {
          createdPolicyId = newPolicy?.id || null;
        }
      }

      // Save uploaded document to customer's documents if we have one
      if (uploadedFile && uploadedFilePath) {
        try {
          // Create a document record linking to the customer (and policy if created)
          // Using correct column names from documents table schema
          const documentRecord = {
            account_id: newCustomer.id,
            policy_id: createdPolicyId,
            name: uploadedFile.name, // Display name shown in UI
            filename: uploadedFile.name,
            storage_path: uploadedFilePath,
            storage_bucket: 'documents',
            mime_type: uploadedFile.type,
            file_size: uploadedFile.size,
            size_bytes: uploadedFile.size,
            kind: 'application',
            category: 'application',
          };

          const { error: docError } = await supabase
            .from('documents')
            .insert([documentRecord]);

          if (docError) {
            console.error('Failed to save document record:', docError);
            toast({
              title: 'Note',
              description: 'Customer saved but document record failed: ' + docError.message,
            });
          }
        } catch (docErr) {
          console.error('Error saving document:', docErr);
        }
      }

      // Show success message
      if (includePolicy && policyData.policy_number && policyData.carrier && createdPolicyId) {
        toast({
          title: 'Success',
          description: uploadedFile
            ? 'Customer, policy, and document added successfully'
            : 'Customer and policy added successfully',
        });
      } else {
        toast({
          title: 'Success',
          description: uploadedFile
            ? 'Customer and document added successfully'
            : 'Customer added successfully',
        });
      }

      // Reset form
      setFormData({
        name: '',
        spouse_name: '',
        type: 'household',
        account_status: 'active',
        email: '',
        phone: '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        zip_code: '',
        source: '',
        notes: '',
        hasPrimaryEntity: false,
        primary_entity_type: null,
        primary_entity_name: '',
        trustee_name: '',
        trust_date: '',
        hasSecondaryEntity: false,
        secondary_entity_type: null,
        secondary_entity_name: '',
      });
      setPolicyData(initialPolicyData);
      setIncludePolicy(false);
      setUploadedFile(null);
      setUploadedFilePath(null);
      setParseStatus('idle');
      setErrors({});
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add customer',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handlePolicyChange = (field: string, value: string) => {
    setPolicyData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          {/* Drag and Drop Zone */}
          <Card
            className={`border-2 border-dashed transition-colors cursor-pointer ${
              isDragging
                ? 'border-primary bg-primary/5'
                : parseStatus === 'success'
                ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                : parseStatus === 'error'
                ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="py-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2 text-center">
                {parsing ? (
                  <>
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <p className="font-medium">Analyzing document...</p>
                    <p className="text-sm text-muted-foreground">
                      Extracting customer and policy information
                    </p>
                  </>
                ) : uploadedFile ? (
                  <>
                    <div className="flex items-center gap-2">
                      {parseStatus === 'success' ? (
                        <CheckCircle className="h-8 w-8 text-green-500" />
                      ) : parseStatus === 'error' ? (
                        <AlertCircle className="h-8 w-8 text-red-500" />
                      ) : (
                        <FileText className="h-8 w-8 text-primary" />
                      )}
                      <div className="text-left">
                        <p className="font-medium">{uploadedFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {parseStatus === 'success'
                            ? 'Document parsed - review extracted data below'
                            : parseStatus === 'error'
                            ? 'Parsing failed - enter data manually'
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
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">Drag & drop a Dec Page or Policy</p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse (PDF, PNG, JPG)
                    </p>
                    <Badge variant="secondary" className="mt-2">
                      Auto-fills customer and policy info
                    </Badge>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className={formData.type === 'household' ? '' : 'col-span-2'}>
              <Label htmlFor="name">{formData.hasPrimaryEntity ? 'Individual Name (optional)' : 'Customer Name *'}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder={formData.type === 'household' ? "Primary Insured Name" : "Business Name"}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive mt-1">{errors.name}</p>
              )}

              {/* Trust/Estate Toggle for Primary Insured */}
              <div className="flex items-center gap-2 mt-3">
                <Switch
                  id="primary-entity-toggle"
                  checked={formData.hasPrimaryEntity}
                  onCheckedChange={(checked) => {
                    setFormData(prev => ({
                      ...prev,
                      hasPrimaryEntity: checked,
                      primary_entity_type: checked ? 'trust' : null,
                      primary_entity_name: checked ? prev.primary_entity_name : '',
                      trustee_name: checked ? prev.trustee_name : '',
                      trust_date: checked ? prev.trust_date : '',
                    }));
                  }}
                />
                <Label htmlFor="primary-entity-toggle" className="text-sm font-normal">Add Trust or Estate</Label>
              </div>

              {formData.hasPrimaryEntity && (
                <div className="space-y-3 pl-4 border-l-2 border-muted mt-3">
                  <div>
                    <Label htmlFor="primary_entity_type">Entity Type *</Label>
                    <Select
                      value={formData.primary_entity_type || 'trust'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, primary_entity_type: value as EntityType }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trust">Trust</SelectItem>
                        <SelectItem value="estate">Estate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="primary_entity_name">
                      {formData.primary_entity_type === 'estate' ? 'Estate Name *' : 'Trust Name *'}
                    </Label>
                    <Input
                      id="primary_entity_name"
                      value={formData.primary_entity_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, primary_entity_name: e.target.value }))}
                      placeholder={formData.primary_entity_type === 'estate'
                        ? 'Estate of John Smith'
                        : 'The Smith Family Trust'}
                    />
                  </div>

                  {formData.primary_entity_type === 'trust' && (
                    <>
                      <div>
                        <Label htmlFor="trustee_name">Trustee Name</Label>
                        <Input
                          id="trustee_name"
                          value={formData.trustee_name}
                          onChange={(e) => setFormData(prev => ({ ...prev, trustee_name: e.target.value }))}
                          placeholder="Brian Lewis, Trustee"
                        />
                      </div>
                      <div>
                        <Label htmlFor="trust_date">Trust Date</Label>
                        <Input
                          id="trust_date"
                          type="date"
                          value={formData.trust_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, trust_date: e.target.value }))}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {formData.type === 'household' && (
              <div>
                <Label htmlFor="spouse_name">{formData.hasSecondaryEntity ? 'Spouse Name (optional)' : 'Spouse / Co-Insured'}</Label>
                <Input
                  id="spouse_name"
                  value={formData.spouse_name}
                  onChange={(e) => handleInputChange('spouse_name', e.target.value)}
                  placeholder="Second Named Insured"
                />

                {/* Trust/Estate Toggle for Secondary Insured */}
                <div className="flex items-center gap-2 mt-3">
                  <Switch
                    id="secondary-entity-toggle"
                    checked={formData.hasSecondaryEntity}
                    onCheckedChange={(checked) => {
                      setFormData(prev => ({
                        ...prev,
                        hasSecondaryEntity: checked,
                        secondary_entity_type: checked ? 'trust' : null,
                        secondary_entity_name: checked ? prev.secondary_entity_name : '',
                      }));
                    }}
                  />
                  <Label htmlFor="secondary-entity-toggle" className="text-sm font-normal">Add Trust or Estate</Label>
                </div>

                {formData.hasSecondaryEntity && (
                  <div className="space-y-3 pl-4 border-l-2 border-muted mt-3">
                    <div>
                      <Label htmlFor="secondary_entity_type">Entity Type *</Label>
                      <Select
                        value={formData.secondary_entity_type || 'trust'}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, secondary_entity_type: value as EntityType }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trust">Trust</SelectItem>
                          <SelectItem value="estate">Estate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="secondary_entity_name">
                        {formData.secondary_entity_type === 'estate' ? 'Estate Name *' : 'Trust Name *'}
                      </Label>
                      <Input
                        id="secondary_entity_name"
                        value={formData.secondary_entity_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, secondary_entity_name: e.target.value }))}
                        placeholder={formData.secondary_entity_type === 'estate'
                          ? 'Estate of Jane Smith'
                          : 'The Smith Family Trust'}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="type">Account Type *</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger className={errors.type ? 'border-destructive' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="household">Household (Personal)</SelectItem>
                  <SelectItem value="commercial_business">Commercial Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="account_status">Status</Label>
              <Select value={formData.account_status} onValueChange={(value) => handleInputChange('account_status', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="customer@example.com"
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">{errors.email}</p>
              )}
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <Label htmlFor="address_line1">Address Line 1</Label>
            <Input
              id="address_line1"
              value={formData.address_line1}
              onChange={(e) => handleInputChange('address_line1', e.target.value)}
              placeholder="123 Main Street"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder="Springfield"
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Select value={formData.state} onValueChange={(value) => handleInputChange('state', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="zip_code">Zip Code</Label>
              <Input
                id="zip_code"
                value={formData.zip_code}
                onChange={(e) => handleInputChange('zip_code', e.target.value)}
                placeholder="12345"
              />
            </div>
          </div>

          {/* Lead Source */}
          <div>
            <Label htmlFor="source">Lead Source</Label>
            <Select value={formData.source} onValueChange={(value) => handleInputChange('source', value)}>
              <SelectTrigger>
                <SelectValue placeholder="How did they hear about you?" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map(source => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Policy Toggle */}
          <div className="flex items-center justify-between border-t pt-4">
            <div className="space-y-0.5">
              <Label htmlFor="include-policy">Also add a policy</Label>
              <p className="text-sm text-muted-foreground">
                Create a policy record along with this customer
              </p>
            </div>
            <Switch
              id="include-policy"
              checked={includePolicy}
              onCheckedChange={setIncludePolicy}
            />
          </div>

          {/* Policy Fields */}
          {includePolicy && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="policy_number">Policy Number *</Label>
                    <Input
                      id="policy_number"
                      value={policyData.policy_number}
                      onChange={(e) => handlePolicyChange('policy_number', e.target.value)}
                      placeholder="POL-2025-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="carrier">Carrier *</Label>
                    <Input
                      id="carrier"
                      list="carrier-suggestions"
                      value={policyData.carrier}
                      onChange={(e) => handlePolicyChange('carrier', e.target.value)}
                      placeholder="Type or select carrier"
                    />
                    <datalist id="carrier-suggestions">
                      {carriers.map(carrier => (
                        <option key={carrier.id} value={carrier.name} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="line_of_business">Policy Type</Label>
                    <Input
                      id="line_of_business"
                      list="lob-suggestions"
                      value={policyData.line_of_business}
                      onChange={(e) => handlePolicyChange('line_of_business', e.target.value)}
                      placeholder="e.g., Auto, Home"
                    />
                    <datalist id="lob-suggestions">
                      {linesOfBusiness.map(lob => (
                        <option key={lob.id} value={lob.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <Label htmlFor="policy_term">Policy Term</Label>
                    <Select value={policyData.policy_term} onValueChange={(value) => handlePolicyChange('policy_term', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select term" />
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
                      value={policyData.premium}
                      onChange={(e) => handlePolicyChange('premium', e.target.value)}
                      placeholder="1200.00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="effective_date">Effective Date</Label>
                    <Input
                      id="effective_date"
                      type="date"
                      value={policyData.effective_date}
                      onChange={(e) => handlePolicyChange('effective_date', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="expiration_date">Expiration Date</Label>
                    <Input
                      id="expiration_date"
                      type="date"
                      value={policyData.expiration_date}
                      onChange={(e) => handlePolicyChange('expiration_date', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="billing_frequency">Billing Frequency</Label>
                    <Select value={policyData.billing_frequency} onValueChange={(value) => handlePolicyChange('billing_frequency', value)}>
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
                    <Label htmlFor="policy_status">Status</Label>
                    <Select value={policyData.status} onValueChange={(value) => handlePolicyChange('status', value)}>
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
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Additional notes about this customer..."
              rows={2}
            />
          </div>
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="flex justify-end gap-2 pt-4 border-t mt-4 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || parsing} className="bg-green-600 hover:bg-green-700">
            {loading ? 'Adding...' : includePolicy ? 'Add Customer & Policy' : 'Add Customer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
