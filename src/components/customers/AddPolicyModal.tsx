import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCarriers, useLinesOfBusiness } from '@/hooks/useLookupData';
import { generateTasks } from '@/lib/taskAutomation';
import { calcExpirationDate, parsePolicyTerm } from '@/lib/policyDates';
import { format } from 'date-fns';
import { z } from 'zod';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

const policySchema = z.object({
  policy_number: z.string().min(1, 'Policy number is required').max(50, 'Policy number too long'),
  carrier: z.string().min(1, 'Carrier is required').max(100, 'Carrier name too long'),
  line_of_business: z.string().min(1, 'Line of business is required').max(100, 'Line of business too long'),
  premium: z.string().optional(),
  effective_date: z.string().min(1, 'Effective date is required'),
  expiration_date: z.string().min(1, 'Expiration date is required'),
  billing_frequency: z.string().optional(),
  policy_term: z.string().optional(),
  status: z.string().min(1, 'Status is required'),
});

interface AddPolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onSuccess?: () => void;
}

export function AddPolicyModal({ open, onOpenChange, accountId, onSuccess }: AddPolicyModalProps) {
  const [formData, setFormData] = useState({
    policy_number: '',
    carrier: '',
    line_of_business: '',
    premium: '',
    effective_date: '',
    expiration_date: '',
    billing_frequency: 'semiannual', // Default to semi-annual
    billing_method: 'direct_bill', // Default to direct bill
    policy_term: 'semiannual', // Default to semi-annual
    status: 'active',
  });
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch carriers and lines of business
  const { data: carriers = [], isLoading: carriersLoading } = useCarriers();
  const { data: linesOfBusiness = [], isLoading: lobLoading } = useLinesOfBusiness();

  const validateForm = () => {
    try {
      policySchema.parse(formData);
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
      const fileName = `applications/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Store the file path for later when we save the policy
      setUploadedFilePath(fileName);

      // Get current user for the document analysis
      const { data: { user } } = await supabase.auth.getUser();

      // Generate a unique document ID
      const documentId = crypto.randomUUID();

      // Get the public URL for the document
      const { data: publicUrlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      // Call document analysis edge function
      const { data: analysisResult, error: analysisError } = await supabase.functions
        .invoke('ai-document-analysis-azure', {
          body: {
            document_url: publicUrlData.publicUrl,
            document_id: documentId,
            file_name: file.name,
            account_id: accountId,
            user_id: user?.id || null,
          },
        });

      if (analysisError) {
        throw new Error(`Analysis failed: ${analysisError.message}`);
      }

      // Extract data from analysis result
      const extracted = analysisResult?.analysis || analysisResult?.data || analysisResult?.extracted_data || {};
      console.log('Extracted data from document:', extracted);

      // Auto-fill policy form
      const newFormData = { ...formData };
      if (extracted.policy_number) newFormData.policy_number = extracted.policy_number;
      if (extracted.carrier) newFormData.carrier = extracted.carrier;

      // Map line_of_business - check both line_of_business and document_type
      if (extracted.line_of_business) {
        newFormData.line_of_business = extracted.line_of_business;
      } else if (extracted.document_type) {
        // Map document_type values to friendly line of business names
        const docTypeMap: Record<string, string> = {
          'auto_policy': 'Auto',
          'auto': 'Auto',
          'home_policy': 'Home',
          'home': 'Home',
          'homeowners': 'Home',
          'commercial_policy': 'Commercial',
          'commercial': 'Commercial',
          'application': '', // Don't set LOB for generic applications
        };
        const mappedLob = docTypeMap[extracted.document_type.toLowerCase()];
        if (mappedLob) {
          newFormData.line_of_business = mappedLob;
        }
      }

      if (extracted.effective_date) {
        const date = new Date(extracted.effective_date);
        if (!isNaN(date.getTime())) {
          newFormData.effective_date = date.toISOString().split('T')[0];
        }
      }
      if (extracted.expiration_date) {
        const date = new Date(extracted.expiration_date);
        if (!isNaN(date.getTime())) {
          newFormData.expiration_date = date.toISOString().split('T')[0];
        }
      }

      // Handle premium
      const premiumValue = typeof extracted.premium === 'object'
        ? extracted.premium?.total
        : extracted.premium;
      if (premiumValue) {
        const premiumStr = String(premiumValue).replace(/[$,]/g, '');
        const premiumNum = parseFloat(premiumStr);
        if (!isNaN(premiumNum)) {
          newFormData.premium = premiumNum.toString();
        }
      }

      // Check for policy term from document
      if (extracted.policy_term_months) {
        const months = parseInt(extracted.policy_term_months);
        if (months === 6) {
          newFormData.policy_term = 'semiannual';
        } else if (months === 12) {
          newFormData.policy_term = 'annual';
        }
      }

      // Auto-detect if this is auto insurance, default to semi-annual
      // Use the mapped line_of_business which includes document_type mapping
      const lob = (newFormData.line_of_business || extracted.line_of_business || '').toLowerCase();
      const docType = (extracted.document_type || '').toLowerCase();
      if (lob.includes('auto') || lob.includes('vehicle') || lob.includes('car') || docType.includes('auto')) {
        if (!extracted.policy_term_months) {
          newFormData.policy_term = 'semiannual';
          newFormData.billing_frequency = 'semiannual';
        }
      }

      setFormData(newFormData);
      setParseStatus('success');
      toast({
        title: 'Document parsed successfully',
        description: 'Policy information has been extracted. Please review and make any corrections.',
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
  }, [formData, accountId]);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to add policies',
          variant: 'destructive',
        });
        return;
      }

      // Parse premium - remove commas and convert to number, default to 0
      const premiumValue = formData.premium
        ? parseFloat(formData.premium.replace(/,/g, ''))
        : 0;

      const policyData = {
        account_id: accountId,
        insured_user_id: user.id,
        policy_number: formData.policy_number.trim(),
        carrier: formData.carrier.trim(),
        line_of_business: formData.line_of_business.trim(),
        premium: isNaN(premiumValue) ? 0 : premiumValue,
        effective_date: formData.effective_date,
        expiration_date: formData.expiration_date,
        billing_frequency: formData.billing_frequency as 'annual' | 'monthly' | 'quarterly' | 'semiannual',
        billing_method: formData.billing_method as 'direct_bill' | 'agency_bill',
        policy_term: formData.policy_term || null,
        status: formData.status,
      };

      const { data: newPolicy, error } = await supabase
        .from('policies')
        .insert([policyData])
        .select()
        .single();

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      // Save uploaded document to the documents table
      if (uploadedFile && uploadedFilePath && newPolicy) {
        try {
          const documentRecord = {
            account_id: accountId,
            policy_id: newPolicy.id,
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
              description: 'Policy saved but document record failed: ' + docError.message,
            });
          }
        } catch (docErr) {
          console.error('Error saving document:', docErr);
        }
      }

      // Auto-generate tasks for new policy
      if (newPolicy) {
        await generateTasks('policy_issued', accountId, 'policy', newPolicy.id);
      }

      toast({
        title: 'Success',
        description: uploadedFile
          ? 'Policy and document added successfully'
          : 'Policy added successfully',
      });

      // Reset form
      setFormData({
        policy_number: '',
        carrier: '',
        line_of_business: '',
        premium: '',
        effective_date: '',
        expiration_date: '',
        billing_frequency: 'semiannual',
        billing_method: 'direct_bill',
        policy_term: 'semiannual',
        status: 'active',
      });
      setUploadedFile(null);
      setUploadedFilePath(null);
      setParseStatus('idle');
      setErrors({});
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add policy',
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

    // Auto-calculate expiration date when effective date or policy term changes
    if (field === 'effective_date' || field === 'policy_term') {
      const effectiveDate = field === 'effective_date' ? value : formData.effective_date;
      const policyTerm = field === 'policy_term' ? value : formData.policy_term;

      if (effectiveDate && policyTerm) {
        // Parse date parts manually to avoid timezone issues
        // new Date('2026-01-15') interprets as UTC midnight, which shifts in local timezone
        const [year, month, day] = effectiveDate.split('-').map(Number);
        const startDate = new Date(year, month - 1, day); // month is 0-indexed
        const term = parsePolicyTerm(policyTerm);
        const expirationDate = calcExpirationDate(startDate, term);
        const formattedDate = format(expirationDate, 'yyyy-MM-dd');
        setFormData(prev => ({ ...prev, [field]: value, expiration_date: formattedDate }));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Policy</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            <CardContent className="py-4">
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
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="font-medium">Analyzing document...</p>
                    <p className="text-sm text-muted-foreground">
                      Extracting policy information
                    </p>
                  </>
                ) : uploadedFile ? (
                  <>
                    <div className="flex items-center gap-2">
                      {parseStatus === 'success' ? (
                        <CheckCircle className="h-6 w-6 text-green-500" />
                      ) : parseStatus === 'error' ? (
                        <AlertCircle className="h-6 w-6 text-red-500" />
                      ) : (
                        <FileText className="h-6 w-6 text-primary" />
                      )}
                      <div className="text-left">
                        <p className="font-medium text-sm">{uploadedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {parseStatus === 'success'
                            ? 'Parsed - review below'
                            : parseStatus === 'error'
                            ? 'Parsing failed'
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
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="font-medium text-sm">Drag & drop an application or dec page</p>
                    <p className="text-xs text-muted-foreground">
                      or click to browse (PDF, PNG, JPG)
                    </p>
                    <Badge variant="secondary" className="mt-1">
                      Auto-fills policy info
                    </Badge>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="policy_number">Policy Number *</Label>
              <Input
                id="policy_number"
                value={formData.policy_number}
                onChange={(e) => handleInputChange('policy_number', e.target.value)}
                placeholder="POL-2024-001"
                className={errors.policy_number ? 'border-destructive' : ''}
              />
              {errors.policy_number && (
                <p className="text-sm text-destructive mt-1">{errors.policy_number}</p>
              )}
            </div>
            <div>
              <Label htmlFor="carrier">Carrier *</Label>
              <Input
                id="carrier"
                list="carrier-list"
                value={formData.carrier}
                onChange={(e) => handleInputChange('carrier', e.target.value)}
                placeholder="Type or select carrier"
                className={errors.carrier ? 'border-destructive' : ''}
              />
              <datalist id="carrier-list">
                {carriers.map(carrier => (
                  <option key={carrier.id} value={carrier.name} />
                ))}
              </datalist>
              {errors.carrier && (
                <p className="text-sm text-destructive mt-1">{errors.carrier}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="line_of_business">Line of Business *</Label>
            <Input
              id="line_of_business"
              list="lob-list"
              value={formData.line_of_business}
              onChange={(e) => handleInputChange('line_of_business', e.target.value)}
              placeholder="Type or select line of business"
              className={errors.line_of_business ? 'border-destructive' : ''}
            />
            <datalist id="lob-list">
              {linesOfBusiness.map(lob => (
                <option key={lob.id} value={lob.name} />
              ))}
            </datalist>
            {errors.line_of_business && (
              <p className="text-sm text-destructive mt-1">{errors.line_of_business}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="premium">Premium Amount</Label>
              <Input
                id="premium"
                type="number"
                step="0.01"
                min="0"
                value={formData.premium}
                onChange={(e) => handleInputChange('premium', e.target.value)}
                placeholder="1200.00"
              />
            </div>
            <div>
              <Label htmlFor="billing_frequency">Billing Frequency</Label>
              <Select value={formData.billing_frequency} onValueChange={(value) => handleInputChange('billing_frequency', value)}>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="policy_term">Policy Term</Label>
              <Select value={formData.policy_term} onValueChange={(value) => handleInputChange('policy_term', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semiannual">Semi-Annual (6 months)</SelectItem>
                  <SelectItem value="annual">Annual (12 months)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="billing_method">Billing Method</Label>
              <Select value={formData.billing_method} onValueChange={(value) => handleInputChange('billing_method', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct_bill">Direct Bill</SelectItem>
                  <SelectItem value="agency_bill">Agency Bill</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="effective_date">Effective Date *</Label>
              <Input
                id="effective_date"
                type="date"
                value={formData.effective_date}
                onChange={(e) => handleInputChange('effective_date', e.target.value)}
                className={errors.effective_date ? 'border-destructive' : ''}
              />
              {errors.effective_date && (
                <p className="text-sm text-destructive mt-1">{errors.effective_date}</p>
              )}
            </div>
            <div>
              <Label htmlFor="expiration_date">Expiration Date *</Label>
              <Input
                id="expiration_date"
                type="date"
                value={formData.expiration_date}
                onChange={(e) => handleInputChange('expiration_date', e.target.value)}
                className={errors.expiration_date ? 'border-destructive' : ''}
              />
              {errors.expiration_date && (
                <p className="text-sm text-destructive mt-1">{errors.expiration_date}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="status">Status *</Label>
            <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
              <SelectTrigger className={errors.status ? 'border-destructive' : ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="bound">Bound</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            {errors.status && (
              <p className="text-sm text-destructive mt-1">{errors.status}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || parsing} className="bg-green-600 hover:bg-green-700">
              {loading ? 'Adding...' : 'Add Policy'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
