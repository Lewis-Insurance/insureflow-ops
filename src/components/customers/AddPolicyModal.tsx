import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DuplicatePolicyDialog, type ExistingPolicyInfo } from './DuplicatePolicyDialog';
import { PolicyAlreadyOnFileDialog } from './PolicyAlreadyOnFileDialog';
import { CustomerSearchSelect, type CustomerSearchResult } from './CustomerSearchSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  PolicyFormFields,
  policySchema,
  initialPolicyFormData,
  applyPolicyFieldChange,
  mapExtractedToPolicyForm,
  buildPolicyInsert,
  type PolicyFormData,
} from './PolicyFormFields';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeForILike } from '@/lib/sanitize';
import { mapLineOfBusiness } from '@/lib/policyParserMap';
import { useToast } from '@/hooks/use-toast';
import { useCarriers, useLinesOfBusiness } from '@/hooks/useLookupData';
import { generateTasks } from '@/lib/taskAutomation';
import { z } from 'zod';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

/** Context handed to a caller-owned write that does not create a policy row. */
export interface AddPolicySecondaryActionContext {
  accountId: string;
  /** The form values as they were when the button was pressed. */
  form: PolicyFormData;
}

/** Context handed to `onAfterSave` once the policy row exists. */
export interface AddPolicyAfterSaveContext extends AddPolicySecondaryActionContext {
  policyId: string;
}

interface AddPolicyModalProps {
  open: boolean;
  /**
   * Required unless `enableCustomerSearch` is on, in which case the customer is
   * chosen inside the modal.
   */
  accountId?: string;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /**
   * Customer record pages only: when a policy number is already in use, show a
   * side-by-side compare with a "Merge Clients" shortcut instead of a raw DB
   * error. Left off elsewhere (e.g. the global Policies list, renewals).
   */
  enableDuplicateMerge?: boolean;
  /** Name of the customer whose record we're on (left panel + merge context). */
  currentCustomerName?: string;
  /**
   * Surfaces that are not already scoped to a customer (AO renewals) turn this
   * on to pick the account the policy lands on before saving.
   */
  enableCustomerSearch?: boolean;
  /** Seeds the customer search box, e.g. the name on the AO renewal row. */
  customerSearchQuery?: string;
  /** Optional copy overrides so the caller can explain why the popup is open. */
  title?: string;
  description?: string;
  submitLabel?: string;
  /**
   * Seeds the policy form when the modal opens. Applied once per open, after
   * the line-of-business lookup resolves so the value can be canonicalized.
   */
  initialValues?: Partial<PolicyFormData>;
  /**
   * Runs after the policy row is inserted and before the modal closes. Throw to
   * report a failed follow-on write: the modal keeps the policy, stays open, and
   * offers a Retry that replays this callback with the values captured at the
   * moment of failure.
   */
  onAfterSave?: (context: AddPolicyAfterSaveContext) => Promise<void>;
  /** Banner text shown when `onAfterSave` fails. */
  afterSaveErrorMessage?: string;
  /**
   * Optional second button next to the primary save, for the case where the
   * policy is already on the customer's file and only the caller's own record
   * needs updating. AO Moved uses it for "Only change status": it runs
   * `onSecondaryAction` and never touches the policies table.
   *
   * Providing it also changes what a duplicate policy number does: instead of a
   * dead-end toast, the CSR is told the policy is already on file and offered
   * this same status-only write.
   */
  secondaryActionLabel?: string;
  onSecondaryAction?: (context: AddPolicySecondaryActionContext) => Promise<void>;
  /**
   * Soft validation for the secondary action, run after the customer check.
   * Return an error message to block it, or null to let it through.
   */
  validateSecondaryAction?: (form: PolicyFormData) => string | null;
  /** Toast text when `onSecondaryAction` fails. */
  secondaryActionErrorMessage?: string;
  /** Toast text when `onSecondaryAction` succeeds. */
  secondaryActionSuccessMessage?: string;
}

export function AddPolicyModal({
  open,
  onOpenChange,
  accountId,
  onSuccess,
  enableDuplicateMerge = false,
  currentCustomerName,
  enableCustomerSearch = false,
  customerSearchQuery,
  title = 'Add New Policy',
  description,
  submitLabel = 'Add Policy',
  initialValues,
  onAfterSave,
  afterSaveErrorMessage = 'The policy was saved but the follow-up update did not go through.',
  secondaryActionLabel,
  onSecondaryAction,
  validateSecondaryAction,
  secondaryActionErrorMessage = 'The update did not go through. Please try again.',
  secondaryActionSuccessMessage = 'Status updated',
}: AddPolicyModalProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<PolicyFormData>(initialPolicyFormData);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Tracks fields where the parser returned a value but we couldn't cleanly
  // map it to a canonical option, so the user must explicitly confirm.
  const [needsConfirmation, setNeedsConfirmation] = useState<Record<string, boolean>>({});
  // Duplicate policy-number compare dialog (customer pages only).
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateExisting, setDuplicateExisting] = useState<ExistingPolicyInfo | null>(null);
  // Customer search mode (AO renewals): the account is picked inside the modal.
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [customerError, setCustomerError] = useState<string>('');
  // While the search list is open it owns the Escape key, so the modal stays put.
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  // Set when the policy insert succeeded but `onAfterSave` failed. Holds the
  // values as they were at the moment of failure so Retry replays exactly that
  // write, never whatever the form happens to show later.
  const [failedAfterSave, setFailedAfterSave] = useState<AddPolicyAfterSaveContext | null>(null);
  // Set when the insert was rejected because the policy number already exists
  // and the caller offers a status-only alternative. Holds the snapshot from
  // that attempt so the status-only write uses the values the CSR submitted.
  const [alreadyOnFile, setAlreadyOnFile] = useState<
    (AddPolicySecondaryActionContext & { policyNumber: string }) | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefillAppliedRef = useRef(false);
  const { toast } = useToast();

  // Fetch carriers and lines of business
  const { data: carriers = [], isLoading: carriersLoading } = useCarriers();
  const { data: linesOfBusiness = [], isLoading: lobLoading } = useLinesOfBusiness();

  const resolvedAccountId = enableCustomerSearch ? selectedCustomer?.id ?? '' : accountId ?? '';
  const resolvedCustomerName = enableCustomerSearch
    ? selectedCustomer?.name ?? ''
    : currentCustomerName ?? '';

  const resetForm = useCallback(() => {
    setFormData(initialPolicyFormData);
    setUploadedFile(null);
    setUploadedFilePath(null);
    setParseStatus('idle');
    setErrors({});
    setNeedsConfirmation({});
    setSelectedCustomer(null);
    setCustomerError('');
    setCustomerSearchOpen(false);
    setFailedAfterSave(null);
    setAlreadyOnFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Seeded surfaces (AO Moved) start from a clean, prefilled form every time the
  // popup opens. Plain customer pages keep their existing draft-preserving
  // behavior, so nothing changes for them.
  const isSeededSurface = enableCustomerSearch || !!initialValues;
  useEffect(() => {
    if (!open) {
      prefillAppliedRef.current = false;
      return;
    }
    if (!isSeededSurface || prefillAppliedRef.current) return;
    // Wait for the line-of-business lookup so a seeded value can be matched
    // against the canonical list instead of saved as free text.
    if (lobLoading) return;

    prefillAppliedRef.current = true;
    resetForm();

    if (!initialValues) return;

    let seeded: PolicyFormData = { ...initialPolicyFormData };
    const seededConfirmation: Record<string, boolean> = {};

    for (const [field, value] of Object.entries(initialValues)) {
      if (!value) continue;
      if (field === 'line_of_business') {
        const match = mapLineOfBusiness({ line_of_business: value }, linesOfBusiness);
        if (match.value) {
          seeded = applyPolicyFieldChange(seeded, field, match.value);
        } else {
          // Do not guess a non-canonical line of business, ask for it.
          seededConfirmation.line_of_business = true;
        }
        continue;
      }
      seeded = applyPolicyFieldChange(seeded, field, value);
    }

    setFormData(seeded);
    setNeedsConfirmation(seededConfirmation);
  }, [open, isSeededSurface, initialValues, lobLoading, linesOfBusiness, resetForm]);

  const validateForm = () => {
    let valid = true;

    if (enableCustomerSearch && !selectedCustomer) {
      setCustomerError('Choose the customer this policy belongs to.');
      valid = false;
    } else {
      setCustomerError('');
    }

    try {
      policySchema.parse(formData);
      setErrors({});
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
      valid = false;
    }

    return valid;
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
            account_id: resolvedAccountId || null,
            user_id: user?.id || null,
          },
        });

      if (analysisError) {
        throw new Error(`Analysis failed: ${analysisError.message}`);
      }

      // Extract data from analysis result
      const extracted = analysisResult?.analysis || analysisResult?.data || analysisResult?.extracted_data || {};
      console.log('Extracted data from document:', extracted);

      // Auto-fill policy form (shared mapping used by both modals)
      const { data: newFormData, needsConfirmation: newNeedsConfirmation } =
        mapExtractedToPolicyForm(extracted, carriers, linesOfBusiness);

      setFormData(newFormData);
      setNeedsConfirmation(newNeedsConfirmation);
      setParseStatus('success');
      const confirmCount = Object.values(newNeedsConfirmation).filter(Boolean).length;
      toast({
        title: 'Document parsed successfully',
        description: confirmCount > 0
          ? `Extracted policy info — please confirm ${confirmCount} highlighted field${confirmCount > 1 ? 's' : ''}.`
          : 'Policy information has been extracted. Please review and make any corrections.',
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
  }, [formData, resolvedAccountId]);

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
    setNeedsConfirmation({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // A policy number is globally unique across accounts (active policies), so a
  // collision usually means the same policy is already on another customer.
  // Look up who owns it and open the compare/merge dialog.
  async function openDuplicateDialog(policyNumber: string) {
    setDuplicateExisting(null);
    setDuplicateLoading(true);
    setDuplicateOpen(true);
    try {
      // Match the violated constraint (the active-only partial unique index):
      // case-insensitive, live rows, active statuses first, newest first. An
      // unordered limit(1) could surface an inactive twin on a DIFFERENT
      // customer and the "Merge Clients" CTA would target the wrong record.
      const { data: candidates } = await supabase
        .from('policies')
        .select('id, policy_number, carrier, line_of_business, status, account_id, created_at')
        .ilike('policy_number', sanitizeForILike(policyNumber))
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10);
      const ACTIVE = ['active', 'bound', 'pending'];
      const existing =
        candidates?.find((p) => ACTIVE.includes((p.status || '').toLowerCase())) ?? candidates?.[0] ?? null;

      if (!existing) {
        // Nothing found (e.g. an RLS-hidden record). Fall back to a plain notice.
        setDuplicateOpen(false);
        toast({
          title: 'Policy number already in use',
          description: `Policy ${policyNumber} already exists. Please check the number and try again.`,
          variant: 'destructive',
        });
        return;
      }

      const { data: acc } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('id', existing.account_id)
        .maybeSingle();

      setDuplicateExisting({ ...existing, account_name: acc?.name ?? 'Unknown customer' });
    } catch {
      setDuplicateOpen(false);
      toast({
        title: 'Policy number already in use',
        description: `Policy ${policyNumber} already exists. Please check the number and try again.`,
        variant: 'destructive',
      });
    } finally {
      setDuplicateLoading(false);
    }
  }

  async function handleSave() {
    if (!validateForm()) return;

    // Snapshot the values this save is committing. Everything below reads the
    // snapshot, so a later edit to the live form cannot change what a retry writes.
    const savedForm: PolicyFormData = { ...formData };
    const savedAccountId = resolvedAccountId;

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

      const policyData = buildPolicyInsert(savedForm, savedAccountId, user.id);

      const { data: newPolicy, error } = await supabase
        .from('policies')
        .insert([policyData])
        .select()
        .single();

      if (error) {
        // Duplicate policy number: on customer pages, show the compare/merge
        // dialog instead of a raw unique-constraint error.
        const isDuplicatePolicyNumber =
          error.code === '23505' ||
          /policies_policy_number_active_unique|duplicate key|already exists/i.test(error.message || '');
        if (enableDuplicateMerge && isDuplicatePolicyNumber) {
          await openDuplicateDialog(policyData.policy_number);
          return;
        }
        // Surfaces with a status-only alternative (AO Moved) get a second popup
        // instead of a dead-end error: the policy is already there, so the only
        // thing left to do is the caller's own write. Nothing was inserted.
        if (isDuplicatePolicyNumber && onSecondaryAction && secondaryActionLabel) {
          setAlreadyOnFile({
            accountId: savedAccountId,
            form: savedForm,
            policyNumber: policyData.policy_number,
          });
          return;
        }
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
            account_id: savedAccountId,
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

      // Auto-generate tasks for new policy. Best effort: the policy is already
      // saved, so a task-automation hiccup must not look like a failed save or
      // block the caller's follow-on write below.
      if (newPolicy) {
        try {
          await generateTasks('policy_issued', savedAccountId, 'policy', newPolicy.id);
        } catch (taskError) {
          console.error('Failed to generate policy tasks:', taskError);
        }
      }

      // Follow-on write owned by the caller (AO Moved marks the renewal). The
      // policy already exists at this point, so a failure here must never
      // re-run the insert: we hold the snapshot and offer a targeted retry.
      if (onAfterSave && newPolicy) {
        const context: AddPolicyAfterSaveContext = {
          accountId: savedAccountId,
          policyId: newPolicy.id,
          form: savedForm,
        };
        try {
          await onAfterSave(context);
        } catch (afterSaveError) {
          setFailedAfterSave(context);
          toast({
            title: 'Policy saved, follow-up failed',
            description: afterSaveErrorMessage,
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: 'Success',
        description: uploadedFile
          ? 'Policy and document added successfully'
          : 'Policy added successfully',
      });

      resetForm();
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

  /**
   * Replay only the follow-on write, using the snapshot taken when it failed.
   * The policy row is already in place, so nothing here touches the form.
   */
  async function handleRetryAfterSave() {
    if (!failedAfterSave || !onAfterSave) return;

    setLoading(true);
    try {
      await onAfterSave(failedAfterSave);
      setFailedAfterSave(null);
      toast({ title: 'Success', description: 'Follow-up update saved' });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Still not saved',
        description: afterSaveErrorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  /**
   * The caller's status-only write. No policy row is created, which is the
   * whole point: the replacement policy is already on the customer's file.
   * Takes the snapshot to write explicitly, so the "already on file" dialog
   * commits the values that were submitted rather than a later edit.
   */
  async function runSecondaryAction(context: AddPolicySecondaryActionContext) {
    if (!onSecondaryAction) return;

    setLoading(true);
    try {
      await onSecondaryAction(context);
      toast({ title: 'Success', description: secondaryActionSuccessMessage });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Not saved',
        description: secondaryActionErrorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  /**
   * The secondary button on the form. Validates only what the caller's write
   * needs (never the full policy schema, since no policy is being created).
   */
  function handleSecondaryAction() {
    if (!onSecondaryAction) return;

    if (enableCustomerSearch && !selectedCustomer) {
      setCustomerError('Choose the customer this policy belongs to.');
      toast({
        title: 'Customer required',
        description: 'Choose the customer this policy belongs to.',
        variant: 'destructive',
      });
      return;
    }
    setCustomerError('');

    const message = validateSecondaryAction?.(formData);
    if (message) {
      toast({ title: 'Missing information', description: message, variant: 'destructive' });
      return;
    }

    void runSecondaryAction({ accountId: resolvedAccountId, form: { ...formData } });
  }

  /**
   * Closing after a failed follow-up still leaves a real policy behind, so the
   * caller has to refresh even though its own write did not land.
   */
  function handleClose() {
    const policySaved = !!failedAfterSave;
    // Customer pages have always kept an abandoned draft around; only the
    // seeded surfaces (and a half-completed save) start over.
    if (isSeededSurface || policySaved) resetForm();
    setFailedAfterSave(null);
    setAlreadyOnFile(null);
    setCustomerError('');
    setCustomerSearchOpen(false);
    onOpenChange(false);
    if (policySaved) onSuccess?.();
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => applyPolicyFieldChange(prev, field, value));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    if (needsConfirmation[field]) {
      setNeedsConfirmation(prev => ({ ...prev, [field]: false }));
    }
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else handleClose();
      }}
    >
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(event) => {
          // Escape belongs to the customer search list while it is open.
          if (customerSearchOpen) {
            event.preventDefault();
            setCustomerSearchOpen(false);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          {enableCustomerSearch && (
            <div>
              <Label htmlFor="add-policy-customer">Customer *</Label>
              <CustomerSearchSelect
                id="add-policy-customer"
                value={selectedCustomer}
                onChange={(customer) => {
                  setSelectedCustomer(customer);
                  if (customer) setCustomerError('');
                }}
                searchOpen={customerSearchOpen}
                onSearchOpenChange={setCustomerSearchOpen}
                initialQuery={customerSearchQuery}
                error={customerError}
                disabled={loading || !!failedAfterSave}
              />
            </div>
          )}

          {/* Drag and Drop Zone */}
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
                        <CheckCircle className="h-6 w-6 text-success" />
                      ) : parseStatus === 'error' ? (
                        <AlertCircle className="h-6 w-6 text-destructive" />
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

          <PolicyFormFields
            value={formData}
            onChange={handleInputChange}
            errors={errors}
            needsConfirmation={needsConfirmation}
            carriers={carriers}
            linesOfBusiness={linesOfBusiness}
            lobLoading={lobLoading}
          />

          {failedAfterSave && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Policy saved, follow-up did not</p>
                  <p className="text-sm text-muted-foreground">
                    {afterSaveErrorMessage} Retry sends the same values again. Nothing you change in
                    the form below will be re-saved.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={handleClose} disabled={loading}>
              {failedAfterSave ? 'Close' : 'Cancel'}
            </Button>
            {failedAfterSave ? (
              <Button onClick={handleRetryAfterSave} disabled={loading}>
                {loading ? 'Retrying...' : 'Retry'}
              </Button>
            ) : (
              <>
                {/* Outline, not a second fill: one primary fill per surface. */}
                {onSecondaryAction && secondaryActionLabel && (
                  <Button variant="outline" onClick={handleSecondaryAction} disabled={loading || parsing}>
                    {secondaryActionLabel}
                  </Button>
                )}
                <Button onClick={handleSave} disabled={loading || parsing} className="bg-green-600 hover:bg-green-700">
                  {loading ? 'Adding...' : submitLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <DuplicatePolicyDialog
      open={duplicateOpen}
      onOpenChange={setDuplicateOpen}
      loading={duplicateLoading}
      attempted={{
        policy_number: formData.policy_number.trim(),
        carrier: formData.carrier.trim(),
        line_of_business: formData.line_of_business.trim(),
      }}
      existing={duplicateExisting}
      currentCustomerName={resolvedCustomerName}
      currentAccountId={resolvedAccountId}
      onMerge={(existingAccountId) => {
        setDuplicateOpen(false);
        onOpenChange(false);
        navigate(`/merge-customers?masterId=${resolvedAccountId}&duplicateId=${existingAccountId}`);
      }}
      onSeePolicy={(policyId) => {
        setDuplicateOpen(false);
        onOpenChange(false);
        navigate(`/policies/${policyId}`);
      }}
    />

    {/* Duplicate policy number on a surface that offers a status-only write.
        Cancel returns to the form with nothing saved; the confirm runs the
        caller's write without inserting a second policy. */}
    {secondaryActionLabel && (
      <PolicyAlreadyOnFileDialog
        open={!!alreadyOnFile}
        onOpenChange={(next) => { if (!next) setAlreadyOnFile(null); }}
        policyNumber={alreadyOnFile?.policyNumber ?? ''}
        confirmLabel={secondaryActionLabel}
        loading={loading}
        onConfirm={() => {
          if (!alreadyOnFile) return;
          const { policyNumber: _ignored, ...context } = alreadyOnFile;
          void runSecondaryAction(context);
        }}
      />
    )}
    </>
  );
}
