// ============================================
// Public Intake Page
// No authentication required - uses token-based access
// Includes rate limiting and honeypot protection
// ============================================

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { IntakeRenderer } from '@/components/intake/IntakeRenderer';
import { useIntakeAutoSave, shouldShowRestoreDialog } from '@/hooks/useIntakeAutoSave';
import { supabase } from '@/integrations/supabase/client';
import { hashAccessToken } from '@/types/intake';
import type { IntakeTemplate, IntakeSubmission } from '@/types/intake';
import {
  AlertCircle,
  RefreshCw,
  Clock,
  Mail,
  FileText,
  ShieldAlert,
  CheckCircle,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface TokenValidation {
  valid: boolean;
  expired: boolean;
  submission?: IntakeSubmission;
  template?: IntakeTemplate;
  rateLimited?: boolean;
  error?: string;
}

// ============================================
// COMPONENT
// ============================================

export default function PublicIntake() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<TokenValidation | null>(null);
  const [template, setTemplate] = useState<IntakeTemplate | null>(null);
  const [submission, setSubmission] = useState<IntakeSubmission | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [initialResponses, setInitialResponses] = useState<Record<string, any>>({});
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [showEmailCapture, setShowEmailCapture] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  // Auto-save hook
  const autoSave = useIntakeAutoSave({
    intakeId: template?.id || '',
    submissionId: submission?.id,
    enabled: !!submission,
  });

  // ============================================
  // TOKEN VALIDATION
  // ============================================

  useEffect(() => {
    if (!token) {
      setValidation({ valid: false, expired: false, error: 'No access token provided' });
      setLoading(false);
      return;
    }

    validateToken();
  }, [token]);

  const validateToken = async () => {
    setLoading(true);

    try {
      // Hash the token for lookup
      const tokenHash = await hashAccessToken(token!);

      // Check rate limiting first
      const rateLimitCheck = await checkRateLimit();
      if (rateLimitCheck.blocked) {
        setValidation({
          valid: false,
          expired: false,
          rateLimited: true,
          error: `Too many requests. Please try again in ${rateLimitCheck.retryAfter} minutes.`,
        });
        setLoading(false);
        return;
      }

      // Look up submission by token hash
      const { data: submissionData, error: submissionError } = await supabase
        .from('intake_submissions')
        .select(`
          *,
          intake_templates (*)
        `)
        .eq('access_token_hash', tokenHash)
        .single();

      if (submissionError || !submissionData) {
        setValidation({
          valid: false,
          expired: false,
          error: 'Invalid or expired access link',
        });
        setLoading(false);
        return;
      }

      // Check expiration
      const expiresAt = new Date(submissionData.token_expires_at);
      if (expiresAt < new Date()) {
        setValidation({
          valid: false,
          expired: true,
          error: 'This link has expired. Please request a new one.',
        });
        setLoading(false);
        return;
      }

      // Check if already submitted
      if (submissionData.status === 'submitted') {
        setValidation({
          valid: false,
          expired: false,
          error: 'This form has already been submitted.',
        });
        setLoading(false);
        return;
      }

      // Transform template data
      const templateData = submissionData.intake_templates as any;
      const parsedTemplate: IntakeTemplate = {
        ...templateData,
        questions: templateData.questions || [],
        dynamic_sections: templateData.dynamic_sections || {},
        settings: templateData.settings || {
          allowSaveDraft: true,
          showProgressBar: true,
          requireEmail: true,
          sendConfirmationEmail: true,
          notifyOnSubmission: [],
          expirationDays: 30,
          rateLimit: { maxRequests: 10, windowHours: 1 },
        },
        branding: templateData.branding || {},
      };

      setTemplate(parsedTemplate);
      setSubmission(submissionData);

      // Check for existing responses
      if (submissionData.draft_responses && Object.keys(submissionData.draft_responses).length > 0) {
        setInitialResponses(submissionData.draft_responses);
      } else if (submissionData.responses && Object.keys(submissionData.responses).length > 0) {
        setInitialResponses(submissionData.responses);
      }

      // Pre-fill email/name if available
      if (submissionData.client_email) setClientEmail(submissionData.client_email);
      if (submissionData.client_name) setClientName(submissionData.client_name);

      // Check for local saved progress
      const restorePrompt = autoSave.checkForSavedProgress();
      if (shouldShowRestoreDialog(restorePrompt)) {
        setShowRestoreDialog(true);
      }

      // Show email capture if required and not already provided
      if (parsedTemplate.settings.requireEmail && !submissionData.client_email) {
        setShowEmailCapture(true);
      }

      setValidation({ valid: true, expired: false, submission: submissionData, template: parsedTemplate });
    } catch (error) {
      console.error('Token validation error:', error);
      setValidation({
        valid: false,
        expired: false,
        error: 'An error occurred. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RATE LIMITING
  // ============================================

  const checkRateLimit = async (): Promise<{ blocked: boolean; retryAfter?: number }> => {
    try {
      // Get client IP (this would need server-side implementation)
      // For now, we'll use a simplified client-side approach
      const clientId = getClientIdentifier();

      const { data, error } = await supabase
        .from('intake_rate_limits')
        .select('*')
        .eq('ip_address', clientId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" which is fine
        throw error;
      }

      if (!data) {
        // First request - create rate limit record
        await supabase.from('intake_rate_limits').insert({
          ip_address: clientId,
          request_count: 1,
          first_request_at: new Date().toISOString(),
        });
        return { blocked: false };
      }

      // Check if blocked
      if (data.blocked_until && new Date(data.blocked_until) > new Date()) {
        const retryAfter = Math.ceil(
          (new Date(data.blocked_until).getTime() - Date.now()) / 60000
        );
        return { blocked: true, retryAfter };
      }

      // Check if window has reset
      const windowStart = new Date(data.first_request_at);
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000); // 1 hour

      if (new Date() > windowEnd) {
        // Reset window
        await supabase
          .from('intake_rate_limits')
          .update({
            request_count: 1,
            first_request_at: new Date().toISOString(),
            blocked_until: null,
          })
          .eq('ip_address', clientId);
        return { blocked: false };
      }

      // Increment counter
      const newCount = (data.request_count || 0) + 1;
      const maxRequests = template?.settings.rateLimit?.maxRequests || 10;

      if (newCount > maxRequests) {
        // Block for the remainder of the window
        const blockUntil = windowEnd.toISOString();
        await supabase
          .from('intake_rate_limits')
          .update({
            request_count: newCount,
            blocked_until: blockUntil,
          })
          .eq('ip_address', clientId);
        return { blocked: true, retryAfter: Math.ceil((windowEnd.getTime() - Date.now()) / 60000) };
      }

      // Just increment
      await supabase
        .from('intake_rate_limits')
        .update({ request_count: newCount })
        .eq('ip_address', clientId);

      return { blocked: false };
    } catch (error) {
      console.error('Rate limit check error:', error);
      return { blocked: false }; // Fail open
    }
  };

  const getClientIdentifier = (): string => {
    // In production, this should be the client IP from headers
    // For now, use a fingerprint-like identifier
    const stored = localStorage.getItem('intake_client_id');
    if (stored) return stored;

    const id = `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('intake_client_id', id);
    return id;
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleRestoreProgress = (restore: boolean) => {
    setShowRestoreDialog(false);
    if (restore) {
      const savedState = autoSave.restoreFromLocal();
      if (savedState?.responses) {
        setInitialResponses(savedState.responses);
      }
    } else {
      autoSave.clearSavedData();
    }
  };

  const handleEmailSubmit = async () => {
    if (!submission) return;

    // Check honeypot
    if (honeypot) {
      console.log('Honeypot triggered');
      return;
    }

    await supabase
      .from('intake_submissions')
      .update({
        client_email: clientEmail,
        client_name: clientName,
      })
      .eq('id', submission.id);

    setShowEmailCapture(false);
  };

  const handleSaveDraft = async (responses: Record<string, any>) => {
    if (!submission) return;

    await supabase
      .from('intake_submissions')
      .update({
        draft_responses: responses,
        last_draft_save: new Date().toISOString(),
        status: 'in_progress',
      })
      .eq('id', submission.id);
  };

  const handleSubmit = async (responses: Record<string, any>) => {
    if (!submission) return;

    // Final honeypot check
    if (honeypot) {
      console.log('Honeypot triggered on submit');
      // Pretend to succeed but don't save
      return;
    }

    await supabase
      .from('intake_submissions')
      .update({
        responses,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', submission.id);

    // Clear local storage
    autoSave.clearSavedData();

    // Send notification emails (would be done via edge function)
    // This is just a placeholder
    if (template?.settings.sendConfirmationEmail && clientEmail) {
      console.log('Would send confirmation email to:', clientEmail);
    }

    if (template?.settings.notifyOnSubmission?.length) {
      console.log('Would notify:', template.settings.notifyOnSubmission);
    }
  };

  const handleAutoSave = (responses: Record<string, any>) => {
    autoSave.saveToLocal(responses);
  };

  // ============================================
  // RENDER STATES
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading form...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!validation?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 text-center">
            {validation?.rateLimited ? (
              <ShieldAlert className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            ) : validation?.expired ? (
              <Clock className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            ) : (
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            )}
            <h2 className="text-xl font-bold mb-2">
              {validation?.rateLimited
                ? 'Too Many Requests'
                : validation?.expired
                ? 'Link Expired'
                : 'Access Denied'}
            </h2>
            <p className="text-muted-foreground mb-6">{validation?.error}</p>
            {validation?.expired && (
              <Button variant="outline">
                <Mail className="mr-2 h-4 w-4" />
                Request New Link
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showEmailCapture) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Before You Begin</CardTitle>
            <CardDescription>
              Please provide your contact information to save your progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="john@example.com"
                required
              />
            </div>

            {/* Honeypot field - hidden from users */}
            <div className="hidden" aria-hidden="true">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name={template?.settings.honeypotFieldName || 'website_url'}
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleEmailSubmit}
              disabled={!clientEmail}
            >
              <FileText className="mr-2 h-4 w-4" />
              Continue to Form
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!template) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Honeypot field - hidden from users */}
      <div className="hidden" aria-hidden="true">
        <input
          type="text"
          name={template.settings.honeypotFieldName || 'website_url'}
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <IntakeRenderer
        template={template}
        initialResponses={initialResponses}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        onAutoSave={handleAutoSave}
        showProgressBar={template.settings.showProgressBar}
      />

      {/* Restore Progress Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume Your Progress?</AlertDialogTitle>
            <AlertDialogDescription>
              We found saved progress from a previous session. Would you like to
              continue where you left off?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleRestoreProgress(false)}>
              Start Fresh
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleRestoreProgress(true)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Resume Progress
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom CSS from branding */}
      {template.branding?.customCss && (
        <style dangerouslySetInnerHTML={{ __html: template.branding.customCss }} />
      )}
    </div>
  );
}
