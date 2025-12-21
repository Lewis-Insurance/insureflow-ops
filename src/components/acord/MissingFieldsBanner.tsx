/**
 * Missing Required Fields Banner
 *
 * Displays a prominent warning when ACORD form has:
 * - Missing required fields
 * - Conflict status fields
 * - Low confidence fields needing review
 *
 * Features:
 * - Summary count display
 * - Click to open review drawer
 * - Filter to required-only issues
 * - Real-time updates as fields change
 */

import React, { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertTriangle,
  XCircle,
  Eye,
  CheckCircle,
  ChevronRight,
  FileWarning,
  AlertCircle,
  Target,
} from 'lucide-react';
import { DraftField } from '@/services/DraftManager';

// ACORD form required fields by form type
const REQUIRED_FIELDS_BY_FORM: Record<string, string[]> = {
  '125': [
    'NamedInsured',
    'MailingAddress',
    'MailingCity',
    'MailingState',
    'MailingZip',
    'FEIN',
    'BusinessType',
    'YearsInBusiness',
  ],
  '126': [
    'NamedInsured',
    'PolicyNumber',
    'CarrierName',
    'EffectiveDate',
    'ExpirationDate',
    'GeneralAggregate',
    'EachOccurrence',
  ],
  '127': [
    'NamedInsured',
    'PolicyNumber',
    'CarrierName',
    'EffectiveDate',
    'ExpirationDate',
  ],
  '130': [
    'NamedInsured',
    'MailingAddress',
    'PolicyNumber',
    'EffectiveDate',
    'ExpirationDate',
    'NumVehicles',
  ],
  // Default for unknown forms
  default: [
    'NamedInsured',
    'PolicyNumber',
    'EffectiveDate',
    'ExpirationDate',
  ],
};

interface FieldIssue {
  field: string;
  type: 'missing' | 'conflict' | 'review' | 'low_confidence';
  value: string | null;
  confidence?: number;
  message: string;
}

interface MissingFieldsBannerProps {
  formNumber?: string;
  fields: Record<string, DraftField>;
  onFieldClick?: (fieldName: string) => void;
  onFieldChange?: (fieldName: string, value: string) => void;
}

export function MissingFieldsBanner({
  formNumber,
  fields,
  onFieldClick,
  onFieldChange,
}: MissingFieldsBannerProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'required' | 'all'>('required');

  // Calculate issues
  const { issues, summary } = useMemo(() => {
    const requiredFields = REQUIRED_FIELDS_BY_FORM[formNumber || ''] ||
      REQUIRED_FIELDS_BY_FORM.default;

    const allIssues: FieldIssue[] = [];

    // Check required fields
    for (const fieldName of requiredFields) {
      const field = fields[fieldName];

      if (!field || field.status === 'NOT_FOUND' || !field.value) {
        allIssues.push({
          field: fieldName,
          type: 'missing',
          value: null,
          message: 'Required field is missing',
        });
      } else if (field.status === 'CONFLICT') {
        allIssues.push({
          field: fieldName,
          type: 'conflict',
          value: field.value,
          confidence: field.confidence,
          message: 'Field has conflicting values',
        });
      } else if (field.status === 'NEEDS_REVIEW' || field.status === 'NEEDS_VERIFICATION') {
        allIssues.push({
          field: fieldName,
          type: 'review',
          value: field.value,
          confidence: field.confidence,
          message: 'Field needs verification',
        });
      }
    }

    // Check all fields for low confidence
    for (const [fieldName, field] of Object.entries(fields)) {
      if (field.confidence !== undefined && field.confidence < 0.7) {
        if (!allIssues.some(i => i.field === fieldName)) {
          allIssues.push({
            field: fieldName,
            type: 'low_confidence',
            value: field.value,
            confidence: field.confidence,
            message: `Low confidence (${Math.round((field.confidence || 0) * 100)}%)`,
          });
        }
      }
    }

    const summary = {
      missing: allIssues.filter(i => i.type === 'missing').length,
      conflicts: allIssues.filter(i => i.type === 'conflict').length,
      review: allIssues.filter(i => i.type === 'review').length,
      lowConfidence: allIssues.filter(i => i.type === 'low_confidence').length,
      total: allIssues.length,
      requiredMissing: allIssues.filter(i =>
        i.type === 'missing' &&
        requiredFields.includes(i.field)
      ).length,
    };

    return { issues: allIssues, summary };
  }, [formNumber, fields]);

  // Don't show if no issues
  if (summary.total === 0) {
    return null;
  }

  const requiredIssues = issues.filter(i =>
    i.type === 'missing' || i.type === 'conflict'
  );

  const getIssueIcon = (type: FieldIssue['type']) => {
    switch (type) {
      case 'missing':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'conflict':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'review':
        return <Eye className="h-4 w-4 text-yellow-500" />;
      case 'low_confidence':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getIssueBadgeColor = (type: FieldIssue['type']) => {
    switch (type) {
      case 'missing':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'conflict':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low_confidence':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  return (
    <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      {/* Banner */}
      <SheetTrigger asChild>
        <Alert
          variant="destructive"
          className="cursor-pointer hover:bg-red-100 transition-colors"
        >
          <FileWarning className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            <span>Form Validation Issues</span>
            <ChevronRight className="h-4 w-4" />
          </AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            {summary.missing > 0 && (
              <Badge variant="outline" className="bg-red-100 text-red-800">
                {summary.missing} missing
              </Badge>
            )}
            {summary.conflicts > 0 && (
              <Badge variant="outline" className="bg-orange-100 text-orange-800">
                {summary.conflicts} conflict{summary.conflicts !== 1 ? 's' : ''}
              </Badge>
            )}
            {summary.review > 0 && (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                {summary.review} needs review
              </Badge>
            )}
            <span className="text-sm ml-auto">Click to review</span>
          </AlertDescription>
        </Alert>
      </SheetTrigger>

      {/* Drawer */}
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-red-500" />
            Form Issues ({summary.total})
          </SheetTitle>
          <SheetDescription>
            Review and resolve issues before submitting
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="required" className="flex-1">
              Required ({requiredIssues.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="flex-1">
              All Issues ({issues.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="required">
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-3 pr-4">
                {requiredIssues.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p>All required fields are complete!</p>
                  </div>
                ) : (
                  requiredIssues.map(issue => (
                    <Card
                      key={issue.field}
                      className={`border-l-4 ${
                        issue.type === 'missing' ? 'border-l-red-500' : 'border-l-orange-500'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {getIssueIcon(issue.type)}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <Label className="font-medium">{issue.field}</Label>
                              <Badge
                                variant="outline"
                                className={getIssueBadgeColor(issue.type)}
                              >
                                {issue.type === 'missing' ? 'Required' : 'Conflict'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {issue.message}
                            </p>

                            {/* Input for missing fields */}
                            {issue.type === 'missing' && (
                              <Input
                                placeholder={`Enter ${issue.field}`}
                                onChange={(e) => onFieldChange?.(issue.field, e.target.value)}
                              />
                            )}

                            {/* Show current value for conflicts */}
                            {issue.type === 'conflict' && issue.value && (
                              <div className="text-sm bg-gray-50 p-2 rounded">
                                Current: <span className="font-mono">{issue.value}</span>
                              </div>
                            )}

                            {/* Navigate to field button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2"
                              onClick={() => {
                                onFieldClick?.(issue.field);
                                setIsDrawerOpen(false);
                              }}
                            >
                              <Target className="h-3 w-3 mr-1" />
                              Go to field
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="all">
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-3 pr-4">
                {issues.map(issue => (
                  <Card
                    key={issue.field}
                    className={`border-l-4 ${
                      issue.type === 'missing' ? 'border-l-red-500' :
                      issue.type === 'conflict' ? 'border-l-orange-500' :
                      'border-l-yellow-500'
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {getIssueIcon(issue.type)}
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <Label className="font-medium">{issue.field}</Label>
                            <div className="flex items-center gap-2">
                              {issue.confidence !== undefined && (
                                <Badge variant="outline">
                                  {Math.round(issue.confidence * 100)}%
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={getIssueBadgeColor(issue.type)}
                              >
                                {issue.type.replace('_', ' ')}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {issue.message}
                          </p>

                          {issue.value && (
                            <div className="text-sm bg-gray-50 p-2 rounded">
                              Value: <span className="font-mono">{issue.value}</span>
                            </div>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              onFieldClick?.(issue.field);
                              setIsDrawerOpen(false);
                            }}
                          >
                            <Target className="h-3 w-3 mr-1" />
                            Go to field
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
