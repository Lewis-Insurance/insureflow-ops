// ============================================
// ACORD Form View Page
// Read-only view of a completed ACORD form
// ============================================

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Edit,
  FileText,
  Download,
  Building2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Eye,
  Copy,
  Send,
  PenTool,
  History,
  FileSignature,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAcordForms } from '@/hooks/useAcordForms';
import { getSignedStorageUrl } from '@/lib/storageUrl';
import { SignatureRequestModal, SignatureStatusTracker } from '@/components/signatures';
import type { SignatureStatus, SubmissionStatus } from '@/types/acord';

// ============================================
// COMPONENT
// ============================================

export default function AcordFormView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { generatePdf, generating, getAuditHistory } = useAcordForms();

  const [form, setForm] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  useEffect(() => {
    if (id) {
      loadFormData(id);
    }
  }, [id]);

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
            section_definitions
          )
        `)
        .eq('id', formId)
        .single();

      if (formError) throw formError;

      setForm(formData);
      setTemplate(formData.acord_templates);

      // Resolve a short-lived signed URL from the stored object path (Batch 6A)
      // for opening / sending the generated PDF; falls back to the legacy URL.
      const fd = formData as any;
      if (fd.pdf_path || fd.pdf_url) {
        setPdfSignedUrl((await getSignedStorageUrl('documents', fd.pdf_path ?? fd.pdf_url)) ?? '');
      } else {
        setPdfSignedUrl('');
      }

      // Load account data
      if (formData.account_id) {
        const { data: accountData } = await supabase
          .from('accounts')
          .select('id, name, address_line1, city, state, zip_code, phone, email')
          .eq('id', formData.account_id)
          .single();

        if (accountData) {
          setAccount(accountData);
        }
      }

      // Load audit history
      const history = await getAuditHistory(formId);
      setAuditHistory(history);

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

  const handleGeneratePdf = async () => {
    if (!id) return;
    const pdfUrl = await generatePdf(id);
    if (pdfUrl) {
      loadFormData(id);
    }
  };

  const getStatusBadge = (status: SubmissionStatus) => {
    const configs: Record<SubmissionStatus, { variant: any; icon: any; color: string }> = {
      draft: { variant: 'secondary', icon: Edit, color: 'text-gray-600' },
      ready: { variant: 'default', icon: CheckCircle, color: 'text-blue-600' },
      submitted: { variant: 'outline', icon: Send, color: 'text-purple-600' },
      accepted: { variant: 'default', icon: CheckCircle, color: 'text-green-600' },
      rejected: { variant: 'destructive', icon: AlertTriangle, color: 'text-red-600' },
      pending_info: { variant: 'outline', icon: Clock, color: 'text-yellow-600' },
    };
    const config = configs[status] || configs.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="capitalize">
        <Icon className={`h-3 w-3 mr-1 ${config.color}`} />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getSignatureBadge = (status: SignatureStatus) => {
    const configs: Record<SignatureStatus, { variant: any; icon: any }> = {
      unsigned: { variant: 'secondary', icon: PenTool },
      pending: { variant: 'outline', icon: Clock },
      signed: { variant: 'default', icon: CheckCircle },
      declined: { variant: 'destructive', icon: AlertTriangle },
      expired: { variant: 'outline', icon: AlertTriangle },
    };
    const config = configs[status] || configs.unsigned;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="capitalize">
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
  };

  const calculateCompletion = (): number => {
    if (!template?.field_inventory || !form?.field_values) return 0;
    const inventory = template.field_inventory;
    const values = form.field_values;
    const filledCount = Object.keys(values).filter(k => values[k] !== null && values[k] !== undefined && values[k] !== '').length;
    return inventory.length > 0 ? Math.round((filledCount / inventory.length) * 100) : 0;
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

  const fieldValues = form.field_values || {};
  const completionPct = calculateCompletion();

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/acord-forms')}>
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
            {getStatusBadge(form.submission_status)}
            {getSignatureBadge(form.signature_status)}
            <Button variant="outline" onClick={() => setShowAudit(!showAudit)}>
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
            {form.pdf_url && form.signature_status !== 'signed' && (
              <Button variant="outline" onClick={() => setShowSignatureModal(true)}>
                <FileSignature className="h-4 w-4 mr-2" />
                Send for Signature
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(`/acord-forms/${id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {form.pdf_url ? (
              <Button onClick={() => pdfSignedUrl && window.open(pdfSignedUrl, '_blank')} disabled={!pdfSignedUrl}>
                <Eye className="h-4 w-4 mr-2" />
                View PDF
              </Button>
            ) : (
              <Button onClick={handleGeneratePdf} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Generate PDF
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {/* Left sidebar */}
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
                {account?.address_line1 && (
                  <p className="text-sm text-muted-foreground">{account.address_line1}</p>
                )}
                {account?.city && account?.state && (
                  <p className="text-sm text-muted-foreground">{account.city}, {account.state} {account.zip_code}</p>
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
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(fieldValues).length} fields filled
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Form Metadata */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(form.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{new Date(form.updated_at).toLocaleDateString()}</span>
                </div>
                {form.submitted_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted</span>
                    <span>{new Date(form.submitted_at).toLocaleDateString()}</span>
                  </div>
                )}
                {form.submitted_to_carrier && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Carrier</span>
                    <span>{form.submitted_to_carrier}</span>
                  </div>
                )}
              </CardContent>
            </Card>

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

          {/* Main content */}
          <div className="col-span-3">
            {showAudit ? (
              <Card>
                <CardHeader>
                  <CardTitle>Change History</CardTitle>
                  <CardDescription>
                    Track all changes made to this form
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {auditHistory.length > 0 ? (
                    <ScrollArea className="h-96">
                      <div className="space-y-3">
                        {auditHistory.map((entry) => (
                          <div key={entry.id} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                            <History className="h-4 w-4 mt-1 text-muted-foreground" />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{entry.field_name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(entry.changed_at).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {entry.old_value ? (
                                  <>
                                    <span className="line-through">{entry.old_value}</span>
                                    {' → '}
                                  </>
                                ) : null}
                                <span className="text-foreground">{entry.new_value || '(empty)'}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Source: {entry.change_source}
                                {entry.profiles?.full_name && ` • ${entry.profiles.full_name}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No changes recorded yet</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Form Data</CardTitle>
                  <CardDescription>
                    All field values for this ACORD form
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.keys(fieldValues).length > 0 ? (
                    <ScrollArea className="h-[500px]">
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(fieldValues).map(([key, value]) => (
                          <div key={key} className="p-3 bg-muted rounded-lg">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                              {key.replace(/_/g, ' ')}
                            </p>
                            <p className="mt-1">
                              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '-')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-medium mb-2">No data entered yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Start filling out this form to see the data here
                      </p>
                      <Button onClick={() => navigate(`/acord-forms/${id}/edit`)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Form
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Signature Request Modal */}
      <SignatureRequestModal
        open={showSignatureModal}
        onOpenChange={setShowSignatureModal}
        documentUrl={pdfSignedUrl}
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
    </AppLayout>
  );
}
