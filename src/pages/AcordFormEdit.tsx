// ============================================
// ACORD Form Editor Page
// Fill out and edit ACORD form field values
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Save,
  FileText,
  Download,
  Building2,
  CheckCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Wand2,
  Eye,
  History,
  UserPlus,
  FileSearch,
  FileSignature,
} from 'lucide-react';
import { DocumentImportModal } from '@/components/acord/DocumentImportModal';
import { SignatureRequestModal, SignatureStatusTracker } from '@/components/signatures';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAcordForms } from '@/hooks/useAcordForms';
import type { AcordTemplate, FieldInventoryItem, SectionDefinition, ValidationResult } from '@/types/acord';

// ============================================
// TYPES
// ============================================

interface FormData {
  id: string;
  account_id: string;
  template_id: string;
  field_values: Record<string, any>;
  submission_status: string;
  signature_status: string;
  pdf_url?: string;
  created_at: string;
  updated_at: string;
}

interface AccountData {
  id: string;
  name: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  email?: string;
}

interface TemplateData extends AcordTemplate {
  form_number: string;
  form_name: string;
}

// Common ACORD 125 field sections (fallback if template has no sections)
const DEFAULT_SECTIONS = [
  { sectionNumber: 1, sectionName: 'Producer Information', fields: ['producer_name', 'producer_address', 'producer_phone', 'producer_email', 'producer_code'] },
  { sectionNumber: 2, sectionName: 'Applicant Information', fields: ['applicant_name', 'applicant_dba', 'applicant_address', 'applicant_city', 'applicant_state', 'applicant_zip', 'applicant_phone', 'applicant_email', 'applicant_fein', 'applicant_sic', 'applicant_naics'] },
  { sectionNumber: 3, sectionName: 'Contact Information', fields: ['contact_name', 'contact_phone', 'contact_email', 'inspection_contact'] },
  { sectionNumber: 4, sectionName: 'Business Information', fields: ['business_description', 'years_in_business', 'entity_type', 'annual_revenue', 'num_employees'] },
  { sectionNumber: 5, sectionName: 'Coverage Information', fields: ['effective_date', 'expiration_date', 'proposed_eff_date', 'proposed_exp_date'] },
  { sectionNumber: 6, sectionName: 'Prior Insurance', fields: ['prior_carrier', 'prior_policy_number', 'prior_expiration', 'prior_premium'] },
  { sectionNumber: 7, sectionName: 'Loss History', fields: ['losses_5_years', 'total_claims', 'total_paid', 'total_reserved'] },
];

// ============================================
// COMPONENT
// ============================================

export default function AcordFormEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { updateFieldValues, generatePdf, validateForm, generating } = useAcordForms();

  const [form, setForm] = useState<FormData | null>(null);
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [activeSection, setActiveSection] = useState('1');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // Load form data
  useEffect(() => {
    if (id) {
      loadFormData(id);
    }
  }, [id]);

  // Track unsaved changes
  useEffect(() => {
    const hasChanges = JSON.stringify(fieldValues) !== JSON.stringify(originalValues);
    setHasUnsavedChanges(hasChanges);
  }, [fieldValues, originalValues]);

  // Auto-save every 30 seconds if there are changes
  useEffect(() => {
    if (!hasUnsavedChanges || !id) return;

    const autoSaveTimer = setTimeout(() => {
      handleSave(true);
    }, 30000);

    return () => clearTimeout(autoSaveTimer);
  }, [hasUnsavedChanges, fieldValues, id]);

  const loadFormData = async (formId: string) => {
    setIsLoading(true);
    try {
      // Load form with template
      const { data: formData, error: formError } = await supabase
        .from('acord_forms')
        .select(`
          *,
          acord_templates (
            id,
            form_number,
            form_name,
            version,
            pdf_template_url,
            field_inventory,
            field_schema,
            section_definitions,
            validation_rules
          )
        `)
        .eq('id', formId)
        .single();

      if (formError) throw formError;

      setForm(formData);
      setTemplate(formData.acord_templates as TemplateData);
      setFieldValues(formData.field_values || {});
      setOriginalValues(formData.field_values || {});

      // Load account data
      if (formData.account_id) {
        const { data: accountData } = await supabase
          .from('accounts')
          .select('id, name, address_line1, address_line2, city, state, zip_code, phone, email')
          .eq('id', formData.account_id)
          .single();

        if (accountData) {
          setAccount(accountData);
        }
      }

      // Run initial validation
      const validationResult = await validateForm(formId);
      setValidation(validationResult);

    } catch (err) {
      toast({
        title: 'Error loading form',
        description: err instanceof Error ? err.message : 'Failed to load form',
        variant: 'destructive',
      });
      navigate('/acord-forms');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setFieldValues(prev => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSave = async (isAutoSave = false) => {
    if (!id || !hasUnsavedChanges) return;

    setIsSaving(true);
    try {
      const success = await updateFieldValues(id, fieldValues, isAutoSave ? 'auto_save' : 'manual');

      if (success) {
        setOriginalValues(fieldValues);
        setHasUnsavedChanges(false);

        if (!isAutoSave) {
          toast({
            title: 'Form saved',
            description: 'Your changes have been saved',
          });
        }

        // Re-validate after save
        const validationResult = await validateForm(id);
        setValidation(validationResult);
      }
    } catch (err) {
      toast({
        title: 'Error saving form',
        description: err instanceof Error ? err.message : 'Failed to save form',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!id) return;

    // Save first if there are unsaved changes
    if (hasUnsavedChanges) {
      await handleSave();
    }

    const pdfUrl = await generatePdf(id);
    if (pdfUrl) {
      // Reload form to get updated PDF URL
      loadFormData(id);
    }
  };

  const handlePullFromAccount = () => {
    if (!account) return;

    const accountMappings: Record<string, string> = {
      applicant_name: account.name || '',
      applicant_address: account.address_line1 || '',
      applicant_city: account.city || '',
      applicant_state: account.state || '',
      applicant_zip: account.zip_code || '',
      applicant_phone: account.phone || '',
      applicant_email: account.email || '',
      // Also map common ACORD field names
      NamedInsured: account.name || '',
      MailingAddress: account.address_line1 || '',
      City: account.city || '',
      State: account.state || '',
      ZipCode: account.zip_code || '',
      Phone: account.phone || '',
      Email: account.email || '',
    };

    const newValues = { ...fieldValues };
    let fieldsUpdated = 0;

    Object.entries(accountMappings).forEach(([field, value]) => {
      if (value && !newValues[field]) {
        newValues[field] = value;
        fieldsUpdated++;
      }
    });

    if (fieldsUpdated > 0) {
      setFieldValues(newValues);
      toast({
        title: 'Account data imported',
        description: `${fieldsUpdated} fields populated from account`,
      });
    } else {
      toast({
        title: 'No new data',
        description: 'All applicable fields already have values',
      });
    }
  };

  const handleDocumentImport = (extractedFields: Record<string, any>) => {
    const newValues = { ...fieldValues, ...extractedFields };
    setFieldValues(newValues);
    toast({
      title: 'Document data imported',
      description: `${Object.keys(extractedFields).length} fields populated from document`,
    });
  };

  const handleNavigation = (path: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(path);
      setShowUnsavedDialog(true);
    } else {
      navigate(path);
    }
  };

  const confirmNavigation = async (save: boolean) => {
    if (save && id) {
      await handleSave();
    }
    setShowUnsavedDialog(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
  };

  // Get sections from template or use defaults
  const getSections = (): SectionDefinition[] => {
    if (template?.section_definitions && template.section_definitions.length > 0) {
      return template.section_definitions;
    }
    return DEFAULT_SECTIONS as SectionDefinition[];
  };

  // Get fields for a section
  const getFieldsForSection = (section: SectionDefinition): FieldInventoryItem[] => {
    const inventory = template?.field_inventory || [];

    if (section.fields && section.fields.length > 0) {
      // Filter inventory to only include fields in this section
      return inventory.filter(f => section.fields.includes(f.name));
    }

    // If no specific fields defined, return all fields for now
    return inventory;
  };

  // Calculate completion percentage
  const calculateCompletion = (): number => {
    if (!template?.field_inventory) return 0;

    const requiredFields = template.field_inventory.filter(f => f.required);
    if (requiredFields.length === 0) return 100;

    const filledRequired = requiredFields.filter(f => {
      const value = fieldValues[f.name];
      return value !== null && value !== undefined && value !== '';
    });

    return Math.round((filledRequired.length / requiredFields.length) * 100);
  };

  // Render a form field based on type
  const renderField = (field: FieldInventoryItem) => {
    const value = fieldValues[field.name] ?? '';
    const hasError = validation?.errors.some(e => e.field === field.name);
    const hasWarning = validation?.warnings.some(e => e.field === field.name);

    const fieldLabel = field.tooltip || field.name.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();

    switch (field.type) {
      case 'checkbox':
        return (
          <div key={field.name} className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={!!value}
              onCheckedChange={(checked) => handleFieldChange(field.name, checked)}
            />
            <Label htmlFor={field.name} className="text-sm font-normal">
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name}>
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select value={value} onValueChange={(v) => handleFieldChange(field.name, v)}>
              <SelectTrigger className={hasError ? 'border-red-500' : hasWarning ? 'border-yellow-500' : ''}>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'radio':
        return (
          <div key={field.name} className="space-y-2">
            <Label>
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <div className="flex flex-wrap gap-4">
              {field.options?.map(opt => (
                <div key={opt} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id={`${field.name}-${opt}`}
                    name={field.name}
                    value={opt}
                    checked={value === opt}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor={`${field.name}-${opt}`} className="font-normal">{opt}</Label>
                </div>
              ))}
            </div>
          </div>
        );

      default: // text
        const isMultiline = field.maxLength && field.maxLength > 100;
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={field.name}>
              {fieldLabel}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {isMultiline ? (
              <Textarea
                id={field.name}
                value={value}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                maxLength={field.maxLength}
                className={hasError ? 'border-red-500' : hasWarning ? 'border-yellow-500' : ''}
                rows={3}
              />
            ) : (
              <Input
                id={field.name}
                value={value}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                maxLength={field.maxLength}
                className={hasError ? 'border-red-500' : hasWarning ? 'border-yellow-500' : ''}
              />
            )}
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!form || !template) {
    return (
      <AppLayout>
        <div className="container mx-auto py-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium">Form not found</h2>
              <p className="text-muted-foreground mb-4">The requested form could not be loaded.</p>
              <Button onClick={() => navigate('/acord-forms')}>Back to Forms</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const sections = getSections();
  const completionPct = calculateCompletion();

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => handleNavigation('/acord-forms')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6" />
                ACORD {template.form_number}
              </h1>
              <p className="text-muted-foreground">{template.form_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-yellow-600">
                Unsaved changes
              </Badge>
            )}
            <Button variant="outline" onClick={handlePullFromAccount} disabled={!account}>
              <UserPlus className="h-4 w-4 mr-2" />
              Pull Account Data
            </Button>
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <FileSearch className="h-4 w-4 mr-2" />
              Import Document
            </Button>
            <Button variant="outline" onClick={() => handleSave()} disabled={isSaving || !hasUnsavedChanges}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
            <Button onClick={handleGeneratePdf} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Generate PDF
            </Button>
            {form.pdf_url && form.signature_status !== 'signed' && (
              <Button variant="outline" onClick={() => setShowSignatureModal(true)}>
                <FileSignature className="h-4 w-4 mr-2" />
                Send for Signature
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {/* Left sidebar - form info */}
          <div className="space-y-4">
            {/* Account Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Account
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{account?.name || 'Unknown'}</p>
                {account?.city && account?.state && (
                  <p className="text-sm text-muted-foreground">{account.city}, {account.state}</p>
                )}
              </CardContent>
            </Card>

            {/* Completion Progress */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Completion</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progress</span>
                    <span className="font-medium">{completionPct}%</span>
                  </div>
                  <Progress value={completionPct} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Validation Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Validation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {validation?.valid ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">All validations passed</span>
                  </div>
                ) : (
                  <>
                    {validation && validation.errors.length > 0 && (
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm">{validation.errors.length} errors</span>
                      </div>
                    )}
                    {validation && validation.warnings.length > 0 && (
                      <div className="flex items-center gap-2 text-yellow-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm">{validation.warnings.length} warnings</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Section Navigation */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Sections</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-64">
                  <div className="p-4 space-y-1">
                    {sections.map((section) => (
                      <Button
                        key={section.sectionNumber}
                        variant={activeSection === String(section.sectionNumber) ? 'secondary' : 'ghost'}
                        size="sm"
                        className="w-full justify-start text-left"
                        onClick={() => setActiveSection(String(section.sectionNumber))}
                      >
                        <span className="truncate">{section.sectionNumber}. {section.sectionName}</span>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* PDF Actions */}
            {form.pdf_url && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Generated PDF</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open(form.pdf_url, '_blank')}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View PDF
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Signature Status */}
            {form.signature_status !== 'unsigned' && (
              <SignatureStatusTracker
                acordFormId={id!}
                compact
                onResend={() => {
                  toast({
                    title: 'Reminder sent',
                    description: 'A signature reminder has been sent.',
                  });
                }}
              />
            )}
          </div>

          {/* Main form area */}
          <div className="col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>
                  {sections.find(s => String(s.sectionNumber) === activeSection)?.sectionName || 'Form Fields'}
                </CardTitle>
                <CardDescription>
                  Fill in the required information for this section
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeSection} onValueChange={setActiveSection}>
                  <TabsList className="mb-4 flex-wrap h-auto">
                    {sections.map((section) => (
                      <TabsTrigger key={section.sectionNumber} value={String(section.sectionNumber)} className="text-xs">
                        {section.sectionNumber}. {section.sectionName.substring(0, 15)}...
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {sections.map((section) => {
                    const sectionFields = getFieldsForSection(section);

                    return (
                      <TabsContent key={section.sectionNumber} value={String(section.sectionNumber)}>
                        {sectionFields.length > 0 ? (
                          <div className="grid grid-cols-2 gap-4">
                            {sectionFields.map(field => renderField(field))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <p>No fields defined for this section yet.</p>
                            <p className="text-sm mt-2">
                              Upload an ACORD template with field definitions to enable form filling.
                            </p>
                          </div>
                        )}
                      </TabsContent>
                    );
                  })}
                </Tabs>

                {/* Manual field entry for any field */}
                <Separator className="my-6" />
                <div className="space-y-4">
                  <h3 className="font-medium">Quick Add Field</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter a field name manually if it's not listed above
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Field name (e.g., ProducerCode)"
                      id="manual-field-name"
                    />
                    <Input
                      placeholder="Value"
                      id="manual-field-value"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const nameInput = document.getElementById('manual-field-name') as HTMLInputElement;
                        const valueInput = document.getElementById('manual-field-value') as HTMLInputElement;
                        if (nameInput?.value && valueInput?.value) {
                          handleFieldChange(nameInput.value, valueInput.value);
                          nameInput.value = '';
                          valueInput.value = '';
                          toast({ title: 'Field added', description: `${nameInput.value} has been set` });
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Raw field values (debug view) */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Current Field Values ({Object.keys(fieldValues).length} fields)</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <pre className="text-xs bg-muted p-4 rounded">
                    {JSON.stringify(fieldValues, null, 2)}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Unsaved changes dialog */}
        <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes. Would you like to save before leaving?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => confirmNavigation(false)}>
                Don't Save
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmNavigation(true)}>
                Save & Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Document Import Modal */}
        <DocumentImportModal
          open={showImportModal}
          onOpenChange={setShowImportModal}
          accountId={form?.account_id || ''}
          acordFormId={id || ''}
          templateFormNumber={template?.form_number}
          onFieldsExtracted={handleDocumentImport}
        />

        {/* Signature Request Modal */}
        <SignatureRequestModal
          open={showSignatureModal}
          onOpenChange={setShowSignatureModal}
          documentUrl={form?.pdf_url || ''}
          documentName={`ACORD ${template?.form_number} - ${account?.name || 'Form'}`}
          formNumber={template?.form_number}
          acordFormId={id}
          defaultSigners={account ? [{ name: account.name, email: account.email }] : []}
          onSuccess={(requestId) => {
            // Reload form data to show updated signature status
            if (id) loadFormData(id);
            toast({
              title: 'Signature request created',
              description: 'The document has been sent for signature.',
            });
          }}
        />
      </div>
    </AppLayout>
  );
}
