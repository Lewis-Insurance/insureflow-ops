// ============================================
// Intake Renderer Component
// Public-facing form renderer with auto-save and validation
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { logger } from '@/lib/logger';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { IntakeQuestionRenderer } from './questions';
import type { IntakeTemplate, IntakeQuestion, IntakeSettings, IntakeBranding } from '@/types/intake';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Send,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Clock,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface IntakeRendererProps {
  template: IntakeTemplate;
  initialResponses?: Record<string, any>;
  onSaveDraft?: (responses: Record<string, any>) => Promise<void>;
  onSubmit: (responses: Record<string, any>) => Promise<void>;
  onAutoSave?: (responses: Record<string, any>) => void;
  autoSaveInterval?: number;
  showProgressBar?: boolean;
  readOnly?: boolean;
}

interface SectionState {
  id: string;
  title: string;
  questions: IntakeQuestion[];
  isComplete: boolean;
  hasErrors: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function IntakeRenderer({
  template,
  initialResponses = {},
  onSaveDraft,
  onSubmit,
  onAutoSave,
  autoSaveInterval = 30000,
  showProgressBar = true,
  readOnly = false,
}: IntakeRendererProps) {
  const [responses, setResponses] = useState<Record<string, any>>(initialResponses);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Group questions by section
  const sections = useMemo(() => {
    const sectionMap = new Map<string, IntakeQuestion[]>();

    template.questions.forEach((q) => {
      const sectionId = q.section || 'default';
      if (!sectionMap.has(sectionId)) {
        sectionMap.set(sectionId, []);
      }
      sectionMap.get(sectionId)!.push(q);
    });

    const result: SectionState[] = [];
    sectionMap.forEach((questions, id) => {
      // Find section header question for title
      const headerQuestion = questions.find((q) => q.type === 'section_header');
      const title = headerQuestion?.label || template.dynamic_sections?.[id]?.[0] || `Section ${result.length + 1}`;

      const nonHeaderQuestions = questions.filter((q) => q.type !== 'section_header');
      const isComplete = nonHeaderQuestions
        .filter((q) => q.required)
        .every((q) => {
          const value = responses[q.id];
          return value !== null && value !== undefined && value !== '';
        });

      const hasErrors = nonHeaderQuestions.some((q) => errors[q.id]);

      result.push({
        id,
        title,
        questions,
        isComplete,
        hasErrors,
      });
    });

    return result;
  }, [template, responses, errors]);

  const currentSection = sections[currentSectionIndex];
  const isFirstSection = currentSectionIndex === 0;
  const isLastSection = currentSectionIndex === sections.length - 1;

  // Calculate progress
  const progress = useMemo(() => {
    const requiredQuestions = template.questions.filter(
      (q) => q.required && q.type !== 'section_header' && q.type !== 'info_text'
    );
    const completedQuestions = requiredQuestions.filter((q) => {
      const value = responses[q.id];
      return value !== null && value !== undefined && value !== '';
    });

    return {
      total: requiredQuestions.length,
      completed: completedQuestions.length,
      percentage: requiredQuestions.length > 0
        ? Math.round((completedQuestions.length / requiredQuestions.length) * 100)
        : 100,
    };
  }, [template.questions, responses]);

  // Check if question should be displayed (conditional logic)
  const shouldShowQuestion = useCallback(
    (question: IntakeQuestion): boolean => {
      if (!question.conditionalDisplay) return true;

      const { dependsOn, operator, value, showWhenTrue = true } = question.conditionalDisplay;
      const dependentValue = responses[dependsOn];

      let conditionMet = false;
      switch (operator) {
        case 'equals':
          conditionMet = dependentValue === value;
          break;
        case 'not_equals':
          conditionMet = dependentValue !== value;
          break;
        case 'contains':
          conditionMet = String(dependentValue || '').includes(String(value));
          break;
        case 'not_contains':
          conditionMet = !String(dependentValue || '').includes(String(value));
          break;
        case 'greater_than':
          conditionMet = Number(dependentValue) > Number(value);
          break;
        case 'less_than':
          conditionMet = Number(dependentValue) < Number(value);
          break;
        case 'is_empty':
          conditionMet = !dependentValue || dependentValue === '';
          break;
        case 'is_not_empty':
          conditionMet = !!dependentValue && dependentValue !== '';
          break;
        default:
          conditionMet = false;
      }

      return showWhenTrue ? conditionMet : !conditionMet;
    },
    [responses]
  );

  // Auto-save effect
  useEffect(() => {
    if (!onAutoSave || readOnly || submitted) return;

    const timer = setInterval(() => {
      onAutoSave(responses);
      setLastSaved(new Date());
    }, autoSaveInterval);

    return () => clearInterval(timer);
  }, [responses, onAutoSave, autoSaveInterval, readOnly, submitted]);

  // Also save to localStorage
  useEffect(() => {
    if (readOnly || submitted) return;

    const key = `intake_draft_${template.id}`;
    localStorage.setItem(key, JSON.stringify({ responses, timestamp: Date.now() }));
  }, [responses, template.id, readOnly, submitted]);

  // Handle field change
  const handleChange = (questionId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));

    // Clear error when field is modified
    if (errors[questionId]) {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    }
  };

  // Validate current section
  const validateSection = useCallback((): boolean => {
    const sectionErrors: Record<string, string> = {};
    let isValid = true;

    currentSection.questions.forEach((q) => {
      if (!shouldShowQuestion(q)) return;
      if (q.type === 'section_header' || q.type === 'info_text') return;

      const value = responses[q.id];

      // Required check
      if (q.required && (value === null || value === undefined || value === '')) {
        sectionErrors[q.id] = 'This field is required';
        isValid = false;
        return;
      }

      // Pattern validation
      if (q.validation?.pattern && value) {
        const regex = new RegExp(q.validation.pattern);
        if (!regex.test(String(value))) {
          sectionErrors[q.id] = q.validation.patternMessage || 'Invalid format';
          isValid = false;
        }
      }

      // Min/max length
      if (q.validation?.minLength && String(value || '').length < q.validation.minLength) {
        sectionErrors[q.id] = `Minimum length is ${q.validation.minLength} characters`;
        isValid = false;
      }

      if (q.validation?.maxLength && String(value || '').length > q.validation.maxLength) {
        sectionErrors[q.id] = `Maximum length is ${q.validation.maxLength} characters`;
        isValid = false;
      }

      // Min/max value for numbers
      if (q.validation?.min !== undefined && Number(value) < q.validation.min) {
        sectionErrors[q.id] = `Minimum value is ${q.validation.min}`;
        isValid = false;
      }

      if (q.validation?.max !== undefined && Number(value) > q.validation.max) {
        sectionErrors[q.id] = `Maximum value is ${q.validation.max}`;
        isValid = false;
      }
    });

    setErrors((prev) => ({ ...prev, ...sectionErrors }));
    return isValid;
  }, [currentSection, responses, shouldShowQuestion]);

  // Navigate sections
  const goToNextSection = () => {
    if (!validateSection()) return;

    if (isLastSection) {
      setShowSubmitDialog(true);
    } else {
      setCurrentSectionIndex((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToPrevSection = () => {
    setCurrentSectionIndex((prev) => Math.max(0, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save draft
  const handleSaveDraft = async () => {
    if (!onSaveDraft) return;

    setIsSaving(true);
    try {
      await onSaveDraft(responses);
      setLastSaved(new Date());
    } finally {
      setIsSaving(false);
    }
  };

  // Submit form
  const handleSubmit = async () => {
    setShowSubmitDialog(false);
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmit(responses);
      setSubmitted(true);

      // Clear localStorage draft
      localStorage.removeItem(`intake_draft_${template.id}`);
    } catch (error) {
      logger.error('Submission failed:', error);
      setSubmitError('Failed to submit form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submitted state
  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <Card>
          <CardContent className="pt-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Submission Complete</h2>
            <p className="text-muted-foreground mb-6">
              {template.settings.customThankYouMessage ||
                'Thank you for completing this form. We will review your submission and get back to you soon.'}
            </p>
            {template.settings.redirectUrl && (
              <Button onClick={() => window.location.href = template.settings.redirectUrl!}>
                Continue
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header with branding */}
      {template.branding && (
        <div className="mb-8 text-center">
          {template.branding.logoUrl && (
            <img
              src={template.branding.logoUrl}
              alt={template.branding.companyName || 'Logo'}
              className="h-12 mx-auto mb-4"
            />
          )}
          {template.branding.companyName && (
            <p className="text-muted-foreground">{template.branding.companyName}</p>
          )}
        </div>
      )}

      {/* Form header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{template.name}</h1>
        {template.description && (
          <p className="text-muted-foreground mt-1">{template.description}</p>
        )}
      </div>

      {/* Progress bar */}
      {showProgressBar && template.settings.showProgressBar && (
        <div className="mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{progress.percentage}% complete</span>
          </div>
          <Progress value={progress.percentage} className="h-2" />
        </div>
      )}

      {/* Section tabs */}
      {sections.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {sections.map((section, index) => (
            <Button
              key={section.id}
              variant={index === currentSectionIndex ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (index < currentSectionIndex || validateSection()) {
                  setCurrentSectionIndex(index);
                }
              }}
              className="shrink-0"
            >
              {section.isComplete && !section.hasErrors && (
                <CheckCircle className="mr-1 h-3 w-3 text-green-500" />
              )}
              {section.hasErrors && (
                <AlertCircle className="mr-1 h-3 w-3 text-red-500" />
              )}
              {section.title}
            </Button>
          ))}
        </div>
      )}

      {/* Questions */}
      <Card>
        <CardHeader>
          <CardTitle>{currentSection.title}</CardTitle>
          {lastSaved && (
            <CardDescription className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last saved {lastSaved.toLocaleTimeString()}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {currentSection.questions
            .filter(shouldShowQuestion)
            .map((question) => (
              <IntakeQuestionRenderer
                key={question.id}
                question={question}
                value={responses[question.id]}
                onChange={(value) => handleChange(question.id, value)}
                error={errors[question.id]}
                disabled={readOnly}
              />
            ))}

          {/* Submission error alert */}
          {submitError && (
            <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{submitError}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex gap-2">
            {!isFirstSection && (
              <Button variant="outline" onClick={goToPrevSection}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
            )}
            {template.settings.allowSaveDraft && onSaveDraft && (
              <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
                {isSaving ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Draft
              </Button>
            )}
          </div>
          <Button onClick={goToNextSection} disabled={isSubmitting}>
            {isLastSection ? (
              <>
                {isSubmitting ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Submit
              </>
            ) : (
              <>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Submit confirmation dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ready to submit?</AlertDialogTitle>
            <AlertDialogDescription>
              Please review your answers before submitting. You won't be able to edit
              your responses after submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Review Answers</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>
              Submit Form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom branding footer (sanitized for XSS protection) */}
      {template.branding?.footerHtml && (
        <div
          className="mt-8 text-center text-sm text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(template.branding.footerHtml) }}
        />
      )}
    </div>
  );
}

export default IntakeRenderer;
