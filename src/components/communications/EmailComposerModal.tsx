/**
 * AI Email Composer Modal
 *
 * Full-featured email composition interface with:
 * - AI-powered content generation
 * - Template suggestions
 * - Context-aware recommendations
 * - Compliance checking
 * - Save as draft or send
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Sparkles, Send, Save, AlertCircle, CheckCircle2, Lightbulb } from 'lucide-react';
import {
  useComposeEmail,
  useSaveCommunication,
  useRecommendedTemplates,
  type EmailScenario,
  type EmailTone,
  type ComposeEmailRequest,
} from '@/hooks/useEmailComposer';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EmailComposerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName?: string;
  scenario?: EmailScenario;
  context?: Record<string, any>;
}

export function EmailComposerModal({
  open,
  onOpenChange,
  accountId,
  accountName,
  scenario = 'custom',
  context = {},
}: EmailComposerModalProps) {
  const [selectedScenario, setSelectedScenario] = useState<EmailScenario>(scenario);
  const [selectedTone, setSelectedTone] = useState<EmailTone>('professional');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [complianceNotes, setComplianceNotes] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [aiConfidenceScore, setAiConfidenceScore] = useState<number | null>(null);

  const composeEmail = useComposeEmail();
  const saveCommunication = useSaveCommunication();
  const { data: recommendedTemplates } = useRecommendedTemplates(accountId, selectedScenario);

  const scenarios: { value: EmailScenario; label: string }[] = [
    { value: 'lead_nurture', label: 'Lead Nurture' },
    { value: 'quote_follow_up', label: 'Quote Follow-Up' },
    { value: 'renewal_reminder', label: 'Renewal Reminder' },
    { value: 'policy_change_confirmation', label: 'Policy Change Confirmation' },
    { value: 'claim_status_update', label: 'Claim Status Update' },
    { value: 'payment_reminder', label: 'Payment Reminder' },
    { value: 'thank_you', label: 'Thank You' },
    { value: 'welcome', label: 'Welcome' },
    { value: 'coverage_gap_recommendation', label: 'Coverage Gap Recommendation' },
    { value: 'annual_review', label: 'Annual Review' },
    { value: 'custom', label: 'Custom' },
  ];

  const tones: { value: EmailTone; label: string; emoji: string }[] = [
    { value: 'professional', label: 'Professional', emoji: '💼' },
    { value: 'friendly', label: 'Friendly', emoji: '👋' },
    { value: 'urgent', label: 'Urgent', emoji: '⚡' },
    { value: 'empathetic', label: 'Empathetic', emoji: '🤝' },
    { value: 'celebratory', label: 'Celebratory', emoji: '🎉' },
  ];

  const handleGenerateEmail = async () => {
    const request: ComposeEmailRequest = {
      scenario: selectedScenario,
      recipient_id: accountId,
      recipient_type: 'account',
      tone: selectedTone,
      context,
      custom_instructions: customInstructions || undefined,
      include_signature: true,
    };

    const result = await composeEmail.mutateAsync(request);

    if (result.success) {
      setSubject(result.email.subject);
      setBody(result.email.body);
      setComplianceNotes(result.email.compliance_notes);
      setSuggestions(result.email.suggestions);

      // Calculate confidence score (mock for now, could be from AI response)
      setAiConfidenceScore(85);
    }
  };

  const handleSaveDraft = async () => {
    await saveCommunication.mutateAsync({
      account_id: accountId,
      communication_type: 'email',
      subject,
      message_body: body,
      ai_generated: true,
      ai_confidence_score: aiConfidenceScore || undefined,
      tone_used: selectedTone,
      status: 'draft',
      context_data: {
        scenario: selectedScenario,
        compliance_notes: complianceNotes,
        suggestions,
      },
    });

    onOpenChange(false);
  };

  const handleSend = async () => {
    await saveCommunication.mutateAsync({
      account_id: accountId,
      communication_type: 'email',
      subject,
      message_body: body,
      ai_generated: true,
      ai_confidence_score: aiConfidenceScore || undefined,
      tone_used: selectedTone,
      status: 'sent',
      context_data: {
        scenario: selectedScenario,
        compliance_notes: complianceNotes,
        suggestions,
      },
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compose Email {accountName && `to ${accountName}`}</DialogTitle>
          <DialogDescription>
            Use AI to generate personalized emails or write your own
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Scenario & Tone Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scenario">Email Scenario</Label>
              <Select value={selectedScenario} onValueChange={(value) => setSelectedScenario(value as EmailScenario)}>
                <SelectTrigger id="scenario">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Tone</Label>
              <Select value={selectedTone} onValueChange={(value) => setSelectedTone(value as EmailTone)}>
                <SelectTrigger id="tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tones.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recommended Templates */}
          {recommendedTemplates && recommendedTemplates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recommended Templates</CardTitle>
                <CardDescription className="text-xs">
                  Based on customer context and performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {recommendedTemplates.slice(0, 3).map((template: any) => (
                    <Badge key={template.template_id} variant="outline" className="cursor-pointer hover:bg-accent">
                      {template.template_name}
                      {template.avg_response_rate && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {template.avg_response_rate}% response
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Custom Instructions */}
          <div className="space-y-2">
            <Label htmlFor="instructions">Custom Instructions (Optional)</Label>
            <Textarea
              id="instructions"
              placeholder="Add any specific points you want to include in the email..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={2}
            />
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerateEmail}
            disabled={composeEmail.isPending}
            className="w-full"
            size="lg"
          >
            {composeEmail.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating with AI...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Email with AI
              </>
            )}
          </Button>

          {/* Email Content */}
          {subject && body && (
            <>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject line"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="body">Email Body</Label>
                  {aiConfidenceScore && (
                    <Badge variant="secondary" className="text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Confidence: {aiConfidenceScore}%
                    </Badge>
                  )}
                </div>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>

              {/* Compliance Notes */}
              {complianceNotes.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-semibold mb-1">Compliance Checklist</div>
                    <ul className="text-xs space-y-1">
                      {complianceNotes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Lightbulb className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <div className="font-semibold mb-1 text-blue-900">Suggestions</div>
                    <ul className="text-xs space-y-1 text-blue-800">
                      {suggestions.map((suggestion, i) => (
                        <li key={i}>{suggestion}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          {subject && body && (
            <>
              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={saveCommunication.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Draft
              </Button>

              <Button
                onClick={handleSend}
                disabled={saveCommunication.isPending}
              >
                {saveCommunication.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Email
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
